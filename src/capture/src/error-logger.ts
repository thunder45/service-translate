import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface ErrorLogEntry {
  timestamp: Date;
  level: 'error' | 'warn' | 'info' | 'debug';
  category: 'tts' | 'websocket' | 'translation' | 'audio' | 'system';
  message: string;
  details?: any;
  stackTrace?: string;
  sessionId?: string;
  userId?: string;
  performance?: {
    duration?: number;
    memoryUsage?: NodeJS.MemoryUsage;
    cpuUsage?: NodeJS.CpuUsage;
  };
}

export interface PerformanceMetrics {
  ttsLatency: {
    polly: number[];
    local: number[];
    average: number;
  };
  audioGeneration: {
    successRate: number;
    failureRate: number;
    totalRequests: number;
  };
  websocketHealth: {
    connectionUptime: number;
    reconnectionCount: number;
    messageLatency: number[];
  };
  memoryUsage: {
    current: NodeJS.MemoryUsage;
    peak: NodeJS.MemoryUsage;
    trend: 'increasing' | 'stable' | 'decreasing';
  };
}

export class ErrorLogger extends EventEmitter {
  private logFile: string;
  private performanceFile: string;
  private logBuffer: ErrorLogEntry[] = [];
  private performanceMetrics: PerformanceMetrics;
  private flushTimer: NodeJS.Timeout | null = null;
  private maxLogSize = 10 * 1024 * 1024; // 10MB
  private maxBufferSize = 100;
  private baselineCpuUsage: NodeJS.CpuUsage;

  constructor() {
    super();
    
    // Initialize log files
    const logDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().split('T')[0];
    this.logFile = path.join(logDir, `tts-service-${timestamp}.log`);
    this.performanceFile = path.join(logDir, `performance-${timestamp}.json`);
    
    // Initialize performance metrics
    this.performanceMetrics = {
      ttsLatency: {
        polly: [],
        local: [],
        average: 0
      },
      audioGeneration: {
        successRate: 100,
        failureRate: 0,
        totalRequests: 0
      },
      websocketHealth: {
        connectionUptime: 0,
        reconnectionCount: 0,
        messageLatency: []
      },
      memoryUsage: {
        current: process.memoryUsage(),
        peak: process.memoryUsage(),
        trend: 'stable'
      }
    };
    
    // Get baseline CPU usage
    this.baselineCpuUsage = process.cpuUsage();
    
    // Start periodic performance monitoring
    this.startPerformanceMonitoring();
    
    // Set up graceful shutdown
    process.on('exit', () => this.flush());
    process.on('SIGINT', () => this.flush());
    process.on('SIGTERM', () => this.flush());
  }

  /**
   * Log an error with context
   */
  error(category: ErrorLogEntry['category'], message: string, details?: any, sessionId?: string): void {
    this.log('error', category, message, details, sessionId);
  }

  /**
   * Log a warning
   */
  warn(category: ErrorLogEntry['category'], message: string, details?: any, sessionId?: string): void {
    this.log('warn', category, message, details, sessionId);
  }

  /**
   * Log information
   */
  info(category: ErrorLogEntry['category'], message: string, details?: any, sessionId?: string): void {
    this.log('info', category, message, details, sessionId);
  }

  /**
   * Log debug information
   */
  debug(category: ErrorLogEntry['category'], message: string, details?: any, sessionId?: string): void {
    this.log('debug', category, message, details, sessionId);
  }

  /**
   * Log TTS operation with performance metrics
   */
  logTTSOperation(
    operation: 'polly-request' | 'polly-success' | 'polly-failure' | 'local-tts' | 'fallback-triggered',
    details: {
      text?: string;
      language?: string;
      voiceType?: string;
      duration?: number;
      error?: string;
      fallbackMethod?: string;
      sessionId?: string;
    }
  ): void {
    const entry: ErrorLogEntry = {
      timestamp: new Date(),
      level: operation.includes('failure') ? 'error' : 'info',
      category: 'tts',
      message: `TTS Operation: ${operation}`,
      details,
      sessionId: details.sessionId,
      performance: {
        duration: details.duration,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(this.baselineCpuUsage)
      }
    };

    this.addToBuffer(entry);
    
    // Update performance metrics
    this.updateTTSMetrics(operation, details);
  }

  /**
   * Log WebSocket events
   */
  logWebSocketEvent(
    event: 'connect' | 'disconnect' | 'reconnect' | 'message-sent' | 'message-received' | 'error',
    details: {
      reason?: string;
      messageType?: string;
      latency?: number;
      error?: string;
      sessionId?: string;
    }
  ): void {
    const entry: ErrorLogEntry = {
      timestamp: new Date(),
      level: event === 'error' ? 'error' : 'info',
      category: 'websocket',
      message: `WebSocket Event: ${event}`,
      details,
      sessionId: details.sessionId
    };

    this.addToBuffer(entry);
    
    // Update WebSocket metrics
    this.updateWebSocketMetrics(event, details);
  }

