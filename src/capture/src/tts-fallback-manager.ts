import { EventEmitter } from 'events';
import { TTSManager, TTSMode, TargetLanguage } from './tts-manager';

export interface TTSFallbackConfig {
  enablePolly: boolean;
  enableLocalTTS: boolean;
  enableTextOnly: boolean;
  pollyTimeout: number; // milliseconds
  localTTSTimeout: number; // milliseconds
  maxRetries: number;
  retryDelay: number; // milliseconds
}

export interface TTSResult {
  success: boolean;
  audioUrl?: string;
  duration?: number;
  size?: number;
  voiceType?: 'neural' | 'standard' | 'local';
  fallbackUsed: 'polly' | 'local' | 'text-only';
  error?: string;
  latency: number; // milliseconds
}

export interface FallbackNotification {
  type: 'fallback-triggered' | 'fallback-recovered' | 'all-fallbacks-failed';
  originalMethod: 'polly' | 'local';
  fallbackMethod: 'local' | 'text-only' | 'none';
  error: string;
  timestamp: number;
  language: TargetLanguage;
  text: string;
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
  private ttsManager: TTSManager;
  private config: TTSFallbackConfig;
  private performanceMetrics: PerformanceMetrics;
  private requestHistory: Array<{
    timestamp: number;
    method: 'polly' | 'local' | 'text-only';
    success: boolean;
    latency: number;
    language: TargetLanguage;
  }> = [];

  constructor(ttsManager: TTSManager, config: TTSFallbackConfig = {
    enablePolly: true,
    enableLocalTTS: true,
    enableTextOnly: true,
    pollyTimeout: 5000,
    localTTSTimeout: 3000,
    maxRetries: 2,
    retryDelay: 1000
  }) {
    super();
    this.ttsManager = ttsManager;
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

    // Listen to TTS manager events for error detection
    this.ttsManager.on('error', (error) => {
      this.handleTTSError(error);
    });
  }

