import { PollyClient, SynthesizeSpeechCommand, VoiceId, Engine, OutputFormat } from '@aws-sdk/client-polly';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { TTSFallbackManager, TTSResult as FallbackResult } from './tts-fallback-manager';

export type TTSMode = 'neural' | 'standard' | 'local' | 'disabled';
export type TargetLanguage = 'en-US' | 'es-ES' | 'fr-FR' | 'de-DE' | 'it-IT';

interface TTSConfig {
  region: string;
  identityPoolId: string;
  userPoolId: string;
  jwtToken: string;
  mode: TTSMode;
  enabledLanguages: TargetLanguage[];
}

interface VoiceMapping {
  standard: VoiceId;
  neural: VoiceId;
}

interface AudioResult {
  audioUrl: string;
  duration: number;
  size: number;
  voiceType: 'neural' | 'standard';
}

export class TTSManager extends EventEmitter {
  private pollyClient: PollyClient;
  private config: TTSConfig;
  private audioCache: Map<string, AudioResult> = new Map();
  private audioDir: string;
  private fallbackManager: TTSFallbackManager;

  // Language-specific voice mappings
  private readonly voiceMappings: Record<TargetLanguage, VoiceMapping> = {
    'en-US': {
      standard: VoiceId.Joanna,
      neural: VoiceId.Joanna
    },
    'es-ES': {
      standard: VoiceId.Conchita,
      neural: VoiceId.Lucia
    },
    'fr-FR': {
      standard: VoiceId.Celine,
      neural: VoiceId.Lea
    },
    'de-DE': {
      standard: VoiceId.Marlene,
      neural: VoiceId.Vicki
    },
    'it-IT': {
      standard: VoiceId.Carla,
      neural: VoiceId.Bianca
    }
  };

  constructor(config: TTSConfig) {
    super();
    this.config = config;
    
    // Initialize audio storage directory
    this.audioDir = path.join(app.getPath('userData'), 'tts-audio');
    if (!fs.existsSync(this.audioDir)) {
      fs.mkdirSync(this.audioDir, { recursive: true });
    }

    // Initialize Polly client
    this.pollyClient = new PollyClient({
      region: config.region,
      credentials: fromCognitoIdentityPool({
        clientConfig: { region: config.region },
        identityPoolId: config.identityPoolId,
        logins: {
          [`cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`]: config.jwtToken,
        },
      }),
    });

    // Initialize fallback manager
    this.fallbackManager = new TTSFallbackManager(this, {
      enablePolly: true,
      enableLocalTTS: true,
      enableTextOnly: true,
      pollyTimeout: 5000,
      localTTSTimeout: 3000,
      maxRetries: 2,
      retryDelay: 1000
    });

    // Forward fallback events
    this.fallbackManager.on('fallback-notification', (notification) => {
      this.emit('fallback-notification', notification);
    });

    this.fallbackManager.on('tts-error', (error) => {
      this.emit('tts-error', error);
    });
  }

  /**
   * Update TTS configuration
   */
  updateConfig(newConfig: Partial<TTSConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Recreate Polly client if credentials changed
    if (newConfig.jwtToken || newConfig.region || newConfig.identityPoolId || newConfig.userPoolId) {
      this.pollyClient = new PollyClient({
        region: this.config.region,
        credentials: fromCognitoIdentityPool({
          clientConfig: { region: this.config.region },
          identityPoolId: this.config.identityPoolId,
          logins: {
            [`cognito-idp.${this.config.region}.amazonaws.com/${this.config.userPoolId}`]: this.config.jwtToken,
          },
        }),
      });
    }
  }

  /**
   * Set TTS mode (neural, standard, local, disabled)
   */
  setTTSMode(mode: TTSMode): void {
    this.config.mode = mode;
    this.emit('mode-changed', mode);
  }

  /**
   * Set enabled languages for TTS
   */
  setEnabledLanguages(languages: TargetLanguage[]): void {
    this.config.enabledLanguages = languages;
    this.emit('languages-changed', languages);
  }

  /**
   * Generate audio with fallback chain (recommended method)
   */
  async generateAudioWithFallback(text: string, language: TargetLanguage): Promise<FallbackResult> {
    return await this.fallbackManager.generateAudioWithFallback(text, language);
  }

