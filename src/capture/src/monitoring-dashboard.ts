import { EventEmitter } from 'events';
import { ErrorLogger, PerformanceMetrics } from './error-logger';
import { TTSManager } from './tts-manager';
import { WebSocketManager } from './websocket-manager';
import { TTSAnalytics, ClientAnalytics, CostAnalytics, PerformanceAnalytics } from './analytics-types';
import { LocalAnalyticsManager } from './local-analytics-manager';

export interface DashboardMetrics {
  system: {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    timestamp: Date;
  };
  tts: {
    totalRequests: number;
    successRate: number;
    averageLatency: number;
    pollyStatus: 'healthy' | 'degraded' | 'unavailable';
    localTTSStatus: 'available' | 'unavailable';
    fallbackTriggerCount: number;
  };
  websocket: {
    connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
    uptime: number;
    reconnectionCount: number;
    messageLatency: number;
    clientCount: number;
  };
  audio: {
    cacheSize: number;
    cacheHitRate: number;
    playbackSuccessRate: number;
    queueLength: number;
  };
  errors: {
    recentErrors: number;
    criticalErrors: number;
    warningCount: number;
    lastError?: Date;
  };
}

export interface AlertRule {
  id: string;
  name: string;
  condition: (metrics: DashboardMetrics) => boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  enabled: boolean;
  cooldownMs: number;
  lastTriggered?: Date;
}

export interface Alert {
  id: string;
  ruleId: string;
  severity: AlertRule['severity'];
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  resolvedAt?: Date;
}

export class MonitoringDashboard extends EventEmitter {
  private errorLogger: ErrorLogger;
  private ttsManager: TTSManager;
  private websocketManager: WebSocketManager;
  private analyticsManager: LocalAnalyticsManager;
  private metrics: DashboardMetrics;
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private metricsHistory: DashboardMetrics[] = [];
  private updateInterval: NodeJS.Timeout | null = null;
  private baselineCpuUsage: NodeJS.CpuUsage;

  constructor(
    errorLogger: ErrorLogger,
    ttsManager: TTSManager,
    websocketManager: WebSocketManager
  ) {
    super();
    
    this.errorLogger = errorLogger;
    this.ttsManager = ttsManager;
    this.websocketManager = websocketManager;
    this.analyticsManager = new LocalAnalyticsManager();
    this.baselineCpuUsage = process.cpuUsage();
    
    // Initialize metrics
    this.metrics = this.initializeMetrics();
    
    // Set up default alert rules
    this.setupDefaultAlertRules();
    
    // Start monitoring
    this.startMonitoring();
    
    // Listen to component events
    this.setupEventListeners();
  }

