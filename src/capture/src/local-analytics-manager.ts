import { EventEmitter } from 'events';
import { TTSAnalytics, ClientAnalytics, CostAnalytics, PerformanceAnalytics, TargetLanguage } from './analytics-types';

export class LocalAnalyticsManager extends EventEmitter {
  private ttsAnalytics: TTSAnalytics;
  private clientAnalytics: ClientAnalytics;
  private costAnalytics: CostAnalytics;
  private performanceAnalytics: PerformanceAnalytics;

  constructor() {
    super();
    this.initializeAnalytics();
  }

  private initializeAnalytics(): void {
    this.ttsAnalytics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageLatency: 0,
      characterCount: 0,
      costEstimate: 0,
      languageBreakdown: {} as Record<TargetLanguage, any>,
      voiceTypeBreakdown: {
        neural: { requests: 0, characters: 0, cost: 0 },
        standard: { requests: 0, characters: 0, cost: 0 }
      },
      hourlyStats: [],
      performanceMetrics: {
        cacheHitRate: 0,
        fallbackRate: 0,
        averageAudioSize: 0,
        compressionRatio: 0
      }
    };

    this.clientAnalytics = {
      totalConnections: 0,
      activeConnections: 0,
      averageSessionDuration: 0,
      languagePreferences: {} as Record<TargetLanguage, number>,
      deviceTypes: {},
      connectionQuality: {
        excellent: 0,
        good: 0,
        poor: 0
      },
      geographicDistribution: {}
    };

    this.costAnalytics = {
      totalCost: 0,
      costByLanguage: {} as Record<TargetLanguage, number>,
      costByVoiceType: {
        neural: 0,
        standard: 0
      },
      dailyCosts: [],
      projectedMonthlyCost: 0,
      costPerRequest: 0,
      costPerCharacter: 0
    };

