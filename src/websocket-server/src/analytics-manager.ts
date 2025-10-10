import { EventEmitter } from 'events';
import { TargetLanguage } from './types';

export interface TTSAnalytics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  characterCount: number;
  costEstimate: number;
  languageBreakdown: Record<TargetLanguage, {
    requests: number;
    characters: number;
    averageLatency: number;
    successRate: number;
  }>;
  voiceTypeBreakdown: {
    neural: {
      requests: number;
      characters: number;
      cost: number;
    };
    standard: {
      requests: number;
      characters: number;
      cost: number;
    };
  };
  hourlyStats: Array<{
    hour: string;
    requests: number;
    characters: number;
    cost: number;
  }>;
  performanceMetrics: {
    cacheHitRate: number;
    fallbackRate: number;
    averageAudioSize: number;
    compressionRatio: number;
  };
}

export interface ClientAnalytics {
  totalConnections: number;
  activeConnections: number;
  averageSessionDuration: number;
  languagePreferences: Record<TargetLanguage, number>;
  deviceTypes: Record<string, number>;
  connectionQuality: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
  userBehavior: {
    averageTranslationsPerSession: number;
    mostActiveHours: Array<{ hour: number; connections: number }>;
    sessionDurations: Array<{ duration: number; count: number }>;
  };
}

export interface CostAnalytics {
  totalCost: number;
  costByService: {
    transcribe: number;
    translate: number;
    polly: number;
  };
  costByLanguage: Record<TargetLanguage, number>;
  costTrends: Array<{
    date: string;
    cost: number;
    breakdown: {
      transcribe: number;
      translate: number;
      polly: number;
    };
  }>;
  projectedMonthlyCost: number;
  costOptimizationRecommendations: Array<{
    type: 'voice_selection' | 'language_optimization' | 'caching' | 'usage_pattern';
    description: string;
    potentialSavings: number;
    priority: 'high' | 'medium' | 'low';
  }>;
}

export interface PerformanceAnalytics {
  systemMetrics: {
    cpuUsage: number;
    memoryUsage: number;
    networkLatency: number;
    diskUsage: number;
  };
  applicationMetrics: {
    requestThroughput: number;
    errorRate: number;
    averageResponseTime: number;
    concurrentUsers: number;
  };
  capacityMetrics: {
    maxConcurrentClients: number;
    peakRequestsPerMinute: number;
    resourceUtilization: number;
    scalabilityScore: number;
  };
}

export interface UsagePattern {
  id: string;
  name: string;
  description: string;
  frequency: number;
  languages: TargetLanguage[];
  timePattern: {
    dayOfWeek: number[];
    hoursOfDay: number[];
  };
  averageDuration: number;
  clientCount: number;
}

export class AnalyticsManager extends EventEmitter {
  private ttsAnalytics!: TTSAnalytics;
  private clientAnalytics!: ClientAnalytics;
  private costAnalytics!: CostAnalytics;
  private performanceAnalytics!: PerformanceAnalytics;
  private usagePatterns: Map<string, UsagePattern> = new Map();

  private sessionData: Map<string, {
    startTime: Date;
    endTime?: Date;
    language: TargetLanguage;
    translationCount: number;
    deviceType: string;
    connectionQuality: string;
  }> = new Map();

  private requestHistory: Array<{
    timestamp: Date;
    type: 'tts' | 'translation' | 'connection';
    language?: TargetLanguage;
    voiceType?: 'neural' | 'standard';
    characters?: number;
    latency?: number;
    success: boolean;
    cost?: number;
  }> = [];

  constructor() {
    super();
    this.initializeAnalytics();
    this.startAnalyticsCollection();
  }

  /**
   * Record TTS request
   */
  recordTTSRequest(data: {
    language: TargetLanguage;
    voiceType: 'neural' | 'standard';
    characters: number;
    latency: number;
    success: boolean;
    cost: number;
    cacheHit?: boolean;
    fallbackUsed?: boolean;
  }): void {
    // Add to request history
    this.requestHistory.push({
      timestamp: new Date(),
      type: 'tts',
      language: data.language,
      voiceType: data.voiceType,
      characters: data.characters,
      latency: data.latency,
      success: data.success,
      cost: data.cost
    });

    // Update TTS analytics
    this.updateTTSAnalytics(data);

    // Update cost analytics
    this.updateCostAnalytics(data);

    // Emit event for real-time monitoring
    this.emit('tts-request-recorded', data);
  }

