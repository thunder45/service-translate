import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface ServiceUsage {
  minutes?: number;
  characters?: number;
  cost: number;
}

export interface ServiceCosts {
  transcribe: ServiceUsage;
  translate: ServiceUsage;
  polly: ServiceUsage & { voiceType?: 'neural' | 'standard' };
  total: number;
  hourlyRate: number;
  sessionStartTime: Date;
  lastUpdated: Date;
}

export interface CostAlert {
  type: 'warning' | 'critical';
  message: string;
  currentCost: number;
  threshold: number;
  timestamp: Date;
}

// AWS Service Pricing (per unit)
const PRICING = {
  transcribe: {
    perMinute: 0.024 // $0.024 per minute
  },
  translate: {
    perCharacter: 15 / 1000000 // $15 per 1M characters
  },
  polly: {
    standard: {
      perCharacter: 4 / 1000000 // $4 per 1M characters
    },
    neural: {
      perCharacter: 16 / 1000000 // $16 per 1M characters
    }
  }
};

export class CostTracker extends EventEmitter {
  private costs!: ServiceCosts;
  private costHistoryFile: string;
  private warningThreshold: number = 3.0; // $3/hour warning
  private lastWarningTime: Date | null = null;
  private warningCooldown: number = 5 * 60 * 1000; // 5 minutes between warnings

  constructor() {
    super();
    
    // Initialize cost tracking file
    this.costHistoryFile = path.join(app.getPath('userData'), 'cost-history.json');
    
    // Initialize costs
    this.resetSession();
  }

  /**
   * Reset costs for a new session
   */
  resetSession(): void {
    this.costs = {
      transcribe: { minutes: 0, cost: 0 },
      translate: { characters: 0, cost: 0 },
      polly: { characters: 0, cost: 0, voiceType: 'standard' },
      total: 0,
      hourlyRate: 0,
      sessionStartTime: new Date(),
      lastUpdated: new Date()
    };
    
    this.emit('costs-reset');
  }

  /**
   * Track AWS Transcribe usage
   */
  trackTranscribeUsage(minutes: number): void {
    const cost = minutes * PRICING.transcribe.perMinute;
    
    this.costs.transcribe.minutes = (this.costs.transcribe.minutes || 0) + minutes;
    this.costs.transcribe.cost += cost;
    
    this.updateTotalCosts();
    this.emit('transcribe-usage', {
      minutes: this.costs.transcribe.minutes,
      cost: this.costs.transcribe.cost,
      incrementalCost: cost
    });
  }

  /**
   * Track AWS Translate usage
   */
  trackTranslateUsage(characters: number): void {
    const cost = characters * PRICING.translate.perCharacter;
    
    this.costs.translate.characters = (this.costs.translate.characters || 0) + characters;
    this.costs.translate.cost += cost;
    
    this.updateTotalCosts();
    this.emit('translate-usage', {
      characters: this.costs.translate.characters,
      cost: this.costs.translate.cost,
      incrementalCost: cost
    });
  }

  /**
   * Track AWS Polly usage
   */
  trackPollyUsage(characters: number, voiceType: 'neural' | 'standard'): void {
    const pricing = voiceType === 'neural' 
      ? PRICING.polly.neural.perCharacter 
      : PRICING.polly.standard.perCharacter;
    
    const cost = characters * pricing;
    
    this.costs.polly.characters = (this.costs.polly.characters || 0) + characters;
    this.costs.polly.cost += cost;
    this.costs.polly.voiceType = voiceType;
    
    this.updateTotalCosts();
    this.emit('polly-usage', {
      characters: this.costs.polly.characters,
      cost: this.costs.polly.cost,
      voiceType,
      incrementalCost: cost
    });
  }

  /**
   * Get current costs
   */
  getCurrentCosts(): ServiceCosts {
    return { ...this.costs };
  }

  /**
   * Get hourly cost rate
   */
  getHourlyRate(): number {
    return this.costs.hourlyRate;
  }

  /**
   * Get session duration in hours
   */
  getSessionDurationHours(): number {
    const now = new Date();
    const durationMs = now.getTime() - this.costs.sessionStartTime.getTime();
    return durationMs / (1000 * 60 * 60);
  }

  /**
   * Get cost breakdown by service
   */
  getCostBreakdown(): { service: string; cost: number; percentage: number }[] {
    const breakdown = [
      { service: 'Transcribe', cost: this.costs.transcribe.cost },
      { service: 'Translate', cost: this.costs.translate.cost },
      { service: 'Polly', cost: this.costs.polly.cost }
    ];

    return breakdown.map(item => ({
      ...item,
      percentage: this.costs.total > 0 ? (item.cost / this.costs.total) * 100 : 0
    }));
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): {
    transcribeMinutes: number;
    translateCharacters: number;
    pollyCharacters: number;
    pollyVoiceType: string;
  } {
    return {
      transcribeMinutes: this.costs.transcribe.minutes || 0,
      translateCharacters: this.costs.translate.characters || 0,
      pollyCharacters: this.costs.polly.characters || 0,
      pollyVoiceType: this.costs.polly.voiceType || 'standard'
    };
  }