  /**
   * Generate audio with fallback chain: Polly → Local TTS → Text-only
   */
  async generateAudioWithFallback(text: string, language: TargetLanguage): Promise<TTSResult> {
    const startTime = Date.now();
    let lastError: string = '';

    // Increment total requests
    this.performanceMetrics.totalRequests++;

    try {
      // Primary: AWS Polly (if enabled and configured)
      if (this.config.enablePolly && this.shouldTryPolly()) {
        try {
          const pollyResult = await this.tryPollyWithTimeout(text, language);
          if (pollyResult) {
            const latency = Date.now() - startTime;
            this.recordSuccess('polly', latency, language);
            
            return {
              success: true,
              audioUrl: pollyResult.audioUrl,
              duration: pollyResult.duration,
              size: pollyResult.size,
              voiceType: pollyResult.voiceType,
              fallbackUsed: 'polly',
              latency
            };
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : 'Polly TTS failed';
          this.recordFailure('polly', Date.now() - startTime, language);
          console.warn('Polly TTS failed, attempting fallback:', lastError);
          
          // Emit fallback notification
          this.emitFallbackNotification({
            type: 'fallback-triggered',
            originalMethod: 'polly',
            fallbackMethod: 'local',
            error: lastError,
            timestamp: Date.now(),
            language,
            text: text.substring(0, 50) + '...'
          });
        }
      }

      // Secondary: Local TTS (if enabled)
      if (this.config.enableLocalTTS) {
        try {
          const localResult = await this.tryLocalTTSWithTimeout(text, language);
          if (localResult) {
            const latency = Date.now() - startTime;
            this.recordSuccess('local', latency, language);
            
            return {
              success: true,
              fallbackUsed: 'local',
              voiceType: 'local',
              latency
            };
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : 'Local TTS failed';
          this.recordFailure('local', Date.now() - startTime, language);
          console.warn('Local TTS failed, falling back to text-only:', lastError);
          
          // Emit fallback notification
          this.emitFallbackNotification({
            type: 'fallback-triggered',
            originalMethod: 'local',
            fallbackMethod: 'text-only',
            error: lastError,
            timestamp: Date.now(),
            language,
            text: text.substring(0, 50) + '...'
          });
        }
      }

      // Tertiary: Text-only (always available if enabled)
      if (this.config.enableTextOnly) {
        const latency = Date.now() - startTime;
        this.recordSuccess('text-only', latency, language);
        
        return {
          success: true,
          fallbackUsed: 'text-only',
          latency
        };
      }

      // All fallbacks failed
      const latency = Date.now() - startTime;
      this.emitFallbackNotification({
        type: 'all-fallbacks-failed',
        originalMethod: 'polly',
        fallbackMethod: 'none',
        error: lastError || 'All TTS methods disabled',
        timestamp: Date.now(),
        language,
        text: text.substring(0, 50) + '...'
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
  private async tryPollyWithTimeout(text: string, language: TargetLanguage): Promise<any> {
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Polly timeout')), this.config.pollyTimeout);
        });

        const pollyPromise = this.ttsManager.generateAudio(text, language);
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
   * Try Local TTS with timeout (placeholder for Web Speech API integration)
   */
  private async tryLocalTTSWithTimeout(text: string, language: TargetLanguage): Promise<any> {
    // This would integrate with Web Speech API or other local TTS
    // For now, we simulate local TTS behavior
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Local TTS timeout')), this.config.localTTSTimeout);
    });

    const localTTSPromise = new Promise((resolve, reject) => {
      // Simulate local TTS processing
      setTimeout(() => {
        // Check if we're in a browser environment with speech synthesis support
        if (typeof globalThis !== 'undefined' && 
            'speechSynthesis' in globalThis && 
            globalThis.speechSynthesis) {
          resolve({ success: true, method: 'local' });
        } else {
          reject(new Error('Local TTS not available in this environment'));
        }
      }, 500); // Simulate processing time
    });

    try {
      return await Promise.race([localTTSPromise, timeoutPromise]);
    } catch (error) {
      throw new Error(`Local TTS failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if Polly should be attempted based on recent performance
   */
  private shouldTryPolly(): boolean {
    // Don't try Polly if success rate is too low (below 20% in last 10 requests)
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
  private recordSuccess(method: 'polly' | 'local' | 'text-only', latency: number, language: TargetLanguage): void {
    this.requestHistory.push({
      timestamp: Date.now(),
      method,
      success: true,
      latency,
      language
    });

    // Keep only last 100 requests
    if (this.requestHistory.length > 100) {
      this.requestHistory = this.requestHistory.slice(-100);
    }
  }

  /**
   * Record failed TTS operation
   */
  private recordFailure(method: 'polly' | 'local' | 'text-only', latency: number, language: TargetLanguage): void {
    this.requestHistory.push({
      timestamp: Date.now(),
      method,
      success: false,
      latency,
      language
    });

    this.performanceMetrics.fallbackTriggerCount++;

    // Keep only last 100 requests
    if (this.requestHistory.length > 100) {
      this.requestHistory = this.requestHistory.slice(-100);
    }
  }

  /**
   * Update performance metrics based on request history
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
   * Handle TTS errors from the TTS manager
   */
  private handleTTSError(error: any): void {
    console.error('TTS Error detected:', error);
    
    // Emit error for monitoring
    this.emit('tts-error', {
      type: error.type || 'unknown',
      message: error.error || error.message || 'Unknown TTS error',
      timestamp: Date.now(),
      language: error.language,
      text: error.text
    });
  }

  /**
   * Emit fallback notification to clients
   */
  private emitFallbackNotification(notification: FallbackNotification): void {
    this.emit('fallback-notification', notification);
    
    // Log for debugging
    console.log(`TTS Fallback: ${notification.type} - ${notification.originalMethod} → ${notification.fallbackMethod}`);
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    this.updatePerformanceMetrics();
    return { ...this.performanceMetrics };
  }

  /**
   * Get fallback configuration
   */
  getConfig(): TTSFallbackConfig {
    return { ...this.config };
  }

  /**
   * Update fallback configuration
   */
  updateConfig(newConfig: Partial<TTSFallbackConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('config-updated', this.config);
  }

  /**
   * Reset performance metrics
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
   * Test all TTS methods
   */
  async testAllMethods(language: TargetLanguage = 'en-US'): Promise<{
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
        const pollyResult = await this.tryPollyWithTimeout(testText, language);
        results.polly = !!pollyResult;
      } catch (error) {
        console.log('Polly test failed:', error);
      }
    }

    // Test Local TTS
    if (this.config.enableLocalTTS) {
      try {
        const localResult = await this.tryLocalTTSWithTimeout(testText, language);
        results.local = !!localResult;
      } catch (error) {
        console.log('Local TTS test failed:', error);
      }
    }

    return results;
  }

  /**
   * Get recent request history for debugging
   */
  getRequestHistory(limit: number = 20): Array<{
    timestamp: number;
    method: string;
    success: boolean;
    latency: number;
    language: TargetLanguage;
  }> {
    return this.requestHistory.slice(-limit);
  }

  // Private utility methods

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}