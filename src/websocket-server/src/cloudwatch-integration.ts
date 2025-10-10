import { CloudWatchClient, PutMetricDataCommand, MetricDatum, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { EventEmitter } from 'events';
import { TargetLanguage } from './types';

export interface CloudWatchConfig {
  region: string;
  namespace: string;
  enabled: boolean;
  batchSize: number;
  flushInterval: number; // milliseconds
}

export interface CustomMetric {
  name: string;
  value: number;
  unit: StandardUnit;
  dimensions?: Array<{ Name: string; Value: string }>;
  timestamp?: Date;
}

export class CloudWatchIntegration extends EventEmitter {
  private client!: CloudWatchClient;
  private config: CloudWatchConfig;
  private metricQueue: MetricDatum[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config: CloudWatchConfig = {
    region: 'us-east-1',
    namespace: 'ServiceTranslate/TTS',
    enabled: true,
    batchSize: 20,
    flushInterval: 60000 // 1 minute
  }) {
    super();
    this.config = config;
    
    if (config.enabled) {
      this.client = new CloudWatchClient({ region: config.region });
      this.startFlushTimer();
    }
  }

  /**
   * Record TTS metrics
   */
  recordTTSMetrics(data: {
    language: TargetLanguage;
    voiceType: 'neural' | 'standard';
    characters: number;
    latency: number;
    success: boolean;
    cost: number;
    cacheHit?: boolean;
    fallbackUsed?: boolean;
  }): void {
    if (!this.config.enabled) return;

    const dimensions = [
      { Name: 'Language', Value: data.language },
      { Name: 'VoiceType', Value: data.voiceType }
    ];

    // Request count
    this.addMetric({
      name: 'TTSRequests',
      value: 1,
      unit: StandardUnit.Count,
      dimensions
    });

    // Success/failure
    this.addMetric({
      name: 'TTSSuccess',
      value: data.success ? 1 : 0,
      unit: StandardUnit.Count,
      dimensions
    });

    // Latency
    this.addMetric({
      name: 'TTSLatency',
      value: data.latency,
      unit: StandardUnit.Milliseconds,
      dimensions
    });

    // Character count
    this.addMetric({
      name: 'TTSCharacters',
      value: data.characters,
      unit: StandardUnit.Count,
      dimensions
    });

    // Cost
    this.addMetric({
      name: 'TTSCost',
      value: data.cost,
      unit: StandardUnit.None,
      dimensions
    });

    // Cache hit rate
    if (data.cacheHit !== undefined) {
      this.addMetric({
        name: 'TTSCacheHit',
        value: data.cacheHit ? 1 : 0,
        unit: StandardUnit.Count,
        dimensions
      });
    }

    // Fallback usage
    if (data.fallbackUsed !== undefined) {
      this.addMetric({
        name: 'TTSFallbackUsed',
        value: data.fallbackUsed ? 1 : 0,
        unit: StandardUnit.Count,
        dimensions
      });
    }
  }

  /**
   * Record client connection metrics
   */
  recordClientMetrics(data: {
    sessionId: string;
    language: TargetLanguage;
    deviceType: string;
    connectionQuality: string;
    action: 'connect' | 'disconnect';
    sessionDuration?: number;
  }): void {
    if (!this.config.enabled) return;

    const dimensions = [
      { Name: 'Language', Value: data.language },
      { Name: 'DeviceType', Value: data.deviceType },
      { Name: 'ConnectionQuality', Value: data.connectionQuality }
    ];

    if (data.action === 'connect') {
      this.addMetric({
        name: 'ClientConnections',
        value: 1,
        unit: StandardUnit.Count,
        dimensions
      });
    } else if (data.action === 'disconnect' && data.sessionDuration) {
      this.addMetric({
        name: 'SessionDuration',
        value: data.sessionDuration,
        unit: StandardUnit.Seconds,
        dimensions
      });
    }
  }

  /**
   * Record system performance metrics
   */
  recordSystemMetrics(data: {
    cpuUsage: number;
    memoryUsage: number;
    activeConnections: number;
    requestsPerMinute: number;
    errorRate: number;
  }): void {
    if (!this.config.enabled) return;

    // CPU Usage
    this.addMetric({
      name: 'CPUUsage',
      value: data.cpuUsage,
      unit: StandardUnit.Percent
    });

    // Memory Usage
    this.addMetric({
      name: 'MemoryUsage',
      value: data.memoryUsage,
      unit: StandardUnit.Percent
    });

    // Active Connections
    this.addMetric({
      name: 'ActiveConnections',
      value: data.activeConnections,
      unit: StandardUnit.Count
    });

    // Requests Per Minute
    this.addMetric({
      name: 'RequestsPerMinute',
      value: data.requestsPerMinute,
      unit: StandardUnit.Count_Second
    });

    // Error Rate
    this.addMetric({
      name: 'ErrorRate',
      value: data.errorRate,
      unit: StandardUnit.Percent
    });
  }

  /**
   * Record cost metrics
   */
  recordCostMetrics(data: {
    totalCost: number;
    transcribeCost: number;
    translateCost: number;
    pollyCost: number;
    costPerHour: number;
  }): void {
    if (!this.config.enabled) return;

    // Total cost
    this.addMetric({
      name: 'TotalCost',
      value: data.totalCost,
      unit: StandardUnit.None
    });

    // Service-specific costs
    this.addMetric({
      name: 'ServiceCost',
      value: data.transcribeCost,
      unit: StandardUnit.None,
      dimensions: [{ Name: 'Service', Value: 'Transcribe' }]
    });

    this.addMetric({
      name: 'ServiceCost',
      value: data.translateCost,
      unit: StandardUnit.None,
      dimensions: [{ Name: 'Service', Value: 'Translate' }]
    });

    this.addMetric({
      name: 'ServiceCost',
      value: data.pollyCost,
      unit: StandardUnit.None,
      dimensions: [{ Name: 'Service', Value: 'Polly' }]
    });

    // Cost per hour
    this.addMetric({
      name: 'CostPerHour',
      value: data.costPerHour,
      unit: StandardUnit.None
    });
  }

  /**
   * Record audio performance metrics
   */
  recordAudioMetrics(data: {
    audioSize: number;
    compressionRatio: number;
    playbackLatency: number;
    queueLength: number;
    cacheHitRate: number;
  }): void {
    if (!this.config.enabled) return;

    // Audio size
    this.addMetric({
      name: 'AudioSize',
      value: data.audioSize,
      unit: StandardUnit.Bytes
    });

    // Compression ratio
    this.addMetric({
      name: 'CompressionRatio',
      value: data.compressionRatio,
      unit: StandardUnit.None
    });

    // Playback latency
    this.addMetric({
      name: 'PlaybackLatency',
      value: data.playbackLatency,
      unit: StandardUnit.Milliseconds
    });

    // Queue length
    this.addMetric({
      name: 'AudioQueueLength',
      value: data.queueLength,
      unit: StandardUnit.Count
    });

    // Cache hit rate
    this.addMetric({
      name: 'AudioCacheHitRate',
      value: data.cacheHitRate,
      unit: StandardUnit.Percent
    });
  }

  /**
   * Record custom business metrics
   */
  recordBusinessMetrics(data: {
    sessionsPerHour: number;
    translationsPerSession: number;
    userRetentionRate: number;
    peakConcurrentUsers: number;
    averageSessionDuration: number;
  }): void {
    if (!this.config.enabled) return;

    // Sessions per hour
    this.addMetric({
      name: 'SessionsPerHour',
      value: data.sessionsPerHour,
      unit: StandardUnit.Count_Second
    });

    // Translations per session
    this.addMetric({
      name: 'TranslationsPerSession',
      value: data.translationsPerSession,
      unit: StandardUnit.Count
    });

    // User retention rate
    this.addMetric({
      name: 'UserRetentionRate',
      value: data.userRetentionRate,
      unit: StandardUnit.Percent
    });

    // Peak concurrent users
    this.addMetric({
      name: 'PeakConcurrentUsers',
      value: data.peakConcurrentUsers,
      unit: StandardUnit.Count
    });

    // Average session duration
    this.addMetric({
      name: 'AverageSessionDuration',
      value: data.averageSessionDuration,
      unit: StandardUnit.Seconds
    });
  }

  /**
   * Add custom metric
   */
  addCustomMetric(metric: CustomMetric): void {
    if (!this.config.enabled) return;

    this.addMetric({
      name: metric.name,
      value: metric.value,
      unit: metric.unit,
      dimensions: metric.dimensions,
      timestamp: metric.timestamp
    });
  }

  /**
   * Flush metrics immediately
   */
  async flushMetrics(): Promise<void> {
    if (!this.config.enabled || this.metricQueue.length === 0) {
      return;
    }

    const metricsToSend = this.metricQueue.splice(0, this.config.batchSize);
    
    try {
      const command = new PutMetricDataCommand({
        Namespace: this.config.namespace,
        MetricData: metricsToSend
      });

      await this.client.send(command);
      
      console.log(`Sent ${metricsToSend.length} metrics to CloudWatch`);
      this.emit('metrics-sent', { count: metricsToSend.length });
    } catch (error) {
      console.error('Failed to send metrics to CloudWatch:', error);
      
      // Re-queue failed metrics
      this.metricQueue.unshift(...metricsToSend);
      
      this.emit('metrics-error', { error, count: metricsToSend.length });
    }

    // Continue flushing if there are more metrics
    if (this.metricQueue.length > 0) {
      setTimeout(() => this.flushMetrics(), 1000); // Wait 1 second between batches
    }
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    queueLength: number;
    enabled: boolean;
    namespace: string;
    batchSize: number;
    flushInterval: number;
  } {
    return {
      queueLength: this.metricQueue.length,
      enabled: this.config.enabled,
      namespace: this.config.namespace,
      batchSize: this.config.batchSize,
      flushInterval: this.config.flushInterval
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<CloudWatchConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.enabled !== undefined) {
      if (newConfig.enabled && !this.client) {
        this.client = new CloudWatchClient({ region: this.config.region });
        this.startFlushTimer();
      } else if (!newConfig.enabled && this.flushTimer) {
        clearInterval(this.flushTimer);
        this.flushTimer = null;
      }
    }

    if (newConfig.flushInterval && this.flushTimer) {
      clearInterval(this.flushTimer);
      this.startFlushTimer();
    }

    this.emit('config-updated', this.config);
  }

  /**
   * Stop CloudWatch integration
   */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush remaining metrics
    if (this.metricQueue.length > 0) {
      this.flushMetrics();
    }
  }

  // Private methods

  private addMetric(metric: {
    name: string;
    value: number;
    unit: StandardUnit;
    dimensions?: Array<{ Name: string; Value: string }>;
    timestamp?: Date;
  }): void {
    const metricDatum: MetricDatum = {
      MetricName: metric.name,
      Value: metric.value,
      Unit: metric.unit,
      Timestamp: metric.timestamp || new Date()
    };

    if (metric.dimensions && metric.dimensions.length > 0) {
      metricDatum.Dimensions = metric.dimensions;
    }

    this.metricQueue.push(metricDatum);

    // Auto-flush if queue is full
    if (this.metricQueue.length >= this.config.batchSize) {
      this.flushMetrics();
    }
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      this.flushMetrics();
    }, this.config.flushInterval);
  }
}

