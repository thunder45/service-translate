import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

export interface ServerErrorLogEntry {
  timestamp: Date;
  level: 'error' | 'warn' | 'info' | 'debug';
  category: 'tts' | 'websocket' | 'session' | 'audio' | 'system';
  message: string;
  details?: any;
  stackTrace?: string;
  sessionId?: string;
  clientId?: string;
  performance?: {
    duration?: number;
    memoryUsage?: NodeJS.MemoryUsage;
    cpuUsage?: NodeJS.CpuUsage;
  };
}

export interface ServerPerformanceMetrics {
  connections: {
    total: number;
    active: number;
    peak: number;
    reconnections: number;
  };
  sessions: {
    active: number;
    total: number;
    averageDuration: number;
  };
  tts: {
    requestsPerMinute: number;
    successRate: number;
    averageLatency: number;
    fallbackRate: number;
  };
  audio: {
    filesGenerated: number;
    cacheHitRate: number;
    storageUsed: number;
  };
  system: {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
}

export class ServerErrorLogger extends EventEmitter {
  private logFile: string;
  private performanceFile: string;
  private logBuffer: ServerErrorLogEntry[] = [];
  private performanceMetrics: ServerPerformanceMetrics;
  private flushTimer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  private maxLogSize = 50 * 1024 * 1024; // 50MB
  private maxBufferSize = 200;
  private baselineCpuUsage: NodeJS.CpuUsage;
  private startTime: number;