  /**
   * Set warning threshold (dollars per hour)
   */
  setWarningThreshold(threshold: number): void {
    this.warningThreshold = threshold;
    this.emit('threshold-updated', threshold);
  }

  /**
   * Get warning threshold
   */
  getWarningThreshold(): number {
    return this.warningThreshold;
  }

  /**
   * Check if costs exceed threshold and emit warning
   */
  private checkCostThreshold(): void {
    if (this.costs.hourlyRate > this.warningThreshold) {
      const now = new Date();
      
      // Check cooldown period
      if (!this.lastWarningTime || 
          (now.getTime() - this.lastWarningTime.getTime()) > this.warningCooldown) {
        
        const alert: CostAlert = {
          type: this.costs.hourlyRate > (this.warningThreshold * 1.5) ? 'critical' : 'warning',
          message: `Cost rate of $${this.costs.hourlyRate.toFixed(2)}/hour exceeds threshold of $${this.warningThreshold}/hour`,
          currentCost: this.costs.hourlyRate,
          threshold: this.warningThreshold,
          timestamp: now
        };
        
        this.lastWarningTime = now;
        this.emit('cost-alert', alert);
      }
    }
  }

  /**
   * Update total costs and hourly rate
   */
  private updateTotalCosts(): void {
    this.costs.total = this.costs.transcribe.cost + this.costs.translate.cost + this.costs.polly.cost;
    this.costs.lastUpdated = new Date();
    
    // Calculate hourly rate
    const sessionHours = this.getSessionDurationHours();
    this.costs.hourlyRate = sessionHours > 0 ? this.costs.total / sessionHours : 0;
    
    // Check for cost threshold warnings
    this.checkCostThreshold();
    
    // Emit cost update
    this.emit('costs-updated', this.costs);
  }

  /**
   * Save cost history to file
   */
  saveCostHistory(): void {
    try {
      let history: ServiceCosts[] = [];
      
      // Load existing history
      if (fs.existsSync(this.costHistoryFile)) {
        const data = fs.readFileSync(this.costHistoryFile, 'utf8');
        history = JSON.parse(data);
      }
      
      // Add current session
      history.push({
        ...this.costs,
        sessionStartTime: this.costs.sessionStartTime,
        lastUpdated: new Date()
      });
      
      // Keep only last 100 sessions
      if (history.length > 100) {
        history = history.slice(-100);
      }
      
      // Save to file
      fs.writeFileSync(this.costHistoryFile, JSON.stringify(history, null, 2));
      
      this.emit('history-saved');
    } catch (error) {
      console.error('Failed to save cost history:', error);
      this.emit('error', { type: 'save-history', error: (error as Error).message });
    }
  }

  /**
   * Load cost history from file
   */
  loadCostHistory(): ServiceCosts[] {
    try {
      if (fs.existsSync(this.costHistoryFile)) {
        const data = fs.readFileSync(this.costHistoryFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load cost history:', error);
      this.emit('error', { type: 'load-history', error: (error as Error).message });
    }
    
    return [];
  }

  /**
   * Get cost statistics from history
   */
  getHistoryStats(): {
    totalSessions: number;
    averageCostPerSession: number;
    averageHourlyRate: number;
    totalCost: number;
  } {
    const history = this.loadCostHistory();
    
    if (history.length === 0) {
      return {
        totalSessions: 0,
        averageCostPerSession: 0,
        averageHourlyRate: 0,
        totalCost: 0
      };
    }
    
    const totalCost = history.reduce((sum, session) => sum + session.total, 0);
    const totalHourlyRates = history.reduce((sum, session) => sum + session.hourlyRate, 0);
    
    return {
      totalSessions: history.length,
      averageCostPerSession: totalCost / history.length,
      averageHourlyRate: totalHourlyRates / history.length,
      totalCost
    };
  }

  /**
   * Estimate remaining budget time
   */
  estimateRemainingTime(budgetLimit: number): number {
    if (this.costs.hourlyRate <= 0) {
      return Infinity;
    }
    
    const remainingBudget = budgetLimit - this.costs.total;
    if (remainingBudget <= 0) {
      return 0;
    }
    
    return remainingBudget / this.costs.hourlyRate; // Hours remaining
  }

  /**
   * Get cost projection for different time periods
   */
  getCostProjection(): {
    next15Minutes: number;
    nextHour: number;
    next4Hours: number;
  } {
    const hourlyRate = this.costs.hourlyRate;
    
    return {
      next15Minutes: hourlyRate * 0.25,
      nextHour: hourlyRate,
      next4Hours: hourlyRate * 4
    };
  }
}