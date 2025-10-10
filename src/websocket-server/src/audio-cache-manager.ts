import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { TargetLanguage } from './types';

export interface CacheEntry {
  key: string;
  audioBuffer: Buffer;
  format: string;
  voiceId: string;
  voiceType: 'neural' | 'standard';
  duration: number;
  size: number;
  createdAt: Date;
  lastAccessed: Date;
  accessCount: number;
  language: TargetLanguage;
  textHash: string;
}

export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  mostAccessed: Array<{ key: string; count: number; text: string }>;
  oldestEntry: Date | null;
  newestEntry: Date | null;
}

export interface CacheConfig {
  maxSize: number; // Maximum cache size in bytes
  maxEntries: number; // Maximum number of entries
  maxAge: number; // Maximum age in milliseconds
  compressionEnabled: boolean;
  persistToDisk: boolean;
  diskCachePath?: string;
}

export class AudioCacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private config: CacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0
  };

  constructor(config: CacheConfig = {
    maxSize: 100 * 1024 * 1024, // 100MB
    maxEntries: 1000,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    compressionEnabled: true,
    persistToDisk: true,
    diskCachePath: './audio-cache'
  }) {
    this.config = config;
    
    if (this.config.persistToDisk && this.config.diskCachePath) {
      this.ensureCacheDirectory();
      this.loadFromDisk();
    }

    // Start cleanup interval
    setInterval(() => this.cleanup(), 60000); // Every minute
  }

  /**
   * Generate cache key for text and language combination
   */
  generateCacheKey(text: string, language: TargetLanguage, voiceType: 'neural' | 'standard'): string {
    const textHash = crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
    return `${language}-${voiceType}-${textHash}`;
  }

  /**
   * Check if audio is cached
   */
  has(text: string, language: TargetLanguage, voiceType: 'neural' | 'standard'): boolean {
    const key = this.generateCacheKey(text, language, voiceType);
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    // Check if entry is expired
    if (Date.now() - entry.createdAt.getTime() > this.config.maxAge) {
      this.cache.delete(key);
      this.deleteFromDisk(key);
      return false;
    }

    return true;
  }

  /**
   * Get cached audio
   */
  get(text: string, language: TargetLanguage, voiceType: 'neural' | 'standard'): CacheEntry | null {
    const key = this.generateCacheKey(text, language, voiceType);
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if entry is expired
    if (Date.now() - entry.createdAt.getTime() > this.config.maxAge) {
      this.cache.delete(key);
      this.deleteFromDisk(key);
      this.stats.misses++;
      return null;
    }

    // Update access statistics
    entry.lastAccessed = new Date();
    entry.accessCount++;
    this.stats.hits++;

    return entry;
  }

  /**
   * Store audio in cache
   */
  set(
    text: string,
    language: TargetLanguage,
    voiceType: 'neural' | 'standard',
    audioBuffer: Buffer,
    format: string,
    voiceId: string,
    duration: number
  ): void {
    const key = this.generateCacheKey(text, language, voiceType);
    const textHash = crypto.createHash('sha256').update(text).digest('hex').substring(0, 8);
    
    const entry: CacheEntry = {
      key,
      audioBuffer,
      format,
      voiceId,
      voiceType,
      duration,
      size: audioBuffer.length,
      createdAt: new Date(),
      lastAccessed: new Date(),
      accessCount: 1,
      language,
      textHash
    };

    // Check if we need to evict entries
    this.evictIfNeeded(entry.size);

    // Store in memory cache
    this.cache.set(key, entry);

    // Persist to disk if enabled
    if (this.config.persistToDisk) {
      this.saveToDisk(entry);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;

    const mostAccessed = entries
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, 10)
      .map(entry => ({
        key: entry.key,
        count: entry.accessCount,
        text: `${entry.language} audio (${entry.voiceType})`
      }));

    const dates = entries.map(e => e.createdAt.getTime());
    const oldestEntry = dates.length > 0 ? new Date(Math.min(...dates)) : null;
    const newestEntry = dates.length > 0 ? new Date(Math.max(...dates)) : null;

    return {
      totalEntries: entries.length,
      totalSize,
      hitRate,
      mostAccessed,
      oldestEntry,
      newestEntry
    };
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
    
    if (this.config.persistToDisk && this.config.diskCachePath) {
      try {
        const files = fs.readdirSync(this.config.diskCachePath);
        for (const file of files) {
          if (file.endsWith('.cache')) {
            fs.unlinkSync(path.join(this.config.diskCachePath, file));
          }
        }
      } catch (error) {
        console.error('Failed to clear disk cache:', error);
      }
    }
  }

  /**
   * Remove expired entries and enforce size limits
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    // Find expired entries
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.createdAt.getTime() > this.config.maxAge) {
        expiredKeys.push(key);
      }
    }

    // Remove expired entries
    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.deleteFromDisk(key);
    }

    // Enforce size and count limits
    this.evictIfNeeded(0);
  }

  /**
   * Evict entries if cache limits are exceeded
   */
  private evictIfNeeded(newEntrySize: number): void {
    const currentSize = Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.size, 0);
    
    // Check size limit
    if (currentSize + newEntrySize > this.config.maxSize) {
      this.evictLeastRecentlyUsed(currentSize + newEntrySize - this.config.maxSize);
    }

    // Check entry count limit
    if (this.cache.size >= this.config.maxEntries) {
      this.evictLeastRecentlyUsed(0, this.cache.size - this.config.maxEntries + 1);
    }
  }

  /**
   * Evict least recently used entries
   */
  private evictLeastRecentlyUsed(bytesToFree: number, entriesToFree: number = 0): void {
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.lastAccessed.getTime() - b.lastAccessed.getTime());

    let freedBytes = 0;
    let freedEntries = 0;

    for (const [key, entry] of entries) {
      if ((bytesToFree > 0 && freedBytes >= bytesToFree) && 
          (entriesToFree > 0 && freedEntries >= entriesToFree)) {
        break;
      }

      this.cache.delete(key);
      this.deleteFromDisk(key);
      freedBytes += entry.size;
      freedEntries++;
      this.stats.evictions++;
    }
  }

  /**
   * Ensure cache directory exists
   */
  private ensureCacheDirectory(): void {
    if (this.config.diskCachePath && !fs.existsSync(this.config.diskCachePath)) {
      fs.mkdirSync(this.config.diskCachePath, { recursive: true });
    }
  }

  /**
   * Save cache entry to disk
   */
  private saveToDisk(entry: CacheEntry): void {
    if (!this.config.diskCachePath) return;

    try {
      const filename = `${entry.key}.cache`;
      const filepath = path.join(this.config.diskCachePath, filename);
      
      const metadata = {
        key: entry.key,
        format: entry.format,
        voiceId: entry.voiceId,
        voiceType: entry.voiceType,
        duration: entry.duration,
        size: entry.size,
        createdAt: entry.createdAt.toISOString(),
        lastAccessed: entry.lastAccessed.toISOString(),
        accessCount: entry.accessCount,
        language: entry.language,
        textHash: entry.textHash
      };

      const data = {
        metadata,
        audioBuffer: entry.audioBuffer.toString('base64')
      };

      fs.writeFileSync(filepath, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save cache entry to disk:', error);
    }
  }

  /**
   * Load cache from disk
   */
  private loadFromDisk(): void {
    if (!this.config.diskCachePath || !fs.existsSync(this.config.diskCachePath)) {
      return;
    }

    try {
      const files = fs.readdirSync(this.config.diskCachePath);
      
      for (const file of files) {
        if (!file.endsWith('.cache')) continue;

        try {
          const filepath = path.join(this.config.diskCachePath, file);
          const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
          
          const entry: CacheEntry = {
            ...data.metadata,
            audioBuffer: Buffer.from(data.audioBuffer, 'base64'),
            createdAt: new Date(data.metadata.createdAt),
            lastAccessed: new Date(data.metadata.lastAccessed)
          };

          // Check if entry is still valid
          if (Date.now() - entry.createdAt.getTime() <= this.config.maxAge) {
            this.cache.set(entry.key, entry);
          } else {
            // Delete expired file
            fs.unlinkSync(filepath);
          }
        } catch (error) {
          console.error(`Failed to load cache file ${file}:`, error);
        }
      }

      console.log(`Loaded ${this.cache.size} entries from disk cache`);
    } catch (error) {
      console.error('Failed to load cache from disk:', error);
    }
  }

  /**
   * Delete cache entry from disk
   */
  private deleteFromDisk(key: string): void {
    if (!this.config.diskCachePath) return;

    try {
      const filename = `${key}.cache`;
      const filepath = path.join(this.config.diskCachePath, filename);
      
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    } catch (error) {
      console.error('Failed to delete cache file:', error);
    }
  }

  /**
   * Get cache hit rate
   */
  getHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    return total > 0 ? (this.stats.hits / total) * 100 : 0;
  }

  /**
   * Update cache configuration
   */
  updateConfig(newConfig: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // If disk caching was enabled, ensure directory exists
    if (newConfig.persistToDisk && newConfig.diskCachePath) {
      this.ensureCacheDirectory();
    }
  }
}