  constructor(logDir: string = './logs') {
    super();
    
    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().split('T')[0];
    this.logFile = path.join(logDir, `websocket-server-${timestamp}.log`);
    this.performanceFile = path.join(logDir, `server-performance-${timestamp}.json`);
    
    this.baselineCpuUsage = process.cpuUsage();
    this.startTime = Date.now();
    
    // Initialize performance metrics
    this.performanceMetrics = {
      connections: {
        total: 0,
        active: 0,
        peak: 0,
        reconnections: 0
      },
      sessions: {
        active: 0,
        total: 0,
        averageDuration: 0
      },
      tts: {
        requestsPerMinute: 0,
        successRate: 100,
        averageLatency: 0,
        fallbackRate: 0
      },
      audio: {
        filesGenerated: 0,
        cacheHitRate: 0,
        storageUsed: 0
      },
      system: {
        uptime: 0,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      }
    };
    
    // Start periodic tasks
    this.startPeriodicTasks();
    
    // Set up graceful shutdown
    process.on('exit', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  /**
   * Log an error with context
   */
  error(category: ServerErrorLogEntry['category'], message: string, details?: any, sessionId?: string, clientId?: string): void {
    this.log('error', category, message, details, sessionId, clientId);
  }

  /**
   * Log a warning
   */
  warn(category: ServerErrorLogEntry['category'], message: string, details?: any, sessionId?: string, clientId?: string): void {
    this.log('warn', category, message, details, sessionId, clientId);
  }

  /**
   * Log information
   */
  info(category: ServerErrorLogEntry['category'], message: string, details?: any, sessionId?: string, clientId?: string): void {
    this.log('info', category, message, details, sessionId, clientId);
  }

  /**
   * Log debug information
   */
  debug(category: ServerErrorLogEntry['category'], message: string, details?: any, sessionId?: string, clientId?: string): void {
    this.log('debug', category, message, details, sessionId, clientId);
  }

  /**
   * Log WebSocket connection events
   */
  logConnection(event: 'connect' | 'disconnect' | 'reconnect', clientId: string, details?: any): void {
    this.info('websocket', `Client ${event}: ${clientId}`, details, undefined, clientId);
    
    // Update connection metrics
    if (event === 'connect') {
      this.performanceMetrics.connections.total++;
      this.performanceMetrics.connections.active++;
      
      if (this.performanceMetrics.connections.active > this.performanceMetrics.connections.peak) {
        this.performanceMetrics.connections.peak = this.performanceMetrics.connections.active;
      }
    } else if (event === 'disconnect') {
      this.performanceMetrics.connections.active = Math.max(0, this.performanceMetrics.connections.active - 1);
    } else if (event === 'reconnect') {
      this.performanceMetrics.connections.reconnections++;
    }
  }

  /**
   * Log session events
   */
  logSession(event: 'create' | 'join' | 'leave' | 'end', sessionId: string, details?: any): void {
    this.info('session', `Session ${event}: ${sessionId}`, details, sessionId);
    
    // Update session metrics
    if (event === 'create') {
      this.performanceMetrics.sessions.total++;
      this.performanceMetrics.sessions.active++;
    } else if (event === 'end') {
      this.performanceMetrics.sessions.active = Math.max(0, this.performanceMetrics.sessions.active - 1);
    }
  }

  /**
   * Log TTS operations with performance tracking
   */
  logTTSOperation(
    operation: 'request' | 'success' | 'failure' | 'fallback',
    details: {
      text?: string;
      language?: string;
      voiceType?: string;
      duration?: number;
      error?: string;
      fallbackMethod?: string;
      sessionId?: string;
      clientId?: string;
    }
  ): void {
    const level = operation === 'failure' ? 'error' : 'info';
    const entry: ServerErrorLogEntry = {
      timestamp: new Date(),
      level,
      category: 'tts',
      message: `TTS ${operation}`,
      details,
      sessionId: details.sessionId,
      clientId: details.clientId,
      performance: {
        duration: details.duration,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(this.baselineCpuUsage)
      }
    };

    this.addToBuffer(entry);
    this.updateTTSMetrics(operation, details);
  }

  /**
   * Log audio file operations
   */
  logAudioOperation(
    operation: 'generate' | 'cache-hit' | 'cache-miss' | 'serve' | 'cleanup',
    details: {
      audioId?: string;
      size?: number;
      format?: string;
      duration?: number;
      sessionId?: string;
    }
  ): void {
    this.info('audio', `Audio ${operation}`, details, details.sessionId);
    
    // Update audio metrics
    if (operation === 'generate') {
      this.performanceMetrics.audio.filesGenerated++;
    } else if (operation === 'cache-hit') {
      // Update cache hit rate calculation
    }
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): ServerPerformanceMetrics {
    this.updateSystemMetrics();
    return JSON.parse(JSON.stringify(this.performanceMetrics));
  }

  /**
   * Get recent error logs
   */
  getRecentLogs(count: number = 50, level?: ServerErrorLogEntry['level']): ServerErrorLogEntry[] {
    let logs = [...this.logBuffer];
    
    if (level) {
      logs = logs.filter(log => log.level === level);
    }
    
    return logs.slice(-count);
  }

  /**
   * Generate server health report
   */
  generateHealthReport(): {
    status: 'healthy' | 'warning' | 'critical';
    metrics: ServerPerformanceMetrics;
    issues: Array<{
      severity: 'low' | 'medium' | 'high';
      category: string;
      message: string;
      recommendation?: string;
    }>;
    uptime: number;
    timestamp: Date;
  } {
    const metrics = this.getPerformanceMetrics();
    const issues: any[] = [];
    
    // Check for issues
    if (metrics.tts.successRate < 80) {
      issues.push({
        severity: 'high',
        category: 'TTS',
        message: `TTS success rate is ${metrics.tts.successRate.toFixed(1)}%`,
        recommendation: 'Check AWS credentials and network connectivity'
      });
    }
    
    if (metrics.tts.averageLatency > 5000) {
      issues.push({
        severity: 'medium',
        category: 'Performance',
        message: `High TTS latency: ${metrics.tts.averageLatency.toFixed(0)}ms`,
        recommendation: 'Consider optimizing TTS configuration or network'
      });
    }
    
    if (metrics.system.memoryUsage.heapUsed > 500 * 1024 * 1024) {
      issues.push({
        severity: 'medium',
        category: 'System',
        message: `High memory usage: ${(metrics.system.memoryUsage.heapUsed / 1024 / 1024).toFixed(0)}MB`,
        recommendation: 'Monitor for memory leaks and consider restarting'
      });
    }
    
    if (metrics.connections.reconnections > 10) {
      issues.push({
        severity: 'medium',
        category: 'Connectivity',
        message: `High reconnection count: ${metrics.connections.reconnections}`,
        recommendation: 'Check network stability and client configurations'
      });
    }
    
    // Determine overall status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    
    if (issues.some(i => i.severity === 'high')) {
      status = 'critical';
    } else if (issues.length > 0) {
      status = 'warning';
    }
    
    return {
      status,
      metrics,
      issues,
      uptime: Date.now() - this.startTime,
      timestamp: new Date()
    };
  }

  /**
   * Export logs and metrics
   */
  async exportData(): Promise<string> {
    const exportPath = path.join(path.dirname(this.logFile), `server-export-${Date.now()}.json`);
    
    const exportData = {
      timestamp: new Date().toISOString(),
      logs: this.logBuffer,
      performanceMetrics: this.performanceMetrics,
      healthReport: this.generateHealthReport(),
      systemInfo: {
        platform: process.platform,
        nodeVersion: process.version,
        pid: process.pid,
        uptime: process.uptime()
      }
    };

    await fs.promises.writeFile(exportPath, JSON.stringify(exportData, null, 2));
    return exportPath;
  }

  /**
   * Shutdown logger
   */
  shutdown(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
    
    this.flush();
    this.info('system', 'Server logger shutdown');
  }

  // Private methods

  private log(
    level: ServerErrorLogEntry['level'],
    category: ServerErrorLogEntry['category'],
    message: string,
    details?: any,
    sessionId?: string,
    clientId?: string
  ): void {
    const entry: ServerErrorLogEntry = {
      timestamp: new Date(),
      level,
      category,
      message,
      details,
      sessionId,
      clientId,
      stackTrace: level === 'error' ? new Error().stack : undefined
    };

    this.addToBuffer(entry);
    
    // Emit event for real-time monitoring
    this.emit('log', entry);
    
    // Console output
    const prefix = `[${level.toUpperCase()}] ${category}`;
    const logMessage = `${prefix}: ${message}`;
    
    if (level === 'error') {
      console.error(logMessage, details || '');
    } else if (level === 'warn') {
      console.warn(logMessage, details || '');
    } else {
      console.log(logMessage, details || '');
    }
  }

  private addToBuffer(entry: ServerErrorLogEntry): void {
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
    }, 10000); // Flush every 10 seconds
  }

