import * as fs from 'fs';
import * as path from 'path';
import { TargetLanguage } from './types';

export interface AudioOptimizationConfig {
  enableCompression: boolean;
  targetBitrate: number; // kbps
  maxFileSize: number; // bytes
  enableProgressiveLoading: boolean;
  chunkSize: number; // bytes for streaming
  enableFormatConversion: boolean;
  preferredFormats: string[]; // ordered by preference
}

export interface OptimizedAudio {
  buffer: Buffer;
  format: string;
  bitrate: number;
  duration: number;
  size: number;
  compressionRatio: number;
  chunks?: Buffer[]; // For progressive loading
}

export interface VoiceOptimizationProfile {
  language: TargetLanguage;
  voiceType: 'neural' | 'standard';
  qualityScore: number; // 1-10
  costPerCharacter: number;
  averageLatency: number;
  recommendedUse: 'primary' | 'fallback' | 'avoid';
}

export class AudioOptimizer {
  private config: AudioOptimizationConfig;
  private voiceProfiles: Map<string, VoiceOptimizationProfile> = new Map();

  constructor(config: AudioOptimizationConfig = {
    enableCompression: true,
    targetBitrate: 64, // Good quality for speech
    maxFileSize: 500 * 1024, // 500KB max
    enableProgressiveLoading: true,
    chunkSize: 8192, // 8KB chunks
    enableFormatConversion: true,
    preferredFormats: ['mp3', 'ogg', 'wav']
  }) {
    this.config = config;
    this.initializeVoiceProfiles();
  }

  /**
   * Optimize audio buffer for mobile delivery
   */
  async optimizeAudio(
    audioBuffer: Buffer,
    originalFormat: string,
    targetFormat?: string
  ): Promise<OptimizedAudio> {
    let optimizedBuffer = audioBuffer;
    let format = originalFormat;
    const originalSize = audioBuffer.length;

    // Convert format if needed and enabled
    if (this.config.enableFormatConversion && targetFormat && targetFormat !== originalFormat) {
      optimizedBuffer = await this.convertFormat(audioBuffer, originalFormat, targetFormat);
      format = targetFormat;
    }

    // Compress if enabled and file is too large
    if (this.config.enableCompression && optimizedBuffer.length > this.config.maxFileSize) {
      optimizedBuffer = await this.compressAudio(optimizedBuffer, format);
    }

    // Create chunks for progressive loading
    let chunks: Buffer[] | undefined;
    if (this.config.enableProgressiveLoading) {
      chunks = this.createChunks(optimizedBuffer);
    }

    const finalSize = optimizedBuffer.length;
    const compressionRatio = originalSize > 0 ? finalSize / originalSize : 1;
    const duration = this.estimateAudioDuration(optimizedBuffer, format);

    return {
      buffer: optimizedBuffer,
      format,
      bitrate: this.config.targetBitrate,
      duration,
      size: finalSize,
      compressionRatio,
      chunks
    };
  }

  /**
   * Get optimal voice selection for quality vs cost balance
   */
  getOptimalVoice(
    language: TargetLanguage,
    prioritizeCost: boolean = false,
    prioritizeQuality: boolean = false
  ): VoiceOptimizationProfile | null {
    const neuralKey = `${language}-neural`;
    const standardKey = `${language}-standard`;
    
    const neuralProfile = this.voiceProfiles.get(neuralKey);
    const standardProfile = this.voiceProfiles.get(standardKey);

    if (!neuralProfile && !standardProfile) {
      return null;
    }

    // If only one is available, return it
    if (!neuralProfile) return standardProfile!;
    if (!standardProfile) return neuralProfile!;

    // Cost priority: choose standard unless quality difference is huge
    if (prioritizeCost) {
      const qualityDiff = neuralProfile.qualityScore - standardProfile.qualityScore;
      const costRatio = neuralProfile.costPerCharacter / standardProfile.costPerCharacter;
      
      // Use neural only if quality improvement justifies 4x cost
      return (qualityDiff >= 3 && costRatio <= 4) ? neuralProfile : standardProfile;
    }

    // Quality priority: choose neural unless cost is prohibitive
    if (prioritizeQuality) {
      const costRatio = neuralProfile.costPerCharacter / standardProfile.costPerCharacter;
      
      // Use neural unless cost is more than 6x higher
      return costRatio <= 6 ? neuralProfile : standardProfile;
    }

    // Balanced approach: consider quality-to-cost ratio
    const neuralRatio = neuralProfile.qualityScore / neuralProfile.costPerCharacter;
    const standardRatio = standardProfile.qualityScore / standardProfile.costPerCharacter;

    return neuralRatio >= standardRatio ? neuralProfile : standardProfile;
  }

