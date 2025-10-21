import { createHash } from 'crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, extname } from 'path';
import { TargetLanguage } from './types';

export interface AudioFileInfo {
  id: string;
  text: string;
  language: TargetLanguage;
  voiceType: 'neural' | 'standard' | 'local';
  format: string;
  duration?: number;
  size: number;
  filePath: string;
  url: string;
  createdAt: Date;
  lastAccessed: Date;
}

export interface AudioCacheConfig {
  maxSizeBytes: number;
  maxAgeHours: number;
  cleanupIntervalMinutes: number;
}

export class AudioManager {
  private audioDir: string;
  private cacheIndex: Map<string, AudioFileInfo> = new Map();
  private config: AudioCacheConfig;
  private cleanupTimer?: NodeJS.Timeout;
  private serverPort: number;

  constructor(
    audioDir: string = './audio-cache',
    config: AudioCacheConfig = {
      maxSizeBytes: 100 * 1024 * 1024, // 100MB
      maxAgeHours: 24,
      cleanupIntervalMinutes: 60
    },
    serverPort: number = 3001
  ) {
    this.audioDir = audioDir;
    this.config = config;
    this.serverPort = serverPort;
    this.ensureAudioDir();
    this.loadCacheIndex();
    this.startCleanupTimer();
  }

  /**
   * Generate a unique ID for audio content
   */
  private generateAudioId(text: string, language: TargetLanguage, voiceType: string): string {
    const content = `${text}-${language}-${voiceType}`;
    return createHash('md5').update(content).digest('hex');
  }

  /**
   * Store audio file and return file info
   */
  async storeAudioFile(
    audioBuffer: Buffer,
    text: string,
    language: TargetLanguage,
    voiceType: 'neural' | 'standard' | 'local',
    format: string = 'mp3',
    duration?: number
  ): Promise<AudioFileInfo> {
    const audioId = this.generateAudioId(text, language, voiceType);
    const fileName = `${audioId}.${format}`;
    const filePath = join(this.audioDir, fileName);
    
    // Check if file already exists
    if (this.cacheIndex.has(audioId)) {
      const existing = this.cacheIndex.get(audioId)!;
      existing.lastAccessed = new Date();
      this.saveCacheIndex();
      return existing;
    }

    // Write audio file
    writeFileSync(filePath, audioBuffer);

    // Create file info
    const audioInfo: AudioFileInfo = {
      id: audioId,
      text,
      language,
      voiceType,
      format,
      duration,
      size: audioBuffer.length,
      filePath,
      url: this.generateAudioUrl(fileName),
      createdAt: new Date(),
      lastAccessed: new Date()
    };

    // Add to cache index
    this.cacheIndex.set(audioId, audioInfo);
    this.saveCacheIndex();

    console.log(`Stored audio file: ${fileName} (${audioBuffer.length} bytes)`);
    return audioInfo;
  }

  /**
   * Get audio file info by content
   */
  getAudioInfo(text: string, language: TargetLanguage, voiceType: 'neural' | 'standard' | 'local'): AudioFileInfo | null {
    const audioId = this.generateAudioId(text, language, voiceType);
    const audioInfo = this.cacheIndex.get(audioId);
    
    if (audioInfo && existsSync(audioInfo.filePath)) {
      // Update last accessed time
      audioInfo.lastAccessed = new Date();
      this.saveCacheIndex();
      return audioInfo;
    }

    // Clean up stale cache entry
    if (audioInfo) {
      this.cacheIndex.delete(audioId);
      this.saveCacheIndex();
    }

    return null;
  }

  /**
   * Get audio file by ID
   */
  getAudioById(audioId: string): AudioFileInfo | null {
    const audioInfo = this.cacheIndex.get(audioId);
    
    if (audioInfo && existsSync(audioInfo.filePath)) {
      audioInfo.lastAccessed = new Date();
      this.saveCacheIndex();
      return audioInfo;
    }

    // Clean up stale cache entry
    if (audioInfo) {
      this.cacheIndex.delete(audioId);
      this.saveCacheIndex();
    }

    return null;
  }

  /**
   * Generate local network URL for audio file
   */
  private generateAudioUrl(fileName: string): string {
    return `http://127.0.0.1:${this.serverPort}/audio/${fileName}`;
  }

  /**
   * Get audio file buffer
   */
  getAudioBuffer(audioId: string): Buffer | null {
    const audioInfo = this.cacheIndex.get(audioId);
    
    if (audioInfo && existsSync(audioInfo.filePath)) {
      audioInfo.lastAccessed = new Date();
      this.saveCacheIndex();
      return readFileSync(audioInfo.filePath);
    }

    return null;
  }

