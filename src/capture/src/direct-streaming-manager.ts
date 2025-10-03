import { EventEmitter } from 'events';
import { DirectTranscribeClient } from './direct-transcribe-client';
import { TranslationService } from './translation-service';
import { AudioCapture } from './audio-capture';

interface StreamingConfig {
  region: string;
  identityPoolId: string;
  userPoolId: string;
  jwtToken: string;
  sourceLanguage: string;
  targetLanguages: string[];
  sampleRate: number;
  audioDevice?: string;
}

export class DirectStreamingManager extends EventEmitter {
  private transcribeClient: DirectTranscribeClient;
  private translationService: TranslationService;
  private audioCapture: AudioCapture;
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
      console.log('Restarting transcription stream...');
      await this.transcribeClient.stopStreaming();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      await this.transcribeClient.startStreaming();
      console.log('Transcription stream restarted successfully');
    } catch (error) {
      console.error('Failed to restart transcription:', error);
      this.emit('error', { type: 'restart', error: (error as Error).message });
    }
  }
}