  /**
   * Analyze voice performance and update profiles
   */
  updateVoiceProfile(
    language: TargetLanguage,
    voiceType: 'neural' | 'standard',
    metrics: {
      latency?: number;
      qualityFeedback?: number; // 1-10 user rating
      errorRate?: number; // 0-1
    }
  ): void {
    const key = `${language}-${voiceType}`;
    const profile = this.voiceProfiles.get(key);
    
    if (!profile) return;

    // Update latency with exponential moving average
    if (metrics.latency !== undefined) {
      profile.averageLatency = profile.averageLatency * 0.8 + metrics.latency * 0.2;
    }

    // Update quality score based on feedback and error rate
    if (metrics.qualityFeedback !== undefined) {
      profile.qualityScore = profile.qualityScore * 0.9 + metrics.qualityFeedback * 0.1;
    }

    if (metrics.errorRate !== undefined) {
      // High error rate reduces quality score
      const errorPenalty = metrics.errorRate * 2; // Max 2 point penalty
      profile.qualityScore = Math.max(1, profile.qualityScore - errorPenalty);
    }

    // Update recommendation based on performance
    this.updateRecommendation(profile);
    
    this.voiceProfiles.set(key, profile);
  }

  /**
   * Get voice recommendations for all languages
   */
  getVoiceRecommendations(): Array<{
    language: TargetLanguage;
    recommended: VoiceOptimizationProfile;
    alternative?: VoiceOptimizationProfile;
    reasoning: string;
  }> {
    const recommendations: Array<{
      language: TargetLanguage;
      recommended: VoiceOptimizationProfile;
      alternative?: VoiceOptimizationProfile;
      reasoning: string;
    }> = [];

    const languages: TargetLanguage[] = ['en', 'es', 'fr', 'de', 'it'];

    for (const language of languages) {
      const optimal = this.getOptimalVoice(language);
      if (!optimal) continue;

      const neuralKey = `${language}-neural`;
      const standardKey = `${language}-standard`;
      const neural = this.voiceProfiles.get(neuralKey);
      const standard = this.voiceProfiles.get(standardKey);

      let alternative: VoiceOptimizationProfile | undefined;
      let reasoning: string;

      if (optimal.voiceType === 'neural' && standard) {
        alternative = standard;
        reasoning = `Neural voice recommended for quality (${optimal.qualityScore}/10) despite higher cost`;
      } else if (optimal.voiceType === 'standard' && neural) {
        alternative = neural;
        reasoning = `Standard voice recommended for cost efficiency (${optimal.costPerCharacter.toFixed(4)} per char)`;
      } else {
        reasoning = `Only ${optimal.voiceType} voice available for ${language}`;
      }

      recommendations.push({
        language,
        recommended: optimal,
        alternative,
        reasoning
      });
    }

    return recommendations;
  }

  /**
   * Create progressive loading chunks
   */
  private createChunks(buffer: Buffer): Buffer[] {
    const chunks: Buffer[] = [];
    const chunkSize = this.config.chunkSize;

    for (let i = 0; i < buffer.length; i += chunkSize) {
      const end = Math.min(i + chunkSize, buffer.length);
      chunks.push(buffer.slice(i, end));
    }

    return chunks;
  }

