import { PollyClient, SynthesizeSpeechCommand, Voice, DescribeVoicesCommand, VoiceId } from '@aws-sdk/client-polly';
import { TargetLanguage } from './types';
import { AudioCacheManager, CacheEntry } from './audio-cache-manager';
import { AudioOptimizer, OptimizedAudio, VoiceOptimizationProfile } from './audio-optimizer';

export interface TTSConfig {
  region: string;
  voiceType: 'neural' | 'standard';
  outputFormat: 'mp3' | 'ogg_vorbis' | 'pcm';
  sampleRate: string;
}

export interface VoiceMapping {
  language: TargetLanguage;
  neural: string;
  standard: string;
}

export interface TTSResult {
  audioBuffer: Buffer;
  format: string;
  voiceId: string;
  voiceType: 'neural' | 'standard';
  duration?: number;
}

export interface TTSCostStats {
  characters: number;
  standardCharacters: number;
  neuralCharacters: number;
  standardCost: number;
  neuralCost: number;
  totalCost: number;
  requestCount: number;
  sessionStartTime: Date;
  lastUpdated: Date;
}

export class TTSService {
  private pollyClient: PollyClient;
  private config: TTSConfig;
  private voiceMappings: VoiceMapping[];
  private availableVoices: Voice[] = [];
  private cacheManager: AudioCacheManager;
  private audioOptimizer: AudioOptimizer;
  private costStats: TTSCostStats;
  
  // Polly pricing per million characters
  private static readonly POLLY_PRICING = {
    standard: 4 / 1000000,
    neural: 16 / 1000000
  };

  constructor(config: TTSConfig = {
    region: 'us-east-1',
    voiceType: 'neural',
    outputFormat: 'mp3',
    sampleRate: '22050'
  }) {
    this.config = config;
    this.pollyClient = new PollyClient({ region: config.region });
    
    // Initialize cost tracking
    this.costStats = {
      characters: 0,
      standardCharacters: 0,
      neuralCharacters: 0,
      standardCost: 0,
      neuralCost: 0,
      totalCost: 0,
      requestCount: 0,
      sessionStartTime: new Date(),
      lastUpdated: new Date()
    };
    
    // Initialize cache and optimizer
    this.cacheManager = new AudioCacheManager({
      maxSize: 100 * 1024 * 1024, // 100MB
      maxEntries: 1000,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      compressionEnabled: true,
      persistToDisk: true,
      diskCachePath: './audio-cache'
    });
    
    this.audioOptimizer = new AudioOptimizer({
      enableCompression: true,
      targetBitrate: 64, // Good quality for speech
      maxFileSize: 500 * 1024, // 500KB max
      enableProgressiveLoading: true,
      chunkSize: 8192,
      enableFormatConversion: true,
      preferredFormats: ['mp3', 'ogg', 'wav']
    });
    
    // Default voice mappings for supported languages
    this.voiceMappings = [
      { language: 'en', neural: 'Joanna', standard: 'Joanna' },
      { language: 'es', neural: 'Lupe', standard: 'Penelope' },
      { language: 'fr', neural: 'Lea', standard: 'Celine' },
      { language: 'de', neural: 'Vicki', standard: 'Marlene' },
      { language: 'it', neural: 'Bianca', standard: 'Carla' }
    ];

    this.loadAvailableVoices();
  }

  /**
   * Load available voices from AWS Polly
   */
  private async loadAvailableVoices(): Promise<void> {
    try {
      const command = new DescribeVoicesCommand({});
      const response = await this.pollyClient.send(command);
      
      if (response.Voices) {
        this.availableVoices = response.Voices;
        console.log(`Loaded ${this.availableVoices.length} available Polly voices`);
        
        // Update voice mappings based on available voices
        this.updateVoiceMappings();
      }
    } catch (error) {
      console.error('Failed to load available Polly voices:', error);
    }
  }

  /**
   * Update voice mappings based on available voices
   */
  private updateVoiceMappings(): void {
    for (const mapping of this.voiceMappings) {
      const languageCode = this.getPollyLanguageCode(mapping.language);
      const languageVoices = this.availableVoices.filter(voice => 
        voice.LanguageCode?.startsWith(languageCode)
      );

      // Find best neural voice
      const neuralVoices = languageVoices.filter(voice => 
        voice.SupportedEngines?.includes('neural')
      );
      if (neuralVoices.length > 0) {
        mapping.neural = neuralVoices[0].Id || mapping.neural;
      }

      // Find best standard voice
      const standardVoices = languageVoices.filter(voice => 
        voice.SupportedEngines?.includes('standard')
      );
      if (standardVoices.length > 0) {
        mapping.standard = standardVoices[0].Id || mapping.standard;
      }
    }

    console.log('Updated voice mappings:', this.voiceMappings);
  }

