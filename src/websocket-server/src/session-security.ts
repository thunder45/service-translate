/**
 * Session Security Manager
 * Handles secure session ID generation and validation
 */

import * as crypto from 'crypto';

export interface SessionSecurityConfig {
  secureIds: boolean;
  idPrefix: string;
  secretKey: string;
  maxSessionAge: number; // in milliseconds
}

export interface SecureSessionData {
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
  signature: string;
  metadata: {
    adminId?: string;
    ipAddress?: string;
    userAgent?: string;
  };
}

export class SessionSecurity {
  private config: SessionSecurityConfig;
  private activeSessions: Map<string, SecureSessionData> = new Map();
  private sessionCounter: number = 0;

  constructor(config: SessionSecurityConfig) {
    this.config = config;
    
    // Initialize counter with current year and random offset
    const currentYear = new Date().getFullYear();
    this.sessionCounter = Math.floor(Math.random() * 900) + 100; // 100-999
  }

  /**
   * Generate a secure session ID
   */
  public generateSessionId(metadata?: { adminId?: string; ipAddress?: string; userAgent?: string }): string {
    if (!this.config.secureIds) {
      // Simple human-readable format: PREFIX-YYYY-NNN
      const year = new Date().getFullYear();
      const counter = String(++this.sessionCounter).padStart(3, '0');
      return `${this.config.idPrefix}-${year}-${counter}`;
    }

    // Secure format with cryptographic signature
    const year = new Date().getFullYear();
    const counter = String(++this.sessionCounter).padStart(3, '0');
    const baseId = `${this.config.idPrefix}-${year}-${counter}`;
    
    // Create session data
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.maxSessionAge);
    
    // Generate signature
    const signature = this.generateSignature(baseId, now, metadata);
    
    const sessionData: SecureSessionData = {
      sessionId: baseId,
      createdAt: now,
      expiresAt,
      signature,
      metadata: metadata || {},
    };

    this.activeSessions.set(baseId, sessionData);
    
    return baseId;
  }

  /**
   * Validate session ID
   */
  public validateSessionId(sessionId: string): boolean {
    if (!this.config.secureIds) {
      // For non-secure mode, accept any session ID
      return true;
    }

    // For secure mode, validate signature and expiration
    const sessionData = this.activeSessions.get(sessionId);
    if (!sessionData) {
      return false;
    }

    // Check expiration
    if (new Date() > sessionData.expiresAt) {
      this.activeSessions.delete(sessionId);
      return false;
    }

    // Validate signature
    const expectedSignature = this.generateSignature(
      sessionId,
      sessionData.createdAt,
      sessionData.metadata
    );

    return sessionData.signature === expectedSignature;
  }

  /**
   * Get session data
   */
  public getSessionData(sessionId: string): SecureSessionData | null {
    if (!this.validateSessionId(sessionId)) {
      return null;
    }

    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Invalidate session
   */
  public invalidateSession(sessionId: string): boolean {
    return this.activeSessions.delete(sessionId);
  }

  /**
   * Get all active sessions
   */
  public getActiveSessions(): SecureSessionData[] {
    // Clean up expired sessions first
    this.cleanupExpiredSessions();
    return Array.from(this.activeSessions.values());
  }


  /**
   * Generate cryptographic signature for session
   */
  private generateSignature(
    sessionId: string,
    createdAt: Date,
    metadata?: { adminId?: string; ipAddress?: string; userAgent?: string }
  ): string {
    const data = [
      sessionId,
      createdAt.toISOString(),
      metadata?.adminId || '',
      metadata?.ipAddress || '',
      this.config.secretKey,
    ].join('|');

    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex')
      .substring(0, 16); // Use first 16 characters
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();
    const expiredSessions: string[] = [];

    for (const [sessionId, sessionData] of this.activeSessions) {
      if (now > sessionData.expiresAt) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      this.activeSessions.delete(sessionId);
    }

    if (expiredSessions.length > 0) {
      console.log(`Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  /**
   * Get session statistics
   */
  public getStatistics(): {
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
    securityEnabled: boolean;
  } {
    this.cleanupExpiredSessions();
    
    const now = new Date();
    let expiredCount = 0;

    for (const sessionData of this.activeSessions.values()) {
      if (now > sessionData.expiresAt) {
        expiredCount++;
      }
    }

    return {
      totalSessions: this.sessionCounter,
      activeSessions: this.activeSessions.size,
      expiredSessions: expiredCount,
      securityEnabled: this.config.secureIds,
    };
  }

  /**
   * Reset session counter (for testing or maintenance)
   */
  public resetCounter(): void {
    this.sessionCounter = Math.floor(Math.random() * 900) + 100;
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.activeSessions.clear();
  }
}