  /**
   * Generate audio for text in specified language (direct Polly only)
   */
  async generateAudio(text: string, language: TargetLanguage): Promise<AudioResult | null> {
    // Check if TTS is disabled or language not enabled
    if (this.config.mode === 'disabled' || this.config.mode === 'local') {
      return null;
    }

    if (!this.config.enabledLanguages.includes(language)) {
      return null;
    }

    // Check cache first
    const cacheKey = this.getCacheKey(text, language, this.config.mode);
    if (this.audioCache.has(cacheKey)) {
      return this.audioCache.get(cacheKey)!;
    }

    try {
      const voiceMapping = this.voiceMappings[language];
      const voiceId = this.config.mode === 'neural' ? voiceMapping.neural : voiceMapping.standard;
      const engine = this.config.mode === 'neural' ? Engine.NEURAL : Engine.STANDARD;

      const command = new SynthesizeSpeechCommand({
        Text: text,
        OutputFormat: OutputFormat.MP3,
        VoiceId: voiceId,
        Engine: engine,
        SampleRate: '22050', // Good quality for speech
        TextType: 'text'
      });

      const response = await this.pollyClient.send(command);
      
      if (!response.AudioStream) {
        throw new Error('No audio stream received from Polly');
      }

      // Convert stream to buffer
      const audioBuffer = await this.streamToBuffer(response.AudioStream);
      
      // Save to local file
      const filename = `${Date.now()}-${language}-${this.hashText(text)}.mp3`;
      const filepath = path.join(this.audioDir, filename);
      fs.writeFileSync(filepath, audioBuffer);

      // Create result
      const result: AudioResult = {
        audioUrl: `file://${filepath}`,
        duration: this.estimateAudioDuration(text),
        size: audioBuffer.length,
        voiceType: this.config.mode as 'neural' | 'standard'
      };

      // Cache result
      this.audioCache.set(cacheKey, result);

      // Emit usage tracking event
      this.emit('polly-usage', {
        characters: text.length,
        voiceType: this.config.mode,
        language: language
      });

      return result;

    } catch (error) {
      console.error('TTS generation failed:', error);
      this.emit('error', {
        type: 'tts-generation',
        error: (error as Error).message,
        language,
        text: text.substring(0, 50) + '...'
      });
      return null;
    }
  }

  /**
   * Get available voices for a language
   */
  getAvailableVoices(language: TargetLanguage): { standard: VoiceId; neural: VoiceId } {
    return this.voiceMappings[language];
  }

  /**
   * Check if TTS is available for a language
   */
  isLanguageSupported(language: TargetLanguage): boolean {
    return language in this.voiceMappings && this.config.enabledLanguages.includes(language);
  }

  /**
   * Get current TTS configuration
   */
  getConfig(): TTSConfig {
    return { ...this.config };
  }

  /**
   * Clear audio cache and files
   */
  clearCache(): void {
    this.audioCache.clear();
    
    // Clean up old audio files (keep files from last 24 hours)
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000);
    
    try {
      const files = fs.readdirSync(this.audioDir);
      for (const file of files) {
        const filepath = path.join(this.audioDir, file);
        const stats = fs.statSync(filepath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          fs.unlinkSync(filepath);
        }
      }
    } catch (error) {
      console.error('Failed to clean up audio cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; files: number } {
    let totalSize = 0;
    let fileCount = 0;

    try {
      const files = fs.readdirSync(this.audioDir);
      for (const file of files) {
        const filepath = path.join(this.audioDir, file);
        const stats = fs.statSync(filepath);
        totalSize += stats.size;
        fileCount++;
      }
    } catch (error) {
      console.error('Failed to get cache stats:', error);
    }

    return { size: totalSize, files: fileCount };
  }

  /**
   * Get fallback manager performance metrics
   */
  getFallbackMetrics() {
    return this.fallbackManager.getPerformanceMetrics();
  }

  /**
   * Update fallback configuration
   */
  updateFallbackConfig(config: any) {
    this.fallbackManager.updateConfig(config);
  }

  /**
   * Test all TTS methods
   */
  async testAllTTSMethods(language: TargetLanguage = 'en-US') {
    return await this.fallbackManager.testAllMethods(language);
  }

  /**
   * Get recent TTS request history for debugging
   */
  getTTSRequestHistory(limit: number = 20) {
    return this.fallbackManager.getRequestHistory(limit);
  }

  // Private helper methods

  private getCacheKey(text: string, language: TargetLanguage, mode: TTSMode): string {
    return `${language}-${mode}-${this.hashText(text)}`;
  }

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

  private async streamToBuffer(stream: any): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
  }

  private estimateAudioDuration(text: string): number {
    // Estimate duration based on average speaking rate (150 words per minute)
    const words = text.split(/\s+/).length;
    const minutes = words / 150;
    return Math.ceil(minutes * 60); // Return seconds
  }
}