  /**
   * Get current dashboard metrics
   */
  getCurrentMetrics(): DashboardMetrics {
    return JSON.parse(JSON.stringify(this.metrics));
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(hours: number = 1): DashboardMetrics[] {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    return this.metricsHistory.filter(m => m.system.timestamp.getTime() > cutoff);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values())
      .filter(alert => !alert.resolvedAt)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get alert history
   */
  getAlertHistory(hours: number = 24): Alert[] {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    return Array.from(this.activeAlerts.values())
      .filter(alert => alert.timestamp.getTime() > cutoff)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (alert && !alert.acknowledged) {
      alert.acknowledged = true;
      this.emit('alert-acknowledged', alert);
      return true;
    }
    return false;
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (alert && !alert.resolvedAt) {
      alert.resolvedAt = new Date();
      this.emit('alert-resolved', alert);
      return true;
    }
    return false;
  }

  /**
   * Add custom alert rule
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    this.emit('alert-rule-added', rule);
  }

  /**
   * Remove alert rule
   */
  removeAlertRule(ruleId: string): boolean {
    const removed = this.alertRules.delete(ruleId);
    if (removed) {
      this.emit('alert-rule-removed', ruleId);
    }
    return removed;
  }

  /**
   * Update alert rule
   */
  updateAlertRule(ruleId: string, updates: Partial<AlertRule>): boolean {
    const rule = this.alertRules.get(ruleId);
    if (rule) {
      Object.assign(rule, updates);
      this.emit('alert-rule-updated', rule);
      return true;
    }
    return false;
  }

  /**
   * Get system health summary
   */
  getHealthSummary(): {
    overall: 'healthy' | 'warning' | 'critical';
    components: {
      tts: 'healthy' | 'warning' | 'critical';
      websocket: 'healthy' | 'warning' | 'critical';
      audio: 'healthy' | 'warning' | 'critical';
      system: 'healthy' | 'warning' | 'critical';
    };
    activeAlertCount: number;
    criticalAlertCount: number;
  } {
    const activeAlerts = this.getActiveAlerts();
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');
    
    const components = {
      tts: this.getTTSHealth(),
      websocket: this.getWebSocketHealth(),
      audio: this.getAudioHealth(),
      system: this.getSystemHealth()
    };
    
    // Determine overall health
    let overall: 'healthy' | 'warning' | 'critical' = 'healthy';
    
    if (criticalAlerts.length > 0 || Object.values(components).includes('critical')) {
      overall = 'critical';
    } else if (activeAlerts.length > 0 || Object.values(components).includes('warning')) {
      overall = 'warning';
    }
    
    return {
      overall,
      components,
      activeAlertCount: activeAlerts.length,
      criticalAlertCount: criticalAlerts.length
    };
  }

  /**
   * Get comprehensive analytics report
   */
  getAnalyticsReport() {
    return this.analyticsManager.getAnalyticsReport();
  }

  /**
   * Get cost optimization recommendations
   */
  getCostOptimizationRecommendations() {
    return this.analyticsManager.getCostOptimizationRecommendations();
  }

  /**
   * Get capacity planning metrics
   */
  getCapacityPlanningMetrics() {
    return this.analyticsManager.getCapacityPlanningMetrics();
  }

  /**
   * Detect usage patterns
   */
  detectUsagePatterns() {
    return this.analyticsManager.detectUsagePatterns();
  }

  /**
   * Record TTS request for analytics
   */
  recordTTSRequest(data: {
    language: any;
    voiceType: 'neural' | 'standard';
    characters: number;
    latency: number;
    success: boolean;
    cost: number;
    cacheHit?: boolean;
    fallbackUsed?: boolean;
  }) {
    this.analyticsManager.recordTTSRequest(data);
  }

  /**
   * Record client connection for analytics
   */
  recordClientConnection(data: {
    sessionId: string;
    language: any;
    deviceType: string;
    connectionQuality: string;
  }) {
    this.analyticsManager.recordClientConnection({
      language: data.language,
      deviceType: data.deviceType,
      quality: data.connectionQuality as 'excellent' | 'good' | 'poor'
    });
  }

  /**
   * Record client disconnection for analytics
   */
  recordClientDisconnection(sessionId: string) {
    this.analyticsManager.recordClientDisconnection(sessionId);
  }

  /**
   * Export comprehensive monitoring and analytics data
   */
  async exportMonitoringData(): Promise<{
    metrics: DashboardMetrics;
    metricsHistory: DashboardMetrics[];
    alerts: Alert[];
    alertRules: AlertRule[];
    healthSummary: any;
    analytics: any;
    costOptimization: any;
    capacityPlanning: any;
    usagePatterns: any;
    timestamp: Date;
  }> {
    return {
      metrics: this.getCurrentMetrics(),
      metricsHistory: this.getMetricsHistory(24), // Last 24 hours
      alerts: this.getAlertHistory(24),
      alertRules: Array.from(this.alertRules.values()),
      healthSummary: this.getHealthSummary(),
      analytics: this.getAnalyticsReport(),
      costOptimization: this.getCostOptimizationRecommendations(),
      capacityPlanning: this.getCapacityPlanningMetrics(),
      usagePatterns: this.detectUsagePatterns(),
      timestamp: new Date()
    };
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  // Private methods

  private initializeMetrics(): DashboardMetrics {
    return {
      system: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(this.baselineCpuUsage),
        timestamp: new Date()
      },
      tts: {
        totalRequests: 0,
        successRate: 100,
        averageLatency: 0,
        pollyStatus: 'healthy',
        localTTSStatus: 'available',
        fallbackTriggerCount: 0
      },
      websocket: {
        connectionStatus: 'disconnected',
        uptime: 0,
        reconnectionCount: 0,
        messageLatency: 0,
        clientCount: 0
      },
      audio: {
        cacheSize: 0,
        cacheHitRate: 0,
        playbackSuccessRate: 100,
        queueLength: 0
      },
      errors: {
        recentErrors: 0,
        criticalErrors: 0,
        warningCount: 0
      }
    };
  }

  private setupDefaultAlertRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'high-memory-usage',
        name: 'High Memory Usage',
        condition: (metrics) => metrics.system.memoryUsage.heapUsed > 500 * 1024 * 1024, // 500MB
        severity: 'medium',
        message: 'Memory usage is above 500MB',
        enabled: true,
        cooldownMs: 300000 // 5 minutes
      },
      {
        id: 'tts-failure-rate',
        name: 'High TTS Failure Rate',
        condition: (metrics) => metrics.tts.successRate < 80,
        severity: 'high',
        message: 'TTS success rate is below 80%',
        enabled: true,
        cooldownMs: 180000 // 3 minutes
      },
      {
        id: 'websocket-disconnected',
        name: 'WebSocket Disconnected',
        condition: (metrics) => metrics.websocket.connectionStatus === 'disconnected',
        severity: 'critical',
        message: 'WebSocket connection is down',
        enabled: true,
        cooldownMs: 60000 // 1 minute
      },
      {
        id: 'high-tts-latency',
        name: 'High TTS Latency',
        condition: (metrics) => metrics.tts.averageLatency > 5000, // 5 seconds
        severity: 'medium',
        message: 'TTS latency is above 5 seconds',
        enabled: true,
        cooldownMs: 300000 // 5 minutes
      },
      {
        id: 'frequent-reconnections',
        name: 'Frequent Reconnections',
        condition: (metrics) => metrics.websocket.reconnectionCount > 5,
        severity: 'medium',
        message: 'WebSocket reconnection count is high',
        enabled: true,
        cooldownMs: 600000 // 10 minutes
      },
      {
        id: 'critical-errors',
        name: 'Critical Errors',
        condition: (metrics) => metrics.errors.criticalErrors > 0,
        severity: 'critical',
        message: 'Critical errors detected in the system',
        enabled: true,
        cooldownMs: 60000 // 1 minute
      }
    ];

    defaultRules.forEach(rule => this.alertRules.set(rule.id, rule));
  }

  private startMonitoring(): void {
    // Update metrics every 10 seconds
    this.updateInterval = setInterval(() => {
      this.updateMetrics();
      this.checkAlertRules();
      this.pruneHistory();
    }, 10000);
  }

  private setupEventListeners(): void {
    // Listen to error logger events
    this.errorLogger.on('log', (entry) => {
      if (entry.level === 'error') {
        this.metrics.errors.recentErrors++;
        if (entry.category === 'tts' || entry.category === 'system') {
          this.metrics.errors.criticalErrors++;
        }
        this.metrics.errors.lastError = entry.timestamp;
      } else if (entry.level === 'warn') {
        this.metrics.errors.warningCount++;
      }
    });

    // Listen to TTS manager events
    this.ttsManager.on('fallback-notification', (notification) => {
      this.metrics.tts.fallbackTriggerCount++;
      
      if (notification.type === 'all-fallbacks-failed') {
        this.metrics.tts.pollyStatus = 'unavailable';
      } else if (notification.type === 'fallback-triggered') {
        this.metrics.tts.pollyStatus = 'degraded';
      }
    });

    // Listen to WebSocket manager events
    this.websocketManager.on('connected', () => {
      this.metrics.websocket.connectionStatus = 'connected';
    });

    this.websocketManager.on('disconnected', () => {
      this.metrics.websocket.connectionStatus = 'disconnected';
    });

    this.websocketManager.on('reconnected', () => {
      this.metrics.websocket.reconnectionCount++;
    });
  }

  private updateMetrics(): void {
    // Update system metrics
    this.metrics.system = {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(this.baselineCpuUsage),
      timestamp: new Date()
    };

    // Update TTS metrics
    const ttsMetrics = this.ttsManager.getFallbackMetrics();
    this.metrics.tts = {
      totalRequests: ttsMetrics.totalRequests,
      successRate: (ttsMetrics.pollySuccessRate + ttsMetrics.localTTSSuccessRate) / 2,
      averageLatency: (ttsMetrics.pollyAverageLatency + ttsMetrics.localTTSAverageLatency) / 2,
      pollyStatus: ttsMetrics.pollySuccessRate > 80 ? 'healthy' : 
                   ttsMetrics.pollySuccessRate > 50 ? 'degraded' : 'unavailable',
      localTTSStatus: 'available', // Assume local TTS is always available
      fallbackTriggerCount: ttsMetrics.fallbackTriggerCount
    };

    // Update WebSocket metrics
    const wsHealth = this.websocketManager.getConnectionHealth();
    this.metrics.websocket = {
      connectionStatus: wsHealth.connected ? 'connected' : 'disconnected',
      uptime: wsHealth.connected ? Date.now() - wsHealth.lastPing : 0,
      reconnectionCount: wsHealth.reconnectAttempts,
      messageLatency: wsHealth.latency,
      clientCount: this.websocketManager.getConnectedClientsCount()
    };

    // Update audio metrics
    const cacheStats = this.ttsManager.getCacheStats();
    this.metrics.audio = {
      cacheSize: cacheStats.size,
      cacheHitRate: 0, // Would need to track this separately
      playbackSuccessRate: 95, // Placeholder - would need actual tracking
      queueLength: 0 // Would need to get from audio player
    };

    // Store metrics history
    this.metricsHistory.push(JSON.parse(JSON.stringify(this.metrics)));

    // Emit metrics update
    this.emit('metrics-updated', this.metrics);
  }

  private checkAlertRules(): void {
    const now = Date.now();
    
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;
      
      // Check cooldown
      if (rule.lastTriggered && (now - rule.lastTriggered.getTime()) < rule.cooldownMs) {
        continue;
      }
      
      // Check condition
      if (rule.condition(this.metrics)) {
        this.triggerAlert(rule);
      }
    }
  }

  private triggerAlert(rule: AlertRule): void {
    const alertId = `${rule.id}-${Date.now()}`;
    
    const alert: Alert = {
      id: alertId,
      ruleId: rule.id,
      severity: rule.severity,
      message: rule.message,
      timestamp: new Date(),
      acknowledged: false
    };
    
    this.activeAlerts.set(alertId, alert);
    rule.lastTriggered = new Date();
    
    // Log the alert
    this.errorLogger.error('system', `Alert triggered: ${rule.name}`, {
      alertId,
      ruleId: rule.id,
      severity: rule.severity,
      message: rule.message
    });
    
    this.emit('alert-triggered', alert);
  }

  private pruneHistory(): void {
    // Keep only last 24 hours of metrics history
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    this.metricsHistory = this.metricsHistory.filter(m => 
      m.system.timestamp.getTime() > cutoff
    );
    
    // Keep only last 7 days of alerts
    const alertCutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
    for (const [alertId, alert] of this.activeAlerts.entries()) {
      if (alert.timestamp.getTime() < alertCutoff) {
        this.activeAlerts.delete(alertId);
      }
    }
  }

  private getTTSHealth(): 'healthy' | 'warning' | 'critical' {
    if (this.metrics.tts.pollyStatus === 'unavailable' && this.metrics.tts.localTTSStatus === 'unavailable') {
      return 'critical';
    } else if (this.metrics.tts.pollyStatus === 'degraded' || this.metrics.tts.successRate < 90) {
      return 'warning';
    }
    return 'healthy';
  }

  private getWebSocketHealth(): 'healthy' | 'warning' | 'critical' {
    if (this.metrics.websocket.connectionStatus === 'disconnected') {
      return 'critical';
    } else if (this.metrics.websocket.reconnectionCount > 3 || this.metrics.websocket.messageLatency > 1000) {
      return 'warning';
    }
    return 'healthy';
  }

  private getAudioHealth(): 'healthy' | 'warning' | 'critical' {
    if (this.metrics.audio.playbackSuccessRate < 70) {
      return 'critical';
    } else if (this.metrics.audio.playbackSuccessRate < 90) {
      return 'warning';
    }
    return 'healthy';
  }

  private getSystemHealth(): 'healthy' | 'warning' | 'critical' {
    const memoryUsageMB = this.metrics.system.memoryUsage.heapUsed / 1024 / 1024;
    
    if (memoryUsageMB > 800 || this.metrics.errors.criticalErrors > 0) {
      return 'critical';
    } else if (memoryUsageMB > 500 || this.metrics.errors.recentErrors > 5) {
      return 'warning';
    }
    return 'healthy';
  }
}