/**
 * Rate Limiter
 * Implements rate limiting for WebSocket connections and API calls
 */

export interface RateLimitConfig {
  websocketRateLimit: number; // requests per second
  pollyRateLimit: number; // requests per minute
  maxClientsPerSession: number;
  windowSizeMs: number; // time window for rate limiting
}

export interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked: boolean;
}

export class RateLimiter {
  private config: RateLimitConfig;
  private websocketLimits: Map<string, RateLimitEntry> = new Map();
  private pollyLimits: Map<string, RateLimitEntry> = new Map();
  private sessionClientCounts: Map<string, number> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: RateLimitConfig) {
    this.config = config;
    
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000);
  }

  /**
   * Check WebSocket rate limit for a client
   */
  public checkWebSocketRateLimit(clientId: string): boolean {
    return this.checkRateLimit(
      clientId,
      this.websocketLimits,
      this.config.websocketRateLimit,
      1000 // 1 second window
    );
  }

  /**
   * Check Polly API rate limit for a client
   */
  public checkPollyRateLimit(clientId: string): boolean {
    return this.checkRateLimit(
      clientId,
      this.pollyLimits,
      this.config.pollyRateLimit,
      60 * 1000 // 1 minute window
    );
  }

  /**
   * Check if session can accept more clients
   */
  public checkSessionClientLimit(sessionId: string): boolean {
    const currentCount = this.sessionClientCounts.get(sessionId) || 0;
    return currentCount < this.config.maxClientsPerSession;
  }

  /**
   * Add client to session
   */
  public addClientToSession(sessionId: string): boolean {
    if (!this.checkSessionClientLimit(sessionId)) {
      return false;
    }

    const currentCount = this.sessionClientCounts.get(sessionId) || 0;
    this.sessionClientCounts.set(sessionId, currentCount + 1);
    return true;
  }

  /**
   * Remove client from session
   */
  public removeClientFromSession(sessionId: string): void {
    const currentCount = this.sessionClientCounts.get(sessionId) || 0;
    if (currentCount > 0) {
      this.sessionClientCounts.set(sessionId, currentCount - 1);
    }
  }

  /**
   * Get current client count for session
   */
  public getSessionClientCount(sessionId: string): number {
    return this.sessionClientCounts.get(sessionId) || 0;
  }

  /**
   * Block a client temporarily
   */
  public blockClient(clientId: string, durationMs: number = 60000): void {
    const resetTime = Date.now() + durationMs;
    
    this.websocketLimits.set(clientId, {
      count: this.config.websocketRateLimit + 1, // Exceed limit
      resetTime,
      blocked: true,
    });

    console.log(`Client ${clientId} blocked for ${durationMs}ms due to rate limit violation`);
  }

  /**
   * Check if client is currently blocked
   */
  public isClientBlocked(clientId: string): boolean {
    const wsLimit = this.websocketLimits.get(clientId);
    const pollyLimit = this.pollyLimits.get(clientId);
    
    const now = Date.now();
    
    // Check WebSocket blocking
    if (wsLimit && wsLimit.blocked && wsLimit.resetTime > now) {
      return true;
    }

    // Check Polly blocking
    if (pollyLimit && pollyLimit.blocked && pollyLimit.resetTime > now) {
      return true;
    }

    return false;
  }

  /**
   * Get rate limit status for client
   */
  public getRateLimitStatus(clientId: string): {
    websocket: { count: number; limit: number; resetTime: number };
    polly: { count: number; limit: number; resetTime: number };
    blocked: boolean;
  } {
    const wsLimit = this.websocketLimits.get(clientId);
    const pollyLimit = this.pollyLimits.get(clientId);
    
    return {
      websocket: {
        count: wsLimit?.count || 0,
        limit: this.config.websocketRateLimit,
        resetTime: wsLimit?.resetTime || 0,
      },
      polly: {
        count: pollyLimit?.count || 0,
        limit: this.config.pollyRateLimit,
        resetTime: pollyLimit?.resetTime || 0,
      },
      blocked: this.isClientBlocked(clientId),
    };
  }

  /**
   * Reset rate limits for a client
   */
  public resetClientLimits(clientId: string): void {
    this.websocketLimits.delete(clientId);
    this.pollyLimits.delete(clientId);
  }

  /**
   * Get overall rate limiting statistics
   */
  public getStatistics(): {
    totalClients: number;
    blockedClients: number;
    activeSessions: number;
    totalSessionClients: number;
  } {
    const now = Date.now();
    let blockedClients = 0;
    
    // Count blocked WebSocket clients
    for (const limit of this.websocketLimits.values()) {
      if (limit.blocked && limit.resetTime > now) {
        blockedClients++;
      }
    }

    // Count blocked Polly clients
    for (const limit of this.pollyLimits.values()) {
      if (limit.blocked && limit.resetTime > now) {
        blockedClients++;
      }
    }

    const totalSessionClients = Array.from(this.sessionClientCounts.values())
      .reduce((sum, count) => sum + count, 0);

    return {
      totalClients: this.websocketLimits.size,
      blockedClients,
      activeSessions: this.sessionClientCounts.size,
      totalSessionClients,
    };
  }

  /**
   * Generic rate limit checker
   */
  private checkRateLimit(
    clientId: string,
    limitMap: Map<string, RateLimitEntry>,
    limit: number,
    windowMs: number
  ): boolean {
    const now = Date.now();
    const entry = limitMap.get(clientId);

    if (!entry) {
      // First request from this client
      limitMap.set(clientId, {
        count: 1,
        resetTime: now + windowMs,
        blocked: false,
      });
      return true;
    }

    // Check if window has expired
    if (now >= entry.resetTime) {
      // Reset the window
      entry.count = 1;
      entry.resetTime = now + windowMs;
      entry.blocked = false;
      return true;
    }

    // Check if already blocked
    if (entry.blocked) {
      return false;
    }

    // Increment count
    entry.count++;

    // Check if limit exceeded
    if (entry.count > limit) {
      entry.blocked = true;
      console.log(`Rate limit exceeded for client ${clientId}: ${entry.count}/${limit} in ${windowMs}ms window`);
      return false;
    }

    return true;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    // Clean up WebSocket limits
    for (const [clientId, entry] of this.websocketLimits) {
      if (now >= entry.resetTime && !entry.blocked) {
        this.websocketLimits.delete(clientId);
        cleanedCount++;
      }
    }

    // Clean up Polly limits
    for (const [clientId, entry] of this.pollyLimits) {
      if (now >= entry.resetTime && !entry.blocked) {
        this.pollyLimits.delete(clientId);
        cleanedCount++;
      }
    }

    // Clean up empty sessions
    for (const [sessionId, count] of this.sessionClientCounts) {
      if (count === 0) {
        this.sessionClientCounts.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Rate limiter cleanup: removed ${cleanedCount} expired entries`);
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.websocketLimits.clear();
    this.pollyLimits.clear();
    this.sessionClientCounts.clear();
  }
}