  /**
   * Record client connection
   */
  recordClientConnection(data: {
    sessionId: string;
    language: TargetLanguage;
    deviceType: string;
    connectionQuality: string;
  }): void {
    this.sessionData.set(data.sessionId, {
      startTime: new Date(),
      language: data.language,
      translationCount: 0,
      deviceType: data.deviceType,
      connectionQuality: data.connectionQuality
    });

    this.updateClientAnalytics('connection', data);
    this.emit('client-connected', data);
  }

  /**
   * Record client disconnection
   */
  recordClientDisconnection(sessionId: string): void {
    const session = this.sessionData.get(sessionId);
    if (session) {
      session.endTime = new Date();
      this.updateClientAnalytics('disconnection', { sessionId, session });
      this.sessionData.delete(sessionId);
    }

    this.emit('client-disconnected', { sessionId });
  }

  /**
   * Record translation event
   */
  recordTranslation(data: {
    sessionId: string;
    language: TargetLanguage;
    characters: number;
  }): void {
    const session = this.sessionData.get(data.sessionId);
    if (session) {
      session.translationCount++;
    }

    this.requestHistory.push({
      timestamp: new Date(),
      type: 'translation',
      language: data.language,
      characters: data.characters,
      success: true
    });

    this.emit('translation-recorded', data);
  }

  /**
   * Get comprehensive analytics report
   */
  getAnalyticsReport(): {
    tts: TTSAnalytics;
    clients: ClientAnalytics;
    costs: CostAnalytics;
    performance: PerformanceAnalytics;
    usagePatterns: UsagePattern[];
    summary: {
      totalSessions: number;
      totalRequests: number;
      totalCost: number;
      averageSessionDuration: number;
      topLanguages: Array<{ language: TargetLanguage; usage: number }>;
    };
  } {
    const summary = this.generateSummary();

    return {
      tts: this.ttsAnalytics,
      clients: this.clientAnalytics,
      costs: this.costAnalytics,
      performance: this.performanceAnalytics,
      usagePatterns: Array.from(this.usagePatterns.values()),
      summary
    };
  }

