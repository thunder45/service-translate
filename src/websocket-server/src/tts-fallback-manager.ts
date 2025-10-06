import { EventEmitter } from 'events';
import { TTSService } from './tts-service';
import { TargetLanguage } from './types';

export interface TTSFallbackConfig {
  enablePolly: boolean;
  enableLocalTTS: boolean;
  enableTextOnly: boolean;
  pollyTimeout: number;
  localTTSTimeout: number;
  maxRetries: number;
  retryDelay: number;
}

export interface TTSResult {
  success: boolean;
  audioBuffer?: Buffer;
  audioUrl?: string;
  duration?: number;
  voiceType?: 'neural' | 'standard' | 'local';
  fallbackUsed: 'polly' | 'local' | 'text-only';
  error?: string;
  latency: number;
}

export interface FallbackNotification {
  type: 'fallback-triggered' | 'fallback-recovered' | 'all-fallbacks-failed';
  originalMethod: 'polly' | 'local';
  fallbackMethod: 'local' | 'text-only' | 'none';
  error: string;
  timestamp: number;
  language: TargetLanguage;
  sessionId?: string;
}

export interface PerformanceMetrics {
  pollySuccessRate: number;
  pollyAverageLatency: number;
  localTTSSuccessRate: number;
  localTTSAverageLatency: number;
  fallbackTriggerCount: number;
  totalRequests: number;
  lastUpdated: Date;
}

export class TTSFallbackManager extends EventEmitter {
  private ttsService: TTSService;
  private config: TTSFallbackConfig;
  private performanceMetrics: PerformanceMetrics;
  private requestHistory: Array<{
    timestamp: number;
    method: 'polly' | 'local' | 'text-only';
    success: boolean;
    latency: number;
    language: TargetLanguage;
    sessionId?: string;
  }> = [];

  constructor(ttsService: TTSService, config: TTSFallbackConfig = {
    enablePolly: true,
    enableLocalTTS: true,
    enableTextOnly: true,
    pollyTimeout: 5000,
    localTTSTimeout: 3000,
    maxRetries: 2,
    retryDelay: 1000
  }) {
    super();
    this.ttsService = ttsService;
    this.config = config;
    this.performanceMetrics = {
      pollySuccessRate: 100,
      pollyAverageLatency: 0,
      localTTSSuccessRate: 100,
      localTTSAverageLatency: 0,
      fallbackTriggerCount: 0,
      totalRequests: 0,
      lastUpdated: new Date()
    };
  }

  /**
   * Generate audio with fallback chain: Polly → Local TTS → Text-only
   */
  async generateAudioWithFallback(
    text: string, 
    language: TargetLanguage, 
    voiceType: 'neural' | 'standard' = 'neural',
    sessionId?: string
  ): Promise<TTSResult> {
    const startTime = Date.now();
    let lastError: string = '';

    this.performanceMetrics.totalRequests++;

    try {
      // Primary: AWS Polly (if enabled)
      if (this.config.enablePolly && this.shouldTryPolly()) {
        try {
          const pollyResult = await this.tryPollyWithTimeout(text, language, voiceType);
          if (pollyResult) {
            const latency = Date.now() - startTime;
            this.recordSuccess('polly', latency, language, sessionId);
            
            return {
              success: true,
              audioBuffer: pollyResult.audioBuffer,
              duration: pollyResult.duration,
              voiceType: pollyResult.voiceType,
              fallbackUsed: 'polly',
              latency
            };
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : 'Polly TTS failed';
          this.recordFailure('polly', Date.now() - startTime, language, sessionId);
          console.warn('Polly TTS failed, attempting fallback:', lastError);
          
          // Emit fallback notification
          this.emitFallbackNotification({
            type: 'fallback-triggered',
            originalMethod: 'polly',
            fallbackMethod: 'local',
            error: lastError,
            timestamp: Date.now(),
            language,
            sessionId
          });
        }
      }

      // Secondary: Local TTS (notify clients to use local TTS)
      if (this.config.enableLocalTTS) {
        const latency = Date.now() - startTime;
        this.recordSuccess('local', latency, language, sessionId);
        
        // Return success but indicate clients should use local TTS
        return {
          success: true,
          fallbackUsed: 'local',
          voiceType: 'local',
          latency
        };
      }

      // Tertiary: Text-only
      if (this.config.enableTextOnly) {
        const latency = Date.now() - startTime;
        this.recordSuccess('text-only', latency, language, sessionId);
        
        return {
          success: true,
          fallbackUsed: 'text-only',
          latency
        };
      }

      // All fallbacks failed or disabled
      const latency = Date.now() - startTime;
      this.emitFallbackNotification({
        type: 'all-fallbacks-failed',
        originalMethod: 'polly',
        fallbackMethod: 'none',
        error: lastError || 'All TTS methods disabled',
        timestamp: Date.now(),
        language,
        sessionId
      });

      return {
        success: false,
        fallbackUsed: 'text-only',
        error: lastError || 'All TTS methods failed or disabled',
        latency
      };

    } finally {
      this.updatePerformanceMetrics();
    }
  }

  /**
   * Try Polly TTS with timeout and retry logic
   */
  private async tryPollyWithTimeout(
    text: string, 
    language: TargetLanguage, 
    voiceType: 'neural' | 'standard'
  ): Promise<any> {
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Polly timeout')), this.config.pollyTimeout);
        });