// Utility functions for creating CloudWatch dashboards and alarms

export class CloudWatchDashboardManager {
  private client: CloudWatchClient;
  private namespace: string;

  constructor(region: string, namespace: string) {
    this.client = new CloudWatchClient({ region });
    this.namespace = namespace;
  }

  /**
   * Create TTS monitoring dashboard
   */
  async createTTSDashboard(): Promise<string> {
    // This would create a CloudWatch dashboard with TTS-specific widgets
    // Implementation would use CloudWatch Dashboard API
    
    const dashboardBody = {
      widgets: [
        {
          type: "metric",
          properties: {
            metrics: [
              [this.namespace, "TTSRequests"],
              [this.namespace, "TTSLatency"],
              [this.namespace, "TTSCost"]
            ],
            period: 300,
            stat: "Average",
            region: "us-east-1",
            title: "TTS Performance"
          }
        },
        {
          type: "metric",
          properties: {
            metrics: [
              [this.namespace, "ActiveConnections"],
              [this.namespace, "SessionsPerHour"],
              [this.namespace, "ErrorRate"]
            ],
            period: 300,
            stat: "Average",
            region: "us-east-1",
            title: "System Health"
          }
        }
      ]
    };

    // Return dashboard URL or ID
    return `https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=ServiceTranslateTTS`;
  }

  /**
   * Create cost monitoring alarms
   */
  async createCostAlarms(): Promise<string[]> {
    // This would create CloudWatch alarms for cost monitoring
    // Implementation would use CloudWatch Alarms API
    
    const alarms = [
      'ServiceTranslate-HighHourlyCost',
      'ServiceTranslate-HighDailyCost',
      'ServiceTranslate-UnexpectedSpike'
    ];

    return alarms;
  }
}