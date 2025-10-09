import { EventEmitter } from 'events';
import { DirectTranscribeClient } from './direct-transcribe-client';
import { TranslationService } from './translation-service';
import { AudioCapture } from './audio-capture';
import { HolyricsIntegration, HolyricsConfig } from './holyrics-integration';
import { TTSManager, TTSMode, TargetLanguage } from './tts-manager';
import { WebSocketManager, SessionConfig } from './websocket-manager';
import { CostTracker } from './cost-tracker';

interface TTSConfig {
  mode: TTSMode;
  host?: string;
  port?: number;
}

interface StreamingConfig {
  region: string;
  identityPoolId: string;
  userPoolId: string;
  jwtToken: string;
  sourceLanguage: string;
  targetLanguages: string[];
  sampleRate: number;
  audioDevice?: string;
  holyrics?: HolyricsConfig;
  tts?: TTSConfig;
}

export class DirectStreamingManager extends EventEmitter {
  private transcribeClient: DirectTranscribeClient;
  private translationService: TranslationService;
  private audioCapture: AudioCapture;
  private holyricsIntegration?: HolyricsIntegration;
  private ttsManager?: TTSManager;
  private webSocketManager?: WebSocketManager;
  private costTracker: CostTracker;
  private config: StreamingConfig;
  private isActive = false;
  private audioCache: Map<string, string> = new Map(); // Cache for generated audio URLs

  private mapToTargetLanguages(languages: string[]): TargetLanguage[] {
    const languageMap: Record<string, TargetLanguage> = {
      'en': 'en-US',
      'es': 'es-ES',
      'fr': 'fr-FR',
      'de': 'de-DE',
      'it': 'it-IT'
    };
    return languages.map(lang => languageMap[lang] || `${lang}-${lang.toUpperCase()}` as TargetLanguage);
  }

