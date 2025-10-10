#!/usr/bin/env node

/**
 * Maintenance Script
 * Handles cleanup, monitoring, and maintenance tasks
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadEnvironmentConfig } from '../config/environment';

interface MaintenanceStats {
  audioFiles: {
    total: number;
    totalSize: number;
    byLanguage: Record<string, { count: number; size: number }>;
    oldFiles: string[];
  };
  logs: {
    totalSize: number;
    oldLogs: string[];
  };
  sessions: {
    active: number;
    total: number;
  };
}

class MaintenanceManager {
  private config: any;

  constructor() {
    this.config = loadEnvironmentConfig();
  }

  async runMaintenance(): Promise<void> {
    console.log('🧹 Running Service Translate maintenance...');

    try {
      // Get current stats
      const stats = await this.getMaintenanceStats();
      this.displayStats(stats);

      // Perform cleanup tasks
      await this.cleanupAudioFiles();
      await this.cleanupLogs();
      await this.cleanupTempFiles();

      // Optimize storage
      await this.optimizeStorage();

      // Generate maintenance report
      await this.generateMaintenanceReport(stats);

      console.log('✅ Maintenance completed successfully!');

    } catch (error) {
      console.error('❌ Maintenance failed:', error);
      process.exit(1);
    }
  }

  async getMaintenanceStats(): Promise<MaintenanceStats> {
    console.log('📊 Gathering maintenance statistics...');

    const stats: MaintenanceStats = {
      audioFiles: {
        total: 0,
        totalSize: 0,
        byLanguage: {},
        oldFiles: [],
      },
      logs: {
        totalSize: 0,
        oldLogs: [],
      },
      sessions: {
        active: 0,
        total: 0,
      },
    };

    // Analyze audio files
    if (fs.existsSync(this.config.audio.storagePath)) {
      await this.analyzeAudioFiles(stats);
    }

    // Analyze log files
    const logDir = path.dirname(this.config.monitoring.logFilePath);
    if (fs.existsSync(logDir)) {
      await this.analyzeLogFiles(stats, logDir);
    }

    return stats;
  }

  private async analyzeAudioFiles(stats: MaintenanceStats): Promise<void> {
    const audioDir = this.config.audio.storagePath;
    const maxAgeMs = this.config.audio.maxAgeHours * 60 * 60 * 1000;
    const now = Date.now();

    const languages = ['EN', 'ES', 'FR', 'DE', 'IT'];

    for (const lang of languages) {
      const langDir = path.join(audioDir, lang);
      stats.audioFiles.byLanguage[lang] = { count: 0, size: 0 };

      if (fs.existsSync(langDir)) {
        const files = fs.readdirSync(langDir);

        for (const file of files) {
          if (file.endsWith('.mp3')) {
            const filePath = path.join(langDir, file);
            const fileStat = fs.statSync(filePath);

            stats.audioFiles.total++;
            stats.audioFiles.totalSize += fileStat.size;
            stats.audioFiles.byLanguage[lang].count++;
            stats.audioFiles.byLanguage[lang].size += fileStat.size;

            // Check if file is old
            if (now - fileStat.mtime.getTime() > maxAgeMs) {
              stats.audioFiles.oldFiles.push(filePath);
            }
          }
        }
      }
    }

    // Check temp directory
    const tempDir = path.join(audioDir, 'temp');
    if (fs.existsSync(tempDir)) {
      const tempFiles = fs.readdirSync(tempDir);
      for (const file of tempFiles) {
        const filePath = path.join(tempDir, file);
        const fileStat = fs.statSync(filePath);

        // All temp files older than 1 hour are considered old
        if (now - fileStat.mtime.getTime() > 60 * 60 * 1000) {
          stats.audioFiles.oldFiles.push(filePath);
        }
      }
    }
  }

  private async analyzeLogFiles(stats: MaintenanceStats, logDir: string): Promise<void> {
    if (!fs.existsSync(logDir)) return;

    const files = fs.readdirSync(logDir);
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
    const now = Date.now();

    for (const file of files) {
      if (file.endsWith('.log')) {
        const filePath = path.join(logDir, file);
        const fileStat = fs.statSync(filePath);

        stats.logs.totalSize += fileStat.size;

        // Check if log file is old
        if (now - fileStat.mtime.getTime() > maxAgeMs) {
          stats.logs.oldLogs.push(filePath);
        }
      }
    }
  }

  private displayStats(stats: MaintenanceStats): void {
    console.log('\n📊 Current Statistics:');
    console.log(`   Audio Files: ${stats.audioFiles.total} (${this.formatBytes(stats.audioFiles.totalSize)})`);
    
    Object.entries(stats.audioFiles.byLanguage).forEach(([lang, data]) => {
      if (data.count > 0) {
        console.log(`     ${lang}: ${data.count} files (${this.formatBytes(data.size)})`);
      }
    });

    console.log(`   Log Files: ${this.formatBytes(stats.logs.totalSize)}`);
    console.log(`   Old Audio Files: ${stats.audioFiles.oldFiles.length}`);
    console.log(`   Old Log Files: ${stats.logs.oldLogs.length}`);
  }

  private async cleanupAudioFiles(): Promise<void> {
    console.log('\n🗑️  Cleaning up old audio files...');

    const audioDir = this.config.audio.storagePath;
    const maxAgeMs = this.config.audio.maxAgeHours * 60 * 60 * 1000;
    const maxCacheSizeBytes = this.config.audio.cacheSizeMB * 1024 * 1024;
    const now = Date.now();

    let totalSize = 0;
    const allFiles: Array<{ path: string; size: number; mtime: number }> = [];

    // Collect all audio files with metadata
    const languages = ['EN', 'ES', 'FR', 'DE', 'IT'];
    for (const lang of languages) {
      const langDir = path.join(audioDir, lang);
      if (fs.existsSync(langDir)) {
        const files = fs.readdirSync(langDir);
        for (const file of files) {
          if (file.endsWith('.mp3')) {
            const filePath = path.join(langDir, file);
            const fileStat = fs.statSync(filePath);
            allFiles.push({
              path: filePath,
              size: fileStat.size,
              mtime: fileStat.mtime.getTime(),
            });
            totalSize += fileStat.size;
          }
        }
      }
    }

    let deletedCount = 0;
    let deletedSize = 0;

    // Delete files older than maxAge
    for (const file of allFiles) {
      if (now - file.mtime > maxAgeMs) {
        try {
          fs.unlinkSync(file.path);
          deletedCount++;
          deletedSize += file.size;
          totalSize -= file.size;
          console.log(`   Deleted old file: ${path.basename(file.path)}`);
        } catch (error) {
          console.warn(`   Failed to delete ${file.path}:`, error);
        }
      }
    }

    // If still over cache size limit, delete oldest files
    if (totalSize > maxCacheSizeBytes) {
      console.log(`   Cache size (${this.formatBytes(totalSize)}) exceeds limit (${this.formatBytes(maxCacheSizeBytes)})`);
      
      const remainingFiles = allFiles
        .filter(file => now - file.mtime <= maxAgeMs)
        .sort((a, b) => a.mtime - b.mtime); // Oldest first

      for (const file of remainingFiles) {
        if (totalSize <= maxCacheSizeBytes) break;

        try {
          fs.unlinkSync(file.path);
          deletedCount++;
          deletedSize += file.size;
          totalSize -= file.size;
          console.log(`   Deleted for cache limit: ${path.basename(file.path)}`);
        } catch (error) {
          console.warn(`   Failed to delete ${file.path}:`, error);
        }
      }
    }

    // Clean up temp directory
    const tempDir = path.join(audioDir, 'temp');
    if (fs.existsSync(tempDir)) {
      const tempFiles = fs.readdirSync(tempDir);
      for (const file of tempFiles) {
        const filePath = path.join(tempDir, file);
        const fileStat = fs.statSync(filePath);

        // Delete temp files older than 1 hour
        if (now - fileStat.mtime.getTime() > 60 * 60 * 1000) {
          try {
            fs.unlinkSync(filePath);
            deletedCount++;
            deletedSize += fileStat.size;
            console.log(`   Deleted temp file: ${file}`);
          } catch (error) {
            console.warn(`   Failed to delete temp file ${filePath}:`, error);
          }
        }
      }
    }

    console.log(`✅ Audio cleanup completed: ${deletedCount} files (${this.formatBytes(deletedSize)}) deleted`);
  }

  private async cleanupLogs(): Promise<void> {
    console.log('\n📝 Cleaning up old log files...');

    const logDir = path.dirname(this.config.monitoring.logFilePath);
    if (!fs.existsSync(logDir)) return;

    const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
    const now = Date.now();
    let deletedCount = 0;
    let deletedSize = 0;

    const files = fs.readdirSync(logDir);
    for (const file of files) {
      if (file.endsWith('.log') && file !== path.basename(this.config.monitoring.logFilePath)) {
        const filePath = path.join(logDir, file);
        const fileStat = fs.statSync(filePath);

        if (now - fileStat.mtime.getTime() > maxAgeMs) {
          try {
            fs.unlinkSync(filePath);
            deletedCount++;
            deletedSize += fileStat.size;
            console.log(`   Deleted old log: ${file}`);
          } catch (error) {
            console.warn(`   Failed to delete log ${filePath}:`, error);
          }
        }
      }
    }

    console.log(`✅ Log cleanup completed: ${deletedCount} files (${this.formatBytes(deletedSize)}) deleted`);
  }

  private async cleanupTempFiles(): Promise<void> {
    console.log('\n🗂️  Cleaning up temporary files...');

    const tempDirs = [
      path.join(this.config.audio.storagePath, 'temp'),
      path.join(process.cwd(), 'temp'),
      path.join(process.cwd(), 'tmp'),
    ];

    let deletedCount = 0;

    for (const tempDir of tempDirs) {
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        for (const file of files) {
          const filePath = path.join(tempDir, file);
          try {
            const fileStat = fs.statSync(filePath);
            if (fileStat.isFile()) {
              fs.unlinkSync(filePath);
              deletedCount++;
            }
          } catch (error) {
            console.warn(`   Failed to delete temp file ${filePath}:`, error);
          }
        }
      }
    }

    console.log(`✅ Temp cleanup completed: ${deletedCount} files deleted`);
  }

  private async optimizeStorage(): Promise<void> {
    console.log('\n⚡ Optimizing storage...');

    // Create language directories if they don't exist
    const languages = ['EN', 'ES', 'FR', 'DE', 'IT'];
    for (const lang of languages) {
      const langDir = path.join(this.config.audio.storagePath, lang);
      if (!fs.existsSync(langDir)) {
        fs.mkdirSync(langDir, { recursive: true });
        console.log(`   Created directory: ${lang}`);
      }
    }

    // Ensure temp and cache directories exist
    const subdirs = ['temp', 'cache'];
    for (const subdir of subdirs) {
      const dir = path.join(this.config.audio.storagePath, subdir);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`   Created directory: ${subdir}`);
      }
    }

    console.log('✅ Storage optimization completed');
  }

  private async generateMaintenanceReport(stats: MaintenanceStats): Promise<void> {
    const report = `# Service Translate - Maintenance Report

Generated: ${new Date().toISOString()}

## Storage Statistics

### Audio Files
- **Total Files**: ${stats.audioFiles.total}
- **Total Size**: ${this.formatBytes(stats.audioFiles.totalSize)}
- **Cache Limit**: ${this.formatBytes(this.config.audio.cacheSizeMB * 1024 * 1024)}
- **Max Age**: ${this.config.audio.maxAgeHours} hours

#### By Language
${Object.entries(stats.audioFiles.byLanguage)
  .map(([lang, data]) => `- **${lang}**: ${data.count} files (${this.formatBytes(data.size)})`)
  .join('\n')}

### Log Files
- **Total Size**: ${this.formatBytes(stats.logs.totalSize)}
- **Old Files Cleaned**: ${stats.logs.oldLogs.length}

## Cleanup Summary
- **Old Audio Files**: ${stats.audioFiles.oldFiles.length} files cleaned
- **Old Log Files**: ${stats.logs.oldLogs.length} files cleaned

## Configuration
- **Audio Storage Path**: ${this.config.audio.storagePath}
- **Log File Path**: ${this.config.monitoring.logFilePath}
- **Cleanup Interval**: ${this.config.audio.cleanupIntervalHours} hours
- **Cache Size Limit**: ${this.config.audio.cacheSizeMB} MB

## Recommendations
${this.generateRecommendations(stats)}

---
*This report was generated automatically by the Service Translate maintenance system.*
`;

    fs.writeFileSync('MAINTENANCE_REPORT.md', report);
    console.log('✅ Maintenance report generated: MAINTENANCE_REPORT.md');
  }

  private generateRecommendations(stats: MaintenanceStats): string {
    const recommendations: string[] = [];

    // Check cache usage
    const cacheUsagePercent = (stats.audioFiles.totalSize / (this.config.audio.cacheSizeMB * 1024 * 1024)) * 100;
    if (cacheUsagePercent > 80) {
      recommendations.push('- Consider increasing the audio cache size limit or reducing max file age');
    }

    // Check file distribution
    const totalFiles = stats.audioFiles.total;
    Object.entries(stats.audioFiles.byLanguage).forEach(([lang, data]) => {
      const percentage = (data.count / totalFiles) * 100;
      if (percentage > 50) {
        recommendations.push(`- Language ${lang} has ${percentage.toFixed(1)}% of all files - consider language-specific cleanup policies`);
      }
    });

    // Check old files
    if (stats.audioFiles.oldFiles.length > 100) {
      recommendations.push('- High number of old files detected - consider running maintenance more frequently');
    }

    if (recommendations.length === 0) {
      recommendations.push('- No specific recommendations at this time - system is running optimally');
    }

    return recommendations.join('\n');
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// CLI interface
if (require.main === module) {
  const manager = new MaintenanceManager();
  
  const command = process.argv[2];
  
  if (command === 'stats') {
    manager.getMaintenanceStats().then(stats => {
      manager.displayStats(stats);
    }).catch(console.error);
  } else {
    manager.runMaintenance().catch(console.error);
  }
}

export { MaintenanceManager };