import { EventEmitter } from 'events';
import { DirectTranscribeClient } from './direct-transcribe-client';
import { TranslationService } from './translation-service';
import { AudioCapture } from './audio-capture';
import { HolyricsIntegration, HolyricsConfig } from './holyrics-integration';

interface StreamingConfig {
  region: string;
  identityPoolId: string;
  userPoolId: string;
  jwtToken: string;
  languageCode: string;
  sourceLanguage: string;
  targetLanguages: string[];
  sampleRate: number;
  audioDevice?: string;
  holyrics?: HolyricsConfig;
}

export class DirectStreamingManager extends EventEmitter {
  private transcribeClient: DirectTranscribeClient;
  private translationService: TranslationService;
  private audioCapture: AudioCapture;
  private holyricsIntegration?: HolyricsIntegration;
  private config: StreamingConfig;
  private isActive = false;

  constructor(config: StreamingConfig) {
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
      targetLanguages: config.targetLanguages,
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

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Handle transcription results
    this.transcribeClient.on('transcription', async (result) => {
      this.emit('transcription', {
        text: result.text,
        isPartial: result.isPartial,
        timestamp: new Date().toISOString(),
      });

      // Only translate final results to avoid too many API calls
      if (!result.isPartial && result.text.trim()) {
        try {
          const translations = await this.translationService.translateText(result.text);
          
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
}