  /**
   * Clean up old and large files
   */
  cleanup(): void {
    const now = new Date();
    const maxAge = this.config.maxAgeHours * 60 * 60 * 1000;
    let totalSize = 0;
    const filesToDelete: string[] = [];

    // Calculate total size and identify old files
    for (const [audioId, audioInfo] of this.cacheIndex.entries()) {
      const age = now.getTime() - audioInfo.lastAccessed.getTime();
      
      if (age > maxAge) {
        filesToDelete.push(audioId);
      } else {
        totalSize += audioInfo.size;
      }
    }

    // Delete old files
    for (const audioId of filesToDelete) {
      this.deleteAudioFile(audioId);
    }

    // If still over size limit, delete least recently used files
    if (totalSize > this.config.maxSizeBytes) {
      const sortedByAccess = Array.from(this.cacheIndex.entries())
        .sort(([, a], [, b]) => a.lastAccessed.getTime() - b.lastAccessed.getTime());

      for (const [audioId, audioInfo] of sortedByAccess) {
        if (totalSize <= this.config.maxSizeBytes) break;
        
        this.deleteAudioFile(audioId);
        totalSize -= audioInfo.size;
      }
    }

    console.log(`Audio cache cleanup completed. Files: ${this.cacheIndex.size}, Total size: ${totalSize} bytes`);
  }

  /**
   * Delete specific audio file
   */
  private deleteAudioFile(audioId: string): void {
    const audioInfo = this.cacheIndex.get(audioId);
    if (audioInfo) {
      try {
        if (existsSync(audioInfo.filePath)) {
          unlinkSync(audioInfo.filePath);
        }
        this.cacheIndex.delete(audioId);
        console.log(`Deleted audio file: ${audioInfo.filePath}`);
      } catch (error) {
        console.error(`Failed to delete audio file ${audioInfo.filePath}:`, error);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    fileCount: number;
    totalSize: number;
    oldestFile: Date | null;
    newestFile: Date | null;
  } {
    let totalSize = 0;
    let oldestFile: Date | null = null;
    let newestFile: Date | null = null;

    for (const audioInfo of this.cacheIndex.values()) {
      totalSize += audioInfo.size;
      
      if (!oldestFile || audioInfo.createdAt < oldestFile) {
        oldestFile = audioInfo.createdAt;
      }
      
      if (!newestFile || audioInfo.createdAt > newestFile) {
        newestFile = audioInfo.createdAt;
      }
    }

    return {
      fileCount: this.cacheIndex.size,
      totalSize,
      oldestFile,
      newestFile
    };
  }

  /**
   * Clear all cached audio files
   */
  clearCache(): void {
    for (const audioId of this.cacheIndex.keys()) {
      this.deleteAudioFile(audioId);
    }
    this.saveCacheIndex();
    console.log('Audio cache cleared');
  }

  /**
   * Shutdown cleanup
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  // Private methods

  private ensureAudioDir(): void {
    if (!existsSync(this.audioDir)) {
      mkdirSync(this.audioDir, { recursive: true });
      console.log(`Created audio directory: ${this.audioDir}`);
    }
  }

  private getCacheIndexPath(): string {
    return join(this.audioDir, 'cache-index.json');
  }

  private loadCacheIndex(): void {
    const indexPath = this.getCacheIndexPath();
    
    if (existsSync(indexPath)) {
      try {
        const data = JSON.parse(readFileSync(indexPath, 'utf8'));
        
        for (const [audioId, audioInfo] of Object.entries(data)) {
          this.cacheIndex.set(audioId, {
            ...(audioInfo as any),
            createdAt: new Date((audioInfo as any).createdAt),
            lastAccessed: new Date((audioInfo as any).lastAccessed)
          });
        }
        
        console.log(`Loaded ${this.cacheIndex.size} audio files from cache index`);
      } catch (error) {
        console.error('Failed to load cache index:', error);
      }
    }
  }

  private saveCacheIndex(): void {
    try {
      const indexPath = this.getCacheIndexPath();
      const data = Object.fromEntries(this.cacheIndex.entries());
      writeFileSync(indexPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save cache index:', error);
    }
  }

  private startCleanupTimer(): void {
    const intervalMs = this.config.cleanupIntervalMinutes * 60 * 1000;
    
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, intervalMs);
    
    console.log(`Started audio cache cleanup timer (${this.config.cleanupIntervalMinutes} minutes)`);
  }
}