  /**
   * Convert target language to Polly language code
   */
  private getPollyLanguageCode(language: TargetLanguage): string {
    const languageMap: Record<TargetLanguage, string> = {
      'en': 'en-US',
      'es': 'es-ES',
      'fr': 'fr-FR',
      'de': 'de-DE',
      'it': 'it-IT',
      'pt': 'pt-BR'
    };
    return languageMap[language];
  }

  /**
   * Get voice ID for language and voice type
   */
  private getVoiceId(language: TargetLanguage, voiceType: 'neural' | 'standard'): string {
    const mapping = this.voiceMappings.find(m => m.language === language);
    if (!mapping) {
      throw new Error(`No voice mapping found for language: ${language}`);
    }
    return voiceType === 'neural' ? mapping.neural : mapping.standard;
  }

  /**
   * Synthesize speech using AWS Polly with caching and optimization
   */
  async synthesizeSpeech(
    text: string,
    language: TargetLanguage,
    voiceType: 'neural' | 'standard' = this.config.voiceType,
    optimizeForMobile: boolean = true
  ): Promise<TTSResult & { optimized?: OptimizedAudio }> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    if (text.length > 3000) {
      throw new Error('Text too long for Polly synthesis (max 3000 characters)');
    }

    const startTime = Date.now();

    // Check cache first
    const cachedEntry = this.cacheManager.get(text, language, voiceType);
    if (cachedEntry) {
      console.log(`Cache hit for ${language} TTS: ${text.substring(0, 50)}...`);
      
      let optimized: OptimizedAudio | undefined;
      if (optimizeForMobile) {
        optimized = await this.audioOptimizer.optimizeAudio(
          cachedEntry.audioBuffer,
          cachedEntry.format
        );
      }

      return {
        audioBuffer: cachedEntry.audioBuffer,
        format: cachedEntry.format,
        voiceId: cachedEntry.voiceId,
        voiceType: cachedEntry.voiceType,
        duration: cachedEntry.duration,
        optimized
      };
    }

