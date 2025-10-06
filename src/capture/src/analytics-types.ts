// Local analytics types for capture module
// This avoids cross-directory imports that break TypeScript compilation

export type TargetLanguage = 'en' | 'es' | 'pt' | 'fr' | 'de' | 'it' | 'ja' | 'ko' | 'zh';

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
    poor: number;
  };
  geographicDistribution: Record<string, number>;
}

export interface CostAnalytics {
  totalCost: number;
  costByLanguage: Record<TargetLanguage, number>;
  costByVoiceType: {
    neural: number;
    standard: number;
  };
  dailyCosts: Array<{
    date: string;
    cost: number;
    requests: number;
  }>;
  projectedMonthlyCost: number;
  costPerRequest: number;
  costPerCharacter: number;
}

export interface PerformanceAnalytics {
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  throughput: number;
  memoryUsage: {
    current: number;
    peak: number;
    average: number;
  };
  cpuUsage: {
    current: number;
    peak: number;
    average: number;
  };
}