    this.performanceAnalytics = {
      averageResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      errorRate: 0,
      throughput: 0,
      memoryUsage: {
        current: 0,
        peak: 0,
        average: 0
      },
      cpuUsage: {
        current: 0,
        peak: 0,
        average: 0
      }
    };
  }

  getTTSAnalytics(): TTSAnalytics {
    return { ...this.ttsAnalytics };
  }

  getClientAnalytics(): ClientAnalytics {
    return { ...this.clientAnalytics };
  }

  getCostAnalytics(): CostAnalytics {
    return { ...this.costAnalytics };
  }

  getPerformanceAnalytics(): PerformanceAnalytics {
    return { ...this.performanceAnalytics };
  }

  recordTTSRequest(data: {
    language: TargetLanguage;
    characters: number;
    latency: number;
    success: boolean;
    voiceType: 'neural' | 'standard';
    cost: number;
  }): void {
    this.ttsAnalytics.totalRequests++;
    this.ttsAnalytics.characterCount += data.characters;
    this.ttsAnalytics.costEstimate += data.cost;

    if (data.success) {
      this.ttsAnalytics.successfulRequests++;
    } else {
      this.ttsAnalytics.failedRequests++;
    }

    // Update language breakdown
    if (!this.ttsAnalytics.languageBreakdown[data.language]) {
      this.ttsAnalytics.languageBreakdown[data.language] = {
        requests: 0,
        characters: 0,
        averageLatency: 0,
        successRate: 0
      };
    }

    const langData = this.ttsAnalytics.languageBreakdown[data.language];
    langData.requests++;
    langData.characters += data.characters;
    langData.averageLatency = (langData.averageLatency * (langData.requests - 1) + data.latency) / langData.requests;

    // Update voice type breakdown
    const voiceData = this.ttsAnalytics.voiceTypeBreakdown[data.voiceType];
    voiceData.requests++;
    voiceData.characters += data.characters;
    voiceData.cost += data.cost;

    // Update cost analytics
    if (!this.costAnalytics.costByLanguage[data.language]) {
      this.costAnalytics.costByLanguage[data.language] = 0;
    }
    this.costAnalytics.costByLanguage[data.language] += data.cost;
    this.costAnalytics.totalCost += data.cost;
    this.costAnalytics.costByVoiceType[data.voiceType] += data.cost;

    this.emit('analytics-updated', {
      type: 'tts',
      data: this.ttsAnalytics
    });
  }

  recordClientConnection(data: {
    language: TargetLanguage;
    deviceType: string;
    quality: 'excellent' | 'good' | 'poor';
    location?: string;
  }): void {
    this.clientAnalytics.totalConnections++;
    this.clientAnalytics.activeConnections++;

    // Update language preferences
    if (!this.clientAnalytics.languagePreferences[data.language]) {
      this.clientAnalytics.languagePreferences[data.language] = 0;
    }
    this.clientAnalytics.languagePreferences[data.language]++;

    // Update device types
    if (!this.clientAnalytics.deviceTypes[data.deviceType]) {
      this.clientAnalytics.deviceTypes[data.deviceType] = 0;
    }
    this.clientAnalytics.deviceTypes[data.deviceType]++;

    // Update connection quality
    this.clientAnalytics.connectionQuality[data.quality]++;

    // Update geographic distribution
    if (data.location) {
      if (!this.clientAnalytics.geographicDistribution[data.location]) {
        this.clientAnalytics.geographicDistribution[data.location] = 0;
      }
      this.clientAnalytics.geographicDistribution[data.location]++;
    }

    this.emit('analytics-updated', {
      type: 'client',
      data: this.clientAnalytics
    });
  }

  recordClientDisconnection(sessionId?: string): void {
    this.clientAnalytics.activeConnections = Math.max(0, this.clientAnalytics.activeConnections - 1);
  }

  updatePerformanceMetrics(metrics: Partial<PerformanceAnalytics>): void {
    Object.assign(this.performanceAnalytics, metrics);
    
    this.emit('analytics-updated', {
      type: 'performance',
      data: this.performanceAnalytics
    });
  }

  getAnalyticsSummary() {
    return {
      tts: this.getTTSAnalytics(),
      client: this.getClientAnalytics(),
      cost: this.getCostAnalytics(),
      performance: this.getPerformanceAnalytics()
    };
  }

  getAnalyticsReport() {
    return {
      summary: this.getAnalyticsSummary(),
      timestamp: new Date(),
      reportType: 'comprehensive'
    };
  }

  getCostOptimizationRecommendations() {
    const costAnalytics = this.getCostAnalytics();
    return {
      recommendations: [
        {
          type: 'voice_optimization',
          description: 'Consider using standard voices for non-critical content',
          potentialSavings: costAnalytics.costByVoiceType.neural * 0.3
        }
      ],
      totalPotentialSavings: costAnalytics.costByVoiceType.neural * 0.3
    };
  }

  getCapacityPlanningMetrics() {
    const tts = this.getTTSAnalytics();
    const client = this.getClientAnalytics();
    
    return {
      currentCapacity: {
        requestsPerHour: tts.totalRequests,
        activeConnections: client.activeConnections,
        utilizationRate: 0.75 // Mock value
      },
      projectedGrowth: {
        nextMonth: 1.2,
        nextQuarter: 1.5
      },
      recommendations: [
        'Monitor peak usage patterns',
        'Consider auto-scaling policies'
      ]
    };
  }

  detectUsagePatterns() {
    const tts = this.getTTSAnalytics();
    const client = this.getClientAnalytics();
    
    return {
      peakHours: ['09:00-11:00', '14:00-16:00'],
      popularLanguages: Object.entries(client.languagePreferences)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
        .map(([lang]) => lang),
      trends: {
        requestGrowth: 'increasing',
        costTrend: 'stable',
        qualityTrend: 'improving'
      }
    };
  }

  reset(): void {
    this.initializeAnalytics();
    this.emit('analytics-reset');
  }
}