    try {
      // Get optimal voice based on current performance metrics
      const optimalVoice = this.audioOptimizer.getOptimalVoice(language, false, false);
      const actualVoiceType = optimalVoice?.voiceType || voiceType;
      
      const voiceId = this.getVoiceId(language, actualVoiceType);
      const engine = actualVoiceType === 'neural' ? 'neural' : 'standard';

      const command = new SynthesizeSpeechCommand({
        Text: text,
        VoiceId: voiceId as VoiceId,
        OutputFormat: this.config.outputFormat,
        SampleRate: this.config.sampleRate,
        Engine: engine,
        TextType: 'text'
      });

      console.log(`Synthesizing speech: ${text.substring(0, 50)}... (${language}, ${actualVoiceType}, ${voiceId})`);
      
      const response = await this.pollyClient.send(command);
      
      if (!response.AudioStream) {
        throw new Error('No audio stream received from Polly');
      }

      // Convert stream to buffer
      const audioBuffer = Buffer.from(await response.AudioStream.transformToByteArray());
      
      // Estimate duration
      const duration = this.estimateAudioDuration(audioBuffer, this.config.outputFormat);

      // Cache the result
      this.cacheManager.set(
        text,
        language,
        actualVoiceType,
        audioBuffer,
        this.config.outputFormat,
        voiceId,
        duration
      );

      // Update voice performance metrics
      const latency = Date.now() - startTime;
      this.audioOptimizer.updateVoiceProfile(language, actualVoiceType, {
        latency,
        errorRate: 0 // Success
      });

      // Optimize for mobile if requested
      let optimized: OptimizedAudio | undefined;
      if (optimizeForMobile) {
        optimized = await this.audioOptimizer.optimizeAudio(
          audioBuffer,
          this.config.outputFormat
        );
      }

      console.log(`TTS synthesis completed: ${audioBuffer.length} bytes, ~${duration}s, latency: ${latency}ms`);

      // Track cost
      this.trackCost(text.length, actualVoiceType);

      return {
        audioBuffer,
        format: this.config.outputFormat,
        voiceId,
        voiceType: actualVoiceType,
        duration,
        optimized
      };
    } catch (error) {
      // Update voice performance metrics for failure
      const latency = Date.now() - startTime;
      this.audioOptimizer.updateVoiceProfile(language, voiceType, {
        latency,
        errorRate: 1 // Failure
      });

      console.error('Polly synthesis failed:', error);
      throw new Error(`TTS synthesis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Estimate audio duration based on buffer size and format
   */
  private estimateAudioDuration(buffer: Buffer, format: string): number {
    // Rough estimation for MP3 at 22050 Hz
    if (format === 'mp3') {
      // MP3 compression ratio is roughly 10:1, so 1 second ≈ 2.2KB at 22050 Hz
      return Math.round((buffer.length / 2200) * 10) / 10;
    }
    
    // For other formats, use a basic estimation
    return Math.round((buffer.length / 4000) * 10) / 10;
  }

  /**
   * Update TTS configuration
   */
  updateConfig(newConfig: Partial<TTSConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Recreate Polly client if region changed
    if (newConfig.region) {
      this.pollyClient = new PollyClient({ region: newConfig.region });
      this.loadAvailableVoices();
    }
    
    console.log('TTS config updated:', this.config);
  }

  /**
   * Test TTS functionality
   */
  async testTTS(language: TargetLanguage = 'en'): Promise<boolean> {
    try {
      const result = await this.synthesizeSpeech('Test message', language, 'standard');
      return result.audioBuffer.length > 0;
    } catch (error) {
      console.error('TTS test failed:', error);
      return false;
    }
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): TargetLanguage[] {
    return this.voiceMappings.map(m => m.language);
  }

  /**
   * Get voice information for a language
   */
  getVoiceInfo(language: TargetLanguage): {
    neural: string;
    standard: string;
    available: boolean;
  } | null {
    const mapping = this.voiceMappings.find(m => m.language === language);
    if (!mapping) {
      return null;
    }

    const languageCode = this.getPollyLanguageCode(language);
    const available = this.availableVoices.some(voice => 
      voice.LanguageCode?.startsWith(languageCode)
    );

    return {
      neural: mapping.neural,
      standard: mapping.standard,
      available
    };
  }

  /**
   * Track cost for a TTS request
   */
  private trackCost(characters: number, voiceType: 'neural' | 'standard'): void {
    const cost = characters * (voiceType === 'neural' 
      ? TTSService.POLLY_PRICING.neural 
      : TTSService.POLLY_PRICING.standard);
    
    this.costStats.characters += characters;
    this.costStats.requestCount += 1;
    this.costStats.lastUpdated = new Date();
    
    if (voiceType === 'neural') {
      this.costStats.neuralCharacters += characters;
      this.costStats.neuralCost += cost;
    } else {
      this.costStats.standardCharacters += characters;
      this.costStats.standardCost += cost;
    }
    
    this.costStats.totalCost = this.costStats.standardCost + this.costStats.neuralCost;
    
    console.log(`TTS cost tracked: ${characters} chars, ${voiceType}, $${cost.toFixed(6)} (total: $${this.costStats.totalCost.toFixed(6)})`);
  }

  /**
   * Get TTS cost statistics
   */
  getCostStats(): TTSCostStats {
    return { ...this.costStats };
  }

  /**
   * Reset cost statistics
   */
  resetCostStats(): void {
    this.costStats = {
      characters: 0,
      standardCharacters: 0,
      neuralCharacters: 0,
      standardCost: 0,
      neuralCost: 0,
      totalCost: 0,
      requestCount: 0,
      sessionStartTime: new Date(),
      lastUpdated: new Date()
    };
    console.log('TTS cost statistics reset');
  }

  /**
   * Get TTS cost estimation (kept for backward compatibility)
   */
  calculateCost(characterCount: number, voiceType: 'neural' | 'standard'): number {
    // AWS Polly pricing (as of 2024)
    const pricePerMillion = voiceType === 'neural' ? 16.00 : 4.00;
    return (characterCount / 1000000) * pricePerMillion;
  }

  /**
   * Batch synthesize multiple texts with smart caching
   */
  async batchSynthesize(
    requests: Array<{
      text: string;
      language: TargetLanguage;
      voiceType?: 'neural' | 'standard';
      optimizeForMobile?: boolean;
    }>
  ): Promise<Array<TTSResult | Error>> {
    // Separate cached and uncached requests
    const cachedResults: Array<TTSResult | null> = [];
    const uncachedRequests: Array<{ index: number; request: typeof requests[0] }> = [];

    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];
      const voiceType = req.voiceType || this.config.voiceType;
      
      if (this.cacheManager.has(req.text, req.language, voiceType)) {
        const cached = this.cacheManager.get(req.text, req.language, voiceType);
        if (cached) {
          cachedResults[i] = {
            audioBuffer: cached.audioBuffer,
            format: cached.format,
            voiceId: cached.voiceId,
            voiceType: cached.voiceType,
            duration: cached.duration
          };
        } else {
          cachedResults[i] = null;
          uncachedRequests.push({ index: i, request: req });
        }
      } else {
        cachedResults[i] = null;
        uncachedRequests.push({ index: i, request: req });
      }
    }

    // Process uncached requests
    const uncachedResults = await Promise.allSettled(
      uncachedRequests.map(({ request }) => 
        this.synthesizeSpeech(
          request.text, 
          request.language, 
          request.voiceType,
          request.optimizeForMobile
        )
      )
    );

    // Combine results
    const finalResults: Array<TTSResult | Error> = [];
    let uncachedIndex = 0;

    for (let i = 0; i < requests.length; i++) {
      if (cachedResults[i]) {
        finalResults[i] = cachedResults[i]!;
      } else {
        const result = uncachedResults[uncachedIndex];
        finalResults[i] = result.status === 'fulfilled' 
          ? result.value 
          : new Error(result.reason);
        uncachedIndex++;
      }
    }

    return finalResults;
  }

  /**
   * Get cache statistics and performance metrics
   */
  getCacheStats() {
    return this.cacheManager.getStats();
  }

  /**
   * Get voice optimization recommendations
   */
  getVoiceRecommendations() {
    return this.audioOptimizer.getVoiceRecommendations();
  }

  /**
   * Get optimization statistics
   */
  getOptimizationStats() {
    return this.audioOptimizer.getOptimizationStats();
  }

  /**
   * Clear audio cache
   */
  clearCache(): void {
    this.cacheManager.clear();
  }

  /**
   * Update cache configuration
   */
  updateCacheConfig(config: any): void {
    this.cacheManager.updateConfig(config);
  }

  /**
   * Update optimization configuration
   */
  updateOptimizationConfig(config: any): void {
    this.audioOptimizer.updateConfig(config);
  }

  /**
   * Get streaming chunks for progressive audio loading
   */
  async getStreamingChunks(
    text: string,
    language: TargetLanguage,
    voiceType: 'neural' | 'standard' = this.config.voiceType
  ): Promise<Buffer[]> {
    const result = await this.synthesizeSpeech(text, language, voiceType, true);
    
    if (result.optimized?.chunks) {
      return result.optimized.chunks;
    }

    // Fallback: create chunks from the audio buffer
    const chunkSize = 8192; // 8KB chunks
    const chunks: Buffer[] = [];
    
    for (let i = 0; i < result.audioBuffer.length; i += chunkSize) {
      const end = Math.min(i + chunkSize, result.audioBuffer.length);
      chunks.push(result.audioBuffer.slice(i, end));
    }

    return chunks;
  }

  /**
   * Preload common phrases for better performance
   */
  async preloadCommonPhrases(
    phrases: Array<{ text: string; language: TargetLanguage }>,
    voiceType: 'neural' | 'standard' = this.config.voiceType
  ): Promise<void> {
    console.log(`Preloading ${phrases.length} common phrases...`);
    
    const requests = phrases.map(phrase => ({
      text: phrase.text,
      language: phrase.language,
      voiceType,
      optimizeForMobile: true
    }));

    await this.batchSynthesize(requests);
    console.log('Preloading completed');
  }

  /**
   * Get performance analytics
   */
  getPerformanceAnalytics(): {
    cacheHitRate: number;
    averageLatency: number;
    voiceRecommendations: any[];
    optimizationStats: any;
    cacheStats: any;
  } {
    return {
      cacheHitRate: this.cacheManager.getHitRate(),
      averageLatency: 0, // Would be calculated from actual metrics
      voiceRecommendations: this.getVoiceRecommendations(),
      optimizationStats: this.getOptimizationStats(),
      cacheStats: this.getCacheStats()
    };
  }
}