  constructor(config: StreamingConfig, webSocketManager?: WebSocketManager | null) {
    super();
    this.config = config;

    this.transcribeClient = new DirectTranscribeClient({
      region: config.region,
      identityPoolId: config.identityPoolId,
      userPoolId: config.userPoolId,
      jwtToken: config.jwtToken,
      sampleRate: config.sampleRate,
      languageCode: config.sourceLanguage,
    });

    this.translationService = new TranslationService({
      region: config.region,
      identityPoolId: config.identityPoolId,
      userPoolId: config.userPoolId,
      jwtToken: config.jwtToken,
      sourceLanguage: config.sourceLanguage,
      targetLanguages: this.mapToTargetLanguages(config.targetLanguages),
    });

    this.audioCapture = new AudioCapture({
      sampleRate: config.sampleRate,
      channels: 1,
      encoding: 'signed-integer',
      device: (global as any).config?.inputDevice,
    });

    // Initialize Holyrics integration if configured
    if (config.holyrics?.enabled) {
      this.holyricsIntegration = new HolyricsIntegration(config.holyrics);
    }

    // Initialize TTS Manager if configured
    if (config.tts && config.tts.mode !== 'disabled') {
      this.ttsManager = new TTSManager({
        region: config.region,
        identityPoolId: config.identityPoolId,
        userPoolId: config.userPoolId,
        jwtToken: config.jwtToken,
        mode: config.tts.mode,
        enabledLanguages: this.mapToTargetLanguages(config.targetLanguages)
      });
    }

    // Use provided WebSocketManager or create new one if configured
    if (webSocketManager) {
      this.webSocketManager = webSocketManager;
      console.log('Using provided WebSocketManager instance');
    } else if (config.tts?.host && config.tts?.port) {
      const serverUrl = `ws://${config.tts.host}:${config.tts.port}`;
      console.log('Creating new WebSocketManager with URL:', serverUrl);
      this.webSocketManager = new WebSocketManager({
        serverUrl,
        reconnectAttempts: 5,
        reconnectDelay: 1000
      });
    } else {
      console.log('WebSocketManager NOT initialized - no instance provided and host/port missing');
    }

    // Initialize Cost Tracker
    this.costTracker = new CostTracker();

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Handle transcription results
    this.transcribeClient.on('transcription', async (result) => {
      // Track transcription usage for cost calculation
      if (!result.isPartial) {
        // Estimate transcription time (rough approximation)
        const estimatedMinutes = result.text.split(' ').length / 150; // ~150 words per minute
        this.costTracker.trackTranscribeUsage(estimatedMinutes);
      }

      this.emit('transcription', {
        text: result.text,
        isPartial: result.isPartial,
        timestamp: new Date().toISOString(),
      });

      // Only translate final results to avoid too many API calls
      if (!result.isPartial && result.text.trim()) {
        try {
          const translations = await this.translationService.translateText(result.text);
          
          // Track translation usage for cost calculation
          const totalCharacters = result.text.length * translations.length;
          this.costTracker.trackTranslateUsage(totalCharacters);
          
          // Send to Holyrics if configured
          if (this.holyricsIntegration && this.config.holyrics) {
            const holyricsLanguage = this.config.holyrics.language;
            console.log('[Holyrics] Configured language:', holyricsLanguage);
            console.log('[Holyrics] Available translations:', translations.map(t => t.targetLanguage));
            
            // Match language with or without country code (fr matches fr-FR)
            const translation = translations.find(t => 
              t.targetLanguage === holyricsLanguage || 
              t.targetLanguage.startsWith(holyricsLanguage + '-')
            );
            const holyricsText = translation?.text || result.text;
            
            console.log('[Holyrics] Selected translation:', translation ? `${translation.targetLanguage}: ${translation.text.substring(0, 50)}` : 'FALLBACK TO PT');
            
            try {
              await this.holyricsIntegration.addTranslation(holyricsText);
            } catch (error) {
              console.error('Holyrics integration error:', error);
            }
          }
          
          // Send to TTS Server if connected
          if (this.webSocketManager && this.webSocketManager.isConnectedToServer()) {
            // Convert translations to simple object
            const translationsObj: Record<string, string> = {};
            translations.forEach(t => {
              // Extract language code (en from en-US)
              const langCode = t.targetLanguage.split('-')[0];
              translationsObj[langCode] = t.text;
            });
            
            await this.webSocketManager.sendTranslations({
              original: result.text,
              translations: translationsObj,
              generateTTS: this.config.tts?.mode !== 'disabled' && this.config.tts?.mode !== 'local',
              voiceType: this.config.tts?.mode === 'neural' ? 'neural' : 'standard'
            });
          }
          
          this.emit('translation', {
            originalText: result.text,
            translations: translations,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          console.error('Translation error:', error);
          this.emit('error', { type: 'translation', error: (error as Error).message });
        }
      }
    });

    // Handle transcription errors
    this.transcribeClient.on('error', (error) => {
      console.error('Transcription error:', error);
      this.emit('error', { type: 'transcription', error: error.message });
    });

    // Handle transcription timeouts
    this.transcribeClient.on('timeout', () => {
      console.log('Transcription stream timed out - restarting...');
      this.restartTranscription();
    });

    // Handle audio data
    this.audioCapture.on('data', (audioData) => {
      if (this.isActive) {
        this.transcribeClient.sendAudio(audioData);
      }
    });

    // Handle audio level updates
    this.audioCapture.on('level', (level) => {
      this.emit('audio-level', level);
    });

    // Handle audio capture errors
    this.audioCapture.on('error', (error) => {
      console.error('Audio capture error:', error);
      this.emit('error', { type: 'audio', error: error.message });
    });

    // Handle TTS events
    if (this.ttsManager) {
      this.ttsManager.on('polly-usage', (usage) => {
        this.costTracker.trackPollyUsage(usage.characters, usage.voiceType);
        this.emit('polly-usage', usage);
      });

      this.ttsManager.on('error', (error) => {
        console.error('TTS error:', error);
        this.emit('error', { type: 'tts', error: error.error });
      });
    }

    // Handle WebSocket events
    if (this.webSocketManager) {
      this.webSocketManager.on('connected', () => {
        console.log('WebSocket connected');
        this.emit('websocket-connected');
      });

      this.webSocketManager.on('disconnected', () => {
        console.log('WebSocket disconnected');
        this.emit('websocket-disconnected');
      });

      this.webSocketManager.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', { type: 'websocket', error: error.message });
      });

      this.webSocketManager.on('client-connected', (clientInfo) => {
        this.emit('client-connected', clientInfo);
      });

      this.webSocketManager.on('client-disconnected', (clientInfo) => {
        this.emit('client-disconnected', clientInfo);
      });
    }

    // Handle cost tracking events
    this.costTracker.on('cost-alert', (alert) => {
      this.emit('cost-alert', alert);
    });

    this.costTracker.on('costs-updated', (costs) => {
      this.emit('costs-updated', costs);
    });
  }