  /**
   * Get cost optimization recommendations
   */
  getCostOptimizationRecommendations(): Array<{
    type: string;
    description: string;
    potentialSavings: number;
    priority: 'high' | 'medium' | 'low';
    implementation: string;
  }> {
    const recommendations = [];

    // Analyze voice type usage
    const neuralCost = this.ttsAnalytics.voiceTypeBreakdown.neural.cost;
    const standardCost = this.ttsAnalytics.voiceTypeBreakdown.standard.cost;

    if (neuralCost > standardCost * 2) {
      recommendations.push({
        type: 'voice_selection',
        description: 'Consider using Standard voices for non-critical content',
        potentialSavings: neuralCost * 0.3,
        priority: 'high' as const,
        implementation: 'Switch 30% of neural voice usage to standard voices'
      });
    }

    // Analyze language usage patterns
    const languageUsage = Object.entries(this.ttsAnalytics.languageBreakdown);
    const lowUsageLanguages = languageUsage.filter(([, data]) => data.requests < 10);

    if (lowUsageLanguages.length > 0) {
      const potentialSavings = lowUsageLanguages.reduce((sum, [, data]) =>
        sum + (data.characters * 0.000016), 0); // Estimate based on neural voice cost

      recommendations.push({
        type: 'language_optimization',
        description: `Consider disabling ${lowUsageLanguages.length} low-usage languages`,
        potentialSavings,
        priority: 'medium' as const,
        implementation: 'Disable languages with <10 requests per day'
      });
    }

    // Analyze caching effectiveness
    if (this.ttsAnalytics.performanceMetrics.cacheHitRate < 60) {
      recommendations.push({
        type: 'caching',
        description: 'Improve caching strategy to reduce duplicate TTS requests',
        potentialSavings: this.costAnalytics.totalCost * 0.2,
        priority: 'high' as const,
        implementation: 'Implement smarter caching and preloading strategies'
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Get capacity planning metrics
   */
  getCapacityPlanningMetrics(): {
    currentCapacity: {
      concurrentClients: number;
      requestsPerMinute: number;
      resourceUtilization: number;
    };
    projectedGrowth: {
      nextMonth: number;
      nextQuarter: number;
      nextYear: number;
    };
    recommendations: Array<{
      metric: string;
      currentValue: number;
      recommendedValue: number;
      reasoning: string;
    }>;
  } {
    const currentHour = new Date().getHours();
    const recentRequests = this.requestHistory.filter(r =>
      Date.now() - r.timestamp.getTime() < 60000 // Last minute
    ).length;

    const activeSessions = this.sessionData.size;

    // Calculate growth trends
    const dailyGrowth = this.calculateGrowthRate('daily');
    const weeklyGrowth = this.calculateGrowthRate('weekly');

    return {
      currentCapacity: {
        concurrentClients: activeSessions,
        requestsPerMinute: recentRequests,
        resourceUtilization: this.performanceAnalytics.systemMetrics.cpuUsage
      },
      projectedGrowth: {
        nextMonth: Math.round(activeSessions * (1 + dailyGrowth * 30)),
        nextQuarter: Math.round(activeSessions * (1 + weeklyGrowth * 12)),
        nextYear: Math.round(activeSessions * (1 + weeklyGrowth * 52))
      },
      recommendations: this.generateCapacityRecommendations(activeSessions, recentRequests)
    };
  }

  /**
   * Detect usage patterns
   */
  detectUsagePatterns(): UsagePattern[] {
    const patterns: UsagePattern[] = [];

    // Analyze time-based patterns
    const hourlyUsage = this.analyzeHourlyUsage();
    const dailyUsage = this.analyzeDailyUsage();

    // Detect peak usage patterns
    const peakHours = hourlyUsage
      .filter(h => h.usage > hourlyUsage.reduce((sum, h) => sum + h.usage, 0) / hourlyUsage.length * 1.5)
      .map(h => h.hour);

    if (peakHours.length > 0) {
      patterns.push({
        id: 'peak-hours',
        name: 'Peak Usage Hours',
        description: `High usage during hours: ${peakHours.join(', ')}`,
        frequency: peakHours.length / 24,
        languages: this.getTopLanguages(3),
        timePattern: {
          dayOfWeek: [0, 1, 2, 3, 4, 5, 6], // All days
          hoursOfDay: peakHours
        },
        averageDuration: this.clientAnalytics.averageSessionDuration,
        clientCount: Math.round(this.clientAnalytics.activeConnections * 1.5)
      });
    }

    // Detect weekend vs weekday patterns
    const weekendUsage = this.getWeekendUsage();
    const weekdayUsage = this.getWeekdayUsage();

    if (weekendUsage > weekdayUsage * 1.2) {
      patterns.push({
        id: 'weekend-heavy',
        name: 'Weekend Heavy Usage',
        description: 'Higher usage on weekends compared to weekdays',
        frequency: 2 / 7, // 2 days out of 7
        languages: this.getTopLanguages(5),
        timePattern: {
          dayOfWeek: [0, 6], // Sunday and Saturday
          hoursOfDay: Array.from({ length: 24 }, (_, i) => i)
        },
        averageDuration: this.clientAnalytics.averageSessionDuration * 1.2,
        clientCount: Math.round(weekendUsage)
      });
    }

    // Store detected patterns
    patterns.forEach(pattern => {
      this.usagePatterns.set(pattern.id, pattern);
    });

    return patterns;
  }

  /**
   * Export analytics data
   */
  async exportAnalyticsData(format: 'json' | 'csv' = 'json'): Promise<string> {
    const data = this.getAnalyticsReport();

    if (format === 'csv') {
      return this.convertToCSV(data);
    }

    return JSON.stringify(data, null, 2);
  }

  // Private methods

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
        fair: 0,
        poor: 0
      },
      userBehavior: {
        averageTranslationsPerSession: 0,
        mostActiveHours: [],
        sessionDurations: []
      }
    };

    this.costAnalytics = {
      totalCost: 0,
      costByService: {
        transcribe: 0,
        translate: 0,
        polly: 0
      },
      costByLanguage: {} as Record<TargetLanguage, number>,
      costTrends: [],
      projectedMonthlyCost: 0,
      costOptimizationRecommendations: []
    };

    this.performanceAnalytics = {
      systemMetrics: {
        cpuUsage: 0,
        memoryUsage: 0,
        networkLatency: 0,
        diskUsage: 0
      },
      applicationMetrics: {
        requestThroughput: 0,
        errorRate: 0,
        averageResponseTime: 0,
        concurrentUsers: 0
      },
      capacityMetrics: {
        maxConcurrentClients: 0,
        peakRequestsPerMinute: 0,
        resourceUtilization: 0,
        scalabilityScore: 0
      }
    };
  }

  private startAnalyticsCollection(): void {
    // Update analytics every minute
    setInterval(() => {
      this.updatePerformanceMetrics();
      this.pruneOldData();
      this.detectUsagePatterns();
    }, 60000);

    // Generate hourly reports
    setInterval(() => {
      this.generateHourlyReport();
    }, 3600000); // Every hour
  }

  private updateTTSAnalytics(data: {
    language: TargetLanguage;
    voiceType: 'neural' | 'standard';
    characters: number;
    latency: number;
    success: boolean;
    cost: number;
    cacheHit?: boolean;
    fallbackUsed?: boolean;
  }): void {
    this.ttsAnalytics.totalRequests++;

    if (data.success) {
      this.ttsAnalytics.successfulRequests++;
    } else {
      this.ttsAnalytics.failedRequests++;
    }

    // Update running averages
    this.ttsAnalytics.averageLatency =
      (this.ttsAnalytics.averageLatency * (this.ttsAnalytics.totalRequests - 1) + data.latency) /
      this.ttsAnalytics.totalRequests;

    this.ttsAnalytics.characterCount += data.characters;
    this.ttsAnalytics.costEstimate += data.cost;

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
    langData.successRate = (langData.successRate * (langData.requests - 1) + (data.success ? 1 : 0)) / langData.requests;

    // Update voice type breakdown
    const voiceData = this.ttsAnalytics.voiceTypeBreakdown[data.voiceType];
    voiceData.requests++;
    voiceData.characters += data.characters;
    voiceData.cost += data.cost;
  }

  private updateClientAnalytics(type: string, data: {
    language?: TargetLanguage;
    deviceType?: string;
    connectionQuality?: string;
    sessionId?: string;
    session?: any;
  }): void {
    if (type === 'connection' && data.language && data.deviceType && data.connectionQuality) {
      this.clientAnalytics.totalConnections++;
      this.clientAnalytics.activeConnections = this.sessionData.size;

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
      const qualityKey = data.connectionQuality as keyof typeof this.clientAnalytics.connectionQuality;
      if (qualityKey in this.clientAnalytics.connectionQuality) {
        this.clientAnalytics.connectionQuality[qualityKey]++;
      }
    }
  }

  private updateCostAnalytics(data: {
    language: TargetLanguage;
    cost: number;
  }): void {
    this.costAnalytics.totalCost += data.cost;
    this.costAnalytics.costByService.polly += data.cost;

    if (!this.costAnalytics.costByLanguage[data.language]) {
      this.costAnalytics.costByLanguage[data.language] = 0;
    }
    this.costAnalytics.costByLanguage[data.language] += data.cost;
  }

  private updatePerformanceMetrics(): void {
    // Update system metrics (would integrate with actual system monitoring)
    this.performanceAnalytics.systemMetrics = {
      cpuUsage: Math.random() * 100, // Placeholder
      memoryUsage: Math.random() * 100, // Placeholder
      networkLatency: Math.random() * 100, // Placeholder
      diskUsage: Math.random() * 100 // Placeholder
    };

    // Update application metrics
    const recentRequests = this.requestHistory.filter(r =>
      Date.now() - r.timestamp.getTime() < 60000
    );

    this.performanceAnalytics.applicationMetrics = {
      requestThroughput: recentRequests.length,
      errorRate: recentRequests.filter(r => !r.success).length / Math.max(recentRequests.length, 1),
      averageResponseTime: recentRequests.reduce((sum, r) => sum + (r.latency || 0), 0) / Math.max(recentRequests.length, 1),
      concurrentUsers: this.sessionData.size
    };
  }

  private generateSummary() {
    const topLanguages = Object.entries(this.ttsAnalytics.languageBreakdown)
      .sort(([, a], [, b]) => b.requests - a.requests)
      .slice(0, 5)
      .map(([language, data]) => ({ language: language as TargetLanguage, usage: data.requests }));

    return {
      totalSessions: this.clientAnalytics.totalConnections,
      totalRequests: this.ttsAnalytics.totalRequests,
      totalCost: this.costAnalytics.totalCost,
      averageSessionDuration: this.clientAnalytics.averageSessionDuration,
      topLanguages
    };
  }

  private calculateGrowthRate(period: 'daily' | 'weekly'): number {
    // Simplified growth calculation - would use actual historical data
    return Math.random() * 0.1; // 0-10% growth
  }

  private generateCapacityRecommendations(activeSessions: number, requestsPerMinute: number) {
    const recommendations = [];

    if (activeSessions > 40) {
      recommendations.push({
        metric: 'Concurrent Clients',
        currentValue: activeSessions,
        recommendedValue: 50,
        reasoning: 'Approaching maximum recommended concurrent client limit'
      });
    }

    if (requestsPerMinute > 100) {
      recommendations.push({
        metric: 'Requests Per Minute',
        currentValue: requestsPerMinute,
        recommendedValue: 120,
        reasoning: 'High request rate may require additional server capacity'
      });
    }

    return recommendations;
  }

  private analyzeHourlyUsage() {
    // Analyze request patterns by hour
    const hourlyData = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      usage: this.requestHistory.filter(r => r.timestamp.getHours() === hour).length
    }));

    return hourlyData;
  }

  private analyzeDailyUsage() {
    // Analyze request patterns by day of week
    const dailyData = Array.from({ length: 7 }, (_, day) => ({
      day,
      usage: this.requestHistory.filter(r => r.timestamp.getDay() === day).length
    }));

    return dailyData;
  }

  private getTopLanguages(count: number): TargetLanguage[] {
    return Object.entries(this.ttsAnalytics.languageBreakdown)
      .sort(([, a], [, b]) => b.requests - a.requests)
      .slice(0, count)
      .map(([language]) => language as TargetLanguage);
  }

  private getWeekendUsage(): number {
    return this.requestHistory.filter(r => {
      const day = r.timestamp.getDay();
      return day === 0 || day === 6; // Sunday or Saturday
    }).length;
  }

  private getWeekdayUsage(): number {
    return this.requestHistory.filter(r => {
      const day = r.timestamp.getDay();
      return day >= 1 && day <= 5; // Monday to Friday
    }).length;
  }

  private generateHourlyReport(): void {
    const hour = new Date().toISOString().substring(0, 13); // YYYY-MM-DDTHH
    const hourlyRequests = this.requestHistory.filter(r =>
      r.timestamp.toISOString().substring(0, 13) === hour
    );

    const hourlyStats = {
      hour,
      requests: hourlyRequests.length,
      characters: hourlyRequests.reduce((sum, r) => sum + (r.characters || 0), 0),
      cost: hourlyRequests.reduce((sum, r) => sum + (r.cost || 0), 0)
    };

    this.ttsAnalytics.hourlyStats.push(hourlyStats);

    // Keep only last 24 hours
    if (this.ttsAnalytics.hourlyStats.length > 24) {
      this.ttsAnalytics.hourlyStats = this.ttsAnalytics.hourlyStats.slice(-24);
    }
  }

  private pruneOldData(): void {
    // Keep only last 24 hours of request history
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    this.requestHistory = this.requestHistory.filter(r => r.timestamp.getTime() > cutoff);
  }

  private convertToCSV(data: any): string {
    // Simple CSV conversion - would implement proper CSV formatting
    return JSON.stringify(data);
  }
}