  private flush(): void {
    if (this.logBuffer.length === 0) return;
    
    try {
      // Append to log file
      const logLines = this.logBuffer.map(entry => JSON.stringify(entry)).join('\n') + '\n';
      fs.appendFileSync(this.logFile, logLines);
      
      // Update performance file
      fs.writeFileSync(this.performanceFile, JSON.stringify(this.performanceMetrics, null, 2));
      
      // Rotate log file if needed
      this.rotateLogFileIfNeeded();
      
      this.logBuffer = [];
      
    } catch (error) {
      console.error('Failed to flush server logs:', error);
    }
  }

  private rotateLogFileIfNeeded(): void {
    try {
      const stats = fs.statSync(this.logFile);
      if (stats.size > this.maxLogSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedFile = this.logFile.replace('.log', `-${timestamp}.log`);
        fs.renameSync(this.logFile, rotatedFile);
      }
    } catch (error) {
      console.error('Failed to rotate server log file:', error);
    }
  }

  private startPeriodicTasks(): void {
    // Update metrics every 30 seconds
    this.metricsTimer = setInterval(() => {
      this.updateSystemMetrics();
      this.calculateDerivedMetrics();
    }, 30000);
  }

  private updateSystemMetrics(): void {
    this.performanceMetrics.system = {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(this.baselineCpuUsage)
    };
  }

  private updateTTSMetrics(operation: string, details: any): void {
    // Update TTS success rate
    if (operation === 'success' || operation === 'failure') {
      // This would need more sophisticated tracking in a real implementation
      // For now, we'll use a simple moving average approach
    }
    
    if (operation === 'fallback') {
      this.performanceMetrics.tts.fallbackRate++;
    }
    
    if (details.duration) {
      // Update average latency (simplified)
      const currentAvg = this.performanceMetrics.tts.averageLatency;
      this.performanceMetrics.tts.averageLatency = (currentAvg + details.duration) / 2;
    }
  }

  private calculateDerivedMetrics(): void {
    // Calculate requests per minute (simplified)
    const recentTTSLogs = this.logBuffer.filter(log => 
      log.category === 'tts' && 
      log.message.includes('request') &&
      Date.now() - log.timestamp.getTime() < 60000 // Last minute
    );
    
    this.performanceMetrics.tts.requestsPerMinute = recentTTSLogs.length;
    
    // Calculate average session duration (simplified)
    const sessionLogs = this.logBuffer.filter(log => 
      log.category === 'session' && 
      (log.message.includes('create') || log.message.includes('end'))
    );
    
    // This would need more sophisticated session tracking in a real implementation
  }
}