  async startStreaming(): Promise<void> {
    if (this.isActive) return;

    try {
      console.log('Starting local streaming...');
      
      // Start transcription stream
      await this.transcribeClient.startStreaming();
      
      // Start audio capture
      await this.audioCapture.start();
      
      this.isActive = true;
      this.emit('streaming-started');
      
      console.log('Local streaming started successfully');
    } catch (error) {
      console.error('Failed to start streaming:', error);
      this.emit('error', { type: 'startup', error: (error as Error).message });
      throw error;
    }
  }

  async stopStreaming(): Promise<void> {
    if (!this.isActive) return;

    try {
      console.log('Stopping local streaming...');
      
      // Clear Holyrics display
      if (this.holyricsIntegration) {
        try {
          await this.holyricsIntegration.clear();
        } catch (error) {
          console.error('Failed to clear Holyrics:', error);
        }
      }
      
      // Stop audio capture first
      await this.audioCapture.stop();
      
      // Stop transcription stream
      await this.transcribeClient.stopStreaming();
      
      this.isActive = false;
      this.emit('streaming-stopped');
      
      console.log('Local streaming stopped successfully');
    } catch (error) {
      console.error('Failed to stop streaming:', error);
      this.emit('error', { type: 'shutdown', error: (error as Error).message });
    }
  }

  isStreaming(): boolean {
    return this.isActive;
  }

  async cleanup(): Promise<void> {
    await this.stopStreaming();
    
    if (this.transcribeClient) {
      this.transcribeClient.removeAllListeners();
    }
    
    if (this.translationService) {
      this.translationService.removeAllListeners();
    }
    
    if (this.ttsManager) {
      this.ttsManager.removeAllListeners();
    }
    
    this.audioCache.clear();
    this.removeAllListeners();
  }

  private async restartTranscription(): Promise<void> {
    if (!this.isActive) return;
    
    try {
      console.log('Transcription stream timed out - doing full restart...');
      
      // Do full stop/start like manual operation
      await this.stopStreaming();
      await new Promise(resolve => setTimeout(resolve, 500));
      await this.startStreaming();
      
      console.log('Streaming restarted successfully');
    } catch (error) {
      console.error('Failed to restart streaming:', error);
      this.emit('error', { type: 'restart', error: (error as Error).message });
    }
  }

  // Holyrics control methods
  async clearHolyrics(): Promise<void> {
    if (this.holyricsIntegration) {
      await this.holyricsIntegration.clear();
    }
  }

  async testHolyricsConnection(): Promise<boolean> {
    if (this.holyricsIntegration) {
      return await this.holyricsIntegration.testConnection();
    }
    return false;
  }

  updateHolyricsConfig(config: Partial<HolyricsConfig>): void {
    if (this.holyricsIntegration) {
      this.holyricsIntegration.updateConfig(config);
    }
  }

  // TTS Management Methods