  /**
   * Compress audio buffer (simplified implementation)
   */
  private async compressAudio(buffer: Buffer, format: string): Promise<Buffer> {
    // This is a simplified compression - in a real implementation,
    // you would use libraries like ffmpeg-static or similar
    
    if (format === 'mp3') {
      // For MP3, we can reduce quality by adjusting bitrate
      // This is a placeholder - real implementation would use audio processing libraries
      const compressionRatio = Math.min(0.7, this.config.maxFileSize / buffer.length);
      const compressedSize = Math.floor(buffer.length * compressionRatio);
      
      // Simple compression simulation (not actual audio compression)
      return buffer.slice(0, compressedSize);
    }

    return buffer;
  }

  /**
   * Convert audio format (placeholder implementation)
   */
  private async convertFormat(
    buffer: Buffer,
    fromFormat: string,
    toFormat: string
  ): Promise<Buffer> {
    // This is a placeholder - real implementation would use audio conversion libraries
    // For now, just return the original buffer
    console.log(`Format conversion: ${fromFormat} -> ${toFormat} (placeholder)`);
    return buffer;
  }

  /**
   * Estimate audio duration based on buffer size and format
   */
  private estimateAudioDuration(buffer: Buffer, format: string): number {
    // Rough estimation based on format and bitrate
    const bitrate = this.config.targetBitrate * 1000; // Convert to bps
    const bytesPerSecond = bitrate / 8;
    
    if (format === 'mp3') {
      // MP3 has variable compression, use average
      return Math.round((buffer.length / bytesPerSecond) * 10) / 10;
    }
    
    // For other formats, use basic calculation
    return Math.round((buffer.length / (bytesPerSecond * 0.8)) * 10) / 10;
  }

  /**
   * Initialize voice optimization profiles
   */
  private initializeVoiceProfiles(): void {
    const languages: TargetLanguage[] = ['en', 'es', 'fr', 'de', 'it'];
    
    // AWS Polly pricing (per million characters)
    const standardCost = 4.00 / 1000000; // $4 per 1M chars
    const neuralCost = 16.00 / 1000000; // $16 per 1M chars

    for (const language of languages) {
      // Standard voice profile
      this.voiceProfiles.set(`${language}-standard`, {
        language,
        voiceType: 'standard',
        qualityScore: 6.5, // Good quality
        costPerCharacter: standardCost,
        averageLatency: 1500, // ms
        recommendedUse: 'primary'
      });

      // Neural voice profile
      this.voiceProfiles.set(`${language}-neural`, {
        language,
        voiceType: 'neural',
        qualityScore: 9.0, // Excellent quality
        costPerCharacter: neuralCost,
        averageLatency: 2000, // ms (slightly slower)
        recommendedUse: 'primary'
      });
    }
  }

  /**
   * Update recommendation based on performance metrics
   */
  private updateRecommendation(profile: VoiceOptimizationProfile): void {
    // High quality and reasonable latency
    if (profile.qualityScore >= 8 && profile.averageLatency <= 2500) {
      profile.recommendedUse = 'primary';
    }
    // Moderate quality or higher latency
    else if (profile.qualityScore >= 6 && profile.averageLatency <= 4000) {
      profile.recommendedUse = 'fallback';
    }
    // Poor quality or very high latency
    else {
      profile.recommendedUse = 'avoid';
    }
  }

  /**
   * Get optimization statistics
   */
  getOptimizationStats(): {
    averageCompressionRatio: number;
    averageFileSize: number;
    formatDistribution: Record<string, number>;
    recommendedVoices: Record<TargetLanguage, string>;
  } {
    // This would track actual optimization statistics in a real implementation
    const recommendations = this.getVoiceRecommendations();
    
    return {
      averageCompressionRatio: 0.7, // Placeholder
      averageFileSize: 45000, // Placeholder: ~45KB average
      formatDistribution: { mp3: 85, ogg: 10, wav: 5 }, // Placeholder percentages
      recommendedVoices: recommendations.reduce((acc, rec) => {
        acc[rec.language] = `${rec.recommended.voiceType} (${rec.recommended.qualityScore}/10)`;
        return acc;
      }, {} as Record<TargetLanguage, string>)
    };
  }

  /**
   * Update optimization configuration
   */
  updateConfig(newConfig: Partial<AudioOptimizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): AudioOptimizationConfig {
    return { ...this.config };
  }
}