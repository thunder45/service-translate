/**
 * Authentication Manager
 * Handles basic authentication for local WebSocket server
 */

import * as crypto from 'crypto';

export interface AuthConfig {
  enabled: boolean;
  username?: string;
  password?: string;
  sessionTimeout: number; // in milliseconds
}

export interface AuthSession {
  id: string;
  username: string;
  createdAt: Date;
  lastActivity: Date;
  ipAddress: string;
  userAgent?: string;
}

export class AuthManager {
  private config: AuthConfig;
  private sessions: Map<string, AuthSession> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: AuthConfig) {
    this.config = config;
    
    // Clean up expired sessions every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000);
  }

  /**
   * Authenticate user credentials
   */
  public authenticate(username: string, password: string, ipAddress: string, userAgent?: string): string | null {
    if (!this.config.enabled) {
      // If auth is disabled, create a session anyway for tracking
      return this.createSession('anonymous', ipAddress, userAgent);
    }

    if (!this.config.username || !this.config.password) {
      throw new Error('Authentication is enabled but credentials are not configured');
    }

    // Simple username/password check
    if (username === this.config.username && password === this.config.password) {
      return this.createSession(username, ipAddress, userAgent);
    }

    return null;
  }

  /**
   * Validate session token
   */
  public validateSession(sessionId: string): AuthSession | null {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return null;
    }

    // Check if session has expired
    const now = new Date();
    const timeSinceLastActivity = now.getTime() - session.lastActivity.getTime();
    
    if (timeSinceLastActivity > this.config.sessionTimeout) {
      this.sessions.delete(sessionId);
      return null;
    }

    // Update last activity
    session.lastActivity = now;
    return session;
  }

  /**
   * Create a new session
   */
  private createSession(username: string, ipAddress: string, userAgent?: string): string {
    const sessionId = this.generateSessionId();
    const now = new Date();

    const session: AuthSession = {
      id: sessionId,
      username,
      createdAt: now,
      lastActivity: now,
      ipAddress,
      userAgent,
    };

    this.sessions.set(sessionId, session);
    return sessionId;
  }

  /**
   * Logout and invalidate session
   */
  public logout(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Get all active sessions
   */
  public getActiveSessions(): AuthSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session count
   */
  public getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      const timeSinceLastActivity = now.getTime() - session.lastActivity.getTime();
      
      if (timeSinceLastActivity > this.config.sessionTimeout) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      this.sessions.delete(sessionId);
    }

    if (expiredSessions.length > 0) {
      console.log(`Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  /**
   * Generate secure session ID
   */
  private generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.sessions.clear();
  }
}