  /**
   * Generate TTS audio for translations
   */
  private async generateTTSAudio(translations: Array<{targetLanguage: string; text: string}>, audioUrls: Map<TargetLanguage, string>): Promise<void> {
    if (!this.ttsManager) return;

    const promises = translations.map(async (translation) => {
      const language = translation.targetLanguage as TargetLanguage;
      
      // Check if language is supported and enabled
      if (!this.ttsManager!.isLanguageSupported(language)) {
        return;
      }

      // Check cache first
      const cacheKey = `${language}-${this.hashText(translation.text)}`;
      if (this.audioCache.has(cacheKey)) {
        audioUrls.set(language, this.audioCache.get(cacheKey)!);
        return;
      }

      try {
        const audioResult = await this.ttsManager!.generateAudio(translation.text, language);
        if (audioResult) {
          audioUrls.set(language, audioResult.audioUrl);
          this.audioCache.set(cacheKey, audioResult.audioUrl);
        }
      } catch (error) {
        console.error(`TTS generation failed for ${language}:`, error);
        // Continue with other languages even if one fails
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Update TTS configuration
   */
  updateTTSConfig(config: Partial<TTSConfig>): void {
    if (this.config.tts) {
      this.config.tts = { ...this.config.tts, ...config };
    } else {
      this.config.tts = config as TTSConfig;
    }

    if (this.ttsManager) {
      this.ttsManager.updateConfig({
        mode: this.config.tts.mode,
        enabledLanguages: this.mapToTargetLanguages(this.config.targetLanguages),
        region: this.config.region,
        identityPoolId: this.config.identityPoolId,
        userPoolId: this.config.userPoolId,
        jwtToken: this.config.jwtToken
      });
    }
  }

  /**
   * Get current TTS configuration
   */
  getTTSConfig(): TTSConfig | null {
    return this.config.tts || null;
  }

  // WebSocket Session Management Methods

  /**
   * Connect to WebSocket server
   */
  async connectWebSocket(): Promise<void> {
    if (this.webSocketManager) {
      await this.webSocketManager.connect();
    }
  }

  /**
   * Create a new session
   */
  async createSession(sessionId: string): Promise<void> {
    if (!this.webSocketManager) {
      throw new Error('WebSocket manager not initialized');
    }

    if (!this.webSocketManager.isConnectedToServer()) {
      throw new Error('WebSocket not connected. Please connect first.');
    }

    if (!this.config.tts) {
      throw new Error('TTS configuration not found');
    }

    const sessionConfig: SessionConfig = {
      sessionId,
      enabledLanguages: this.mapToTargetLanguages(this.config.targetLanguages),
      ttsMode: this.config.tts.mode,
      audioQuality: this.config.tts.mode === 'neural' ? 'high' : 'medium'
    };

    await this.webSocketManager.createSession(sessionId, sessionConfig);
  }

  /**
   * Update session configuration
   */
  async updateSessionConfig(config: Partial<SessionConfig>): Promise<void> {
    if (!this.webSocketManager) {
      throw new Error('WebSocket manager not initialized');
    }

    const currentSession = this.webSocketManager.getCurrentSession();
    if (!currentSession) {
      throw new Error('No active session to update');
    }

    const updatedConfig = { ...currentSession, ...config };
    await this.webSocketManager.updateSessionConfig(updatedConfig);
  }

  /**
   * End current session
   */
  async endSession(): Promise<void> {
    if (this.webSocketManager) {
      await this.webSocketManager.endSession();
    }
  }

  /**
   * Get current session information
   */
  getCurrentSession(): SessionConfig | null {
    return this.webSocketManager?.getCurrentSession() || null;
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnectWebSocket(): void {
    if (this.webSocketManager) {
      this.webSocketManager.disconnect();
    }
  }

  // Cost Tracking Methods

  /**
   * Get current costs
   */
  getCurrentCosts() {
    return this.costTracker.getCurrentCosts();
  }

  /**
   * Reset cost tracking for new session
   */
  resetCostTracking(): void {
    this.costTracker.resetSession();
  }

  /**
   * Set cost warning threshold
   */
  setCostWarningThreshold(threshold: number): void {
    this.costTracker.setWarningThreshold(threshold);
  }

  // Private helper methods

  private hashText(text: string): string {
    // Simple hash function for caching
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}