  /**
   * Log audio playback events
   */
  logAudioEvent(
    event: 'play-start' | 'play-success' | 'play-failure' | 'queue-add' | 'queue-clear',
    details: {
      audioUrl?: string;
      duration?: number;
      error?: string;
      queueLength?: number;
      sessionId?: string;
    }
  ): void {
    const entry: ErrorLogEntry = {
      timestamp: new Date(),
      level: event.includes('failure') ? 'error' : 'info',
      category: 'audio',
      message: `Audio Event: ${event}`,
      details,
      sessionId: details.sessionId
    };

    this.addToBuffer(entry);
  }

  /**
   * Log system events
   */
  logSystemEvent(
    event: 'startup' | 'shutdown' | 'memory-warning' | 'cpu-high' | 'disk-space-low',
    details?: any
  ): void {
    const entry: ErrorLogEntry = {
      timestamp: new Date(),
      level: event.includes('warning') || event.includes('high') || event.includes('low') ? 'warn' : 'info',
      category: 'system',
      message: `System Event: ${event}`,
      details,
      performance: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(this.baselineCpuUsage)
      }
    };

    this.addToBuffer(entry);
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return JSON.parse(JSON.stringify(this.performanceMetrics));
  }

  /**
   * Get recent error logs
   */
  getRecentLogs(count: number = 50, level?: ErrorLogEntry['level']): ErrorLogEntry[] {
    let logs = [...this.logBuffer];
    
    if (level) {
      logs = logs.filter(log => log.level === level);
    }
    
    return logs.slice(-count);
  }

  /**
   * Generate error report
   */
  generateErrorReport(sessionId?: string): {
    summary: {
      totalErrors: number;
      totalWarnings: number;
      ttsFailures: number;
      websocketIssues: number;
      audioProblems: number;
    };
    recentErrors: ErrorLogEntry[];
    performanceMetrics: PerformanceMetrics;
    recommendations: string[];
  } {
    const logs = sessionId 
      ? this.logBuffer.filter(log => log.sessionId === sessionId)
      : this.logBuffer;

    const summary = {
      totalErrors: logs.filter(log => log.level === 'error').length,
      totalWarnings: logs.filter(log => log.level === 'warn').length,
      ttsFailures: logs.filter(log => log.category === 'tts' && log.level === 'error').length,
      websocketIssues: logs.filter(log => log.category === 'websocket' && log.level === 'error').length,
      audioProblems: logs.filter(log => log.category === 'audio' && log.level === 'error').length
    };

    const recentErrors = logs
      .filter(log => log.level === 'error')
      .slice(-10);

    const recommendations = this.generateRecommendations(summary);

    return {
      summary,
      recentErrors,
      performanceMetrics: this.getPerformanceMetrics(),
      recommendations
    };
  }

  /**
   * Export logs to file
   */
  async exportLogs(filePath?: string): Promise<string> {
    const exportPath = filePath || path.join(app.getPath('userData'), 'logs', `export-${Date.now()}.json`);
    
    const exportData = {
      timestamp: new Date().toISOString(),
      logs: this.logBuffer,
      performanceMetrics: this.performanceMetrics,
      systemInfo: {
        platform: process.platform,
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
      }
    };

    await fs.promises.writeFile(exportPath, JSON.stringify(exportData, null, 2));
    return exportPath;
  }

  // Private methods

  private log(
    level: ErrorLogEntry['level'],
    category: ErrorLogEntry['category'],
    message: string,
    details?: any,
    sessionId?: string
  ): void {
    const entry: ErrorLogEntry = {
      timestamp: new Date(),
      level,
      category,
      message,
      details,
      sessionId,
      stackTrace: level === 'error' ? new Error().stack : undefined
    };

    this.addToBuffer(entry);
    
    // Emit event for real-time monitoring
    this.emit('log', entry);
    
    // Console output for development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${level.toUpperCase()}] ${category}: ${message}`, details || '');
    }
  }

  private addToBuffer(entry: ErrorLogEntry): void {
    this.logBuffer.push(entry);
    
    // Trim buffer if too large
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer = this.logBuffer.slice(-this.maxBufferSize);
    }
    
    // Schedule flush
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    
    this.flushTimer = setTimeout(() => {
      this.flush();
    }, 5000); // Flush every 5 seconds
  }

  private flush(): void {
    if (this.logBuffer.length === 0) return;
    
    try {
      // Append to log file
      const logLines = this.logBuffer.map(entry => JSON.stringify(entry)).join('\n') + '\n';
      fs.appendFileSync(this.logFile, logLines);
      
      // Update performance file
      fs.writeFileSync(this.performanceFile, JSON.stringify(this.performanceMetrics, null, 2));
      
      // Rotate log file if too large
      this.rotateLogFileIfNeeded();
      
      console.log(`Flushed ${this.logBuffer.length} log entries`);
      this.logBuffer = [];
      
    } catch (error) {
      console.error('Failed to flush logs:', error);
    }
  }

  private rotateLogFileIfNeeded(): void {
    try {
      const stats = fs.statSync(this.logFile);
      if (stats.size > this.maxLogSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedFile = this.logFile.replace('.log', `-${timestamp}.log`);
        fs.renameSync(this.logFile, rotatedFile);
        
        console.log(`Log file rotated: ${rotatedFile}`);
      }
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  private updateTTSMetrics(operation: string, details: any): void {
    if (operation === 'polly-success' && details.duration) {
      this.performanceMetrics.ttsLatency.polly.push(details.duration);
      if (this.performanceMetrics.ttsLatency.polly.length > 100) {
        this.performanceMetrics.ttsLatency.polly = this.performanceMetrics.ttsLatency.polly.slice(-100);
      }
    }
    
    if (operation === 'local-tts' && details.duration) {
      this.performanceMetrics.ttsLatency.local.push(details.duration);
      if (this.performanceMetrics.ttsLatency.local.length > 100) {
        this.performanceMetrics.ttsLatency.local = this.performanceMetrics.ttsLatency.local.slice(-100);
      }
    }
    
    // Update average latency
    const allLatencies = [
      ...this.performanceMetrics.ttsLatency.polly,
      ...this.performanceMetrics.ttsLatency.local
    ];
    
    if (allLatencies.length > 0) {
      this.performanceMetrics.ttsLatency.average = 
        allLatencies.reduce((sum, lat) => sum + lat, 0) / allLatencies.length;
    }
    
    // Update success/failure rates
    this.performanceMetrics.audioGeneration.totalRequests++;
    
    if (operation.includes('success')) {
      const total = this.performanceMetrics.audioGeneration.totalRequests;
      const failures = Math.round(total * this.performanceMetrics.audioGeneration.failureRate / 100);
      this.performanceMetrics.audioGeneration.successRate = ((total - failures) / total) * 100;
    } else if (operation.includes('failure')) {
      const total = this.performanceMetrics.audioGeneration.totalRequests;
      const successes = Math.round(total * this.performanceMetrics.audioGeneration.successRate / 100);
      this.performanceMetrics.audioGeneration.failureRate = ((total - successes) / total) * 100;
      this.performanceMetrics.audioGeneration.successRate = (successes / total) * 100;
    }
  }

  private updateWebSocketMetrics(event: string, details: any): void {
    if (event === 'reconnect') {
      this.performanceMetrics.websocketHealth.reconnectionCount++;
    }
    
    if (event === 'message-received' && details.latency) {
      this.performanceMetrics.websocketHealth.messageLatency.push(details.latency);
      if (this.performanceMetrics.websocketHealth.messageLatency.length > 100) {
        this.performanceMetrics.websocketHealth.messageLatency = 
          this.performanceMetrics.websocketHealth.messageLatency.slice(-100);
      }
    }
  }

  private startPerformanceMonitoring(): void {
    setInterval(() => {
      const currentMemory = process.memoryUsage();
      
      // Update current memory usage
      this.performanceMetrics.memoryUsage.current = currentMemory;
      
      // Update peak memory usage
      if (currentMemory.heapUsed > this.performanceMetrics.memoryUsage.peak.heapUsed) {
        this.performanceMetrics.memoryUsage.peak = currentMemory;
      }
      
      // Check for memory warnings
      const heapUsedMB = currentMemory.heapUsed / 1024 / 1024;
      if (heapUsedMB > 500) { // 500MB threshold
        this.logSystemEvent('memory-warning', { heapUsedMB });
      }
      
    }, 30000); // Every 30 seconds
  }

  private generateRecommendations(summary: any): string[] {
    const recommendations: string[] = [];
    
    if (summary.ttsFailures > 5) {
      recommendations.push('High TTS failure rate detected. Consider checking AWS credentials and network connectivity.');
    }
    
    if (summary.websocketIssues > 3) {
      recommendations.push('WebSocket connection issues detected. Check network stability and server availability.');
    }
    
    if (summary.audioProblems > 3) {
      recommendations.push('Audio playback issues detected. Verify audio format support and device capabilities.');
    }
    
    if (this.performanceMetrics.ttsLatency.average > 5000) {
      recommendations.push('High TTS latency detected. Consider using local TTS or optimizing network connection.');
    }
    
    if (this.performanceMetrics.audioGeneration.successRate < 80) {
      recommendations.push('Low audio generation success rate. Review TTS configuration and fallback settings.');
    }
    
    return recommendations;
  }
}