        const pollyPromise = this.ttsService.synthesizeSpeech(text, language, voiceType);
        const result = await Promise.race([pollyPromise, timeoutPromise]);
        
        if (result) {
          return result;
        }
      } catch (error) {
        if (attempt < this.config.maxRetries) {
          console.log(`Polly attempt ${attempt + 1} failed, retrying in ${this.config.retryDelay}ms`);
          await this.delay(this.config.retryDelay);
        } else {
          throw error;
        }
      }
    }
    
    throw new Error('Polly TTS failed after all retries');
  }

  /**
   * Check if Polly should be attempted based on recent performance
   */
  private shouldTryPolly(): boolean {
    const recentRequests = this.requestHistory
      .filter(r => r.method === 'polly' && Date.now() - r.timestamp < 300000) // Last 5 minutes
      .slice(-10); // Last 10 requests

    if (recentRequests.length >= 5) {
      const successRate = recentRequests.filter(r => r.success).length / recentRequests.length;
      return successRate > 0.2; // 20% threshold
    }

    return true; // Try Polly if we don't have enough data
  }

  /**
   * Record successful TTS operation
   */
  private recordSuccess(
    method: 'polly' | 'local' | 'text-only', 
    latency: number, 
    language: TargetLanguage,
    sessionId?: string
  ): void {
    this.requestHistory.push({
      timestamp: Date.now(),
      method,
      success: true,
      latency,
      language,
      sessionId
    });

    // Keep only last 100 requests
    if (this.requestHistory.length > 100) {
      this.requestHistory = this.requestHistory.slice(-100);
    }
  }

  /**
   * Record failed TTS operation
   */
  private recordFailure(
    method: 'polly' | 'local' | 'text-only', 
    latency: number, 
    language: TargetLanguage,
    sessionId?: string
  ): void {
    this.requestHistory.push({
      timestamp: Date.now(),
      method,
      success: false,
      latency,
      language,
      sessionId
    });

    this.performanceMetrics.fallbackTriggerCount++;

    // Keep only last 100 requests
    if (this.requestHistory.length > 100) {
      this.requestHistory = this.requestHistory.slice(-100);
    }
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(): void {
    const now = Date.now();
    const recentRequests = this.requestHistory.filter(r => now - r.timestamp < 300000); // Last 5 minutes

    // Calculate Polly metrics
    const pollyRequests = recentRequests.filter(r => r.method === 'polly');
    if (pollyRequests.length > 0) {
      this.performanceMetrics.pollySuccessRate = 
        (pollyRequests.filter(r => r.success).length / pollyRequests.length) * 100;
      this.performanceMetrics.pollyAverageLatency = 
        pollyRequests.reduce((sum, r) => sum + r.latency, 0) / pollyRequests.length;
    }

    // Calculate Local TTS metrics
    const localRequests = recentRequests.filter(r => r.method === 'local');
    if (localRequests.length > 0) {
      this.performanceMetrics.localTTSSuccessRate = 
        (localRequests.filter(r => r.success).length / localRequests.length) * 100;
      this.performanceMetrics.localTTSAverageLatency = 
        localRequests.reduce((sum, r) => sum + r.latency, 0) / localRequests.length;
    }

    this.performanceMetrics.lastUpdated = new Date();
  }

  /**
   * Emit fallback notification
   */
  private emitFallbackNotification(notification: FallbackNotification): void {
    this.emit('fallback-notification', notification);
    
    // Log for debugging
    console.log(`TTS Fallback: ${notification.type} - ${notification.originalMethod} → ${notification.fallbackMethod}`);
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    this.updatePerformanceMetrics();
    return { ...this.performanceMetrics };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<TTSFallbackConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('config-updated', this.config);
  }

  /**
   * Get configuration
   */
  getConfig(): TTSFallbackConfig {
    return { ...this.config };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.requestHistory = [];
    this.performanceMetrics = {
      pollySuccessRate: 100,
      pollyAverageLatency: 0,
      localTTSSuccessRate: 100,
      localTTSAverageLatency: 0,
      fallbackTriggerCount: 0,
      totalRequests: 0,
      lastUpdated: new Date()
    };
  }

  /**
   * Test TTS capabilities
   */
  async testTTSCapabilities(language: TargetLanguage = 'en'): Promise<{
    polly: boolean;
    local: boolean;
    textOnly: boolean;
  }> {
    const testText = 'Test message for TTS verification';
    
    const results = {
      polly: false,
      local: false,
      textOnly: true // Always available
    };

    // Test Polly
    if (this.config.enablePolly) {
      try {
        const pollyResult = await this.tryPollyWithTimeout(testText, language, 'standard');
        results.polly = !!pollyResult;
      } catch (error) {
        console.log('Polly test failed:', error);
      }
    }

    // Local TTS is handled by clients, so we assume it's available if enabled
    results.local = this.config.enableLocalTTS;

    return results;
  }

  /**
   * Get request history for debugging
   */
  getRequestHistory(limit: number = 20): Array<{
    timestamp: number;
    method: string;
    success: boolean;
    latency: number;
    language: TargetLanguage;
    sessionId?: string;
  }> {
    return this.requestHistory.slice(-limit);
  }

  // Private utility methods
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}