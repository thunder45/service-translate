/**
 * Security Middleware
 * Integrates authentication, rate limiting, and session security
 */

import { Socket } from 'socket.io';
import { AuthManager, AuthConfig } from './auth-manager';
import { RateLimiter, RateLimitConfig } from './rate-limiter';
import { SessionSecurity, SessionSecurityConfig } from './session-security';

export interface SecurityConfig {
  auth: AuthConfig;
  rateLimit: RateLimitConfig;
  sessionSecurity: SessionSecurityConfig;
  enableLogging: boolean;
  autoGenerateSessionIds?: boolean; // Default: false
}

export interface SecurityContext {
  clientId: string;
  sessionId?: string;
  authSession?: string;
  ipAddress: string;
  userAgent?: string;
  isAuthenticated: boolean;
  isRateLimited: boolean;
}

export class SecurityMiddleware {
  private authManager: AuthManager;
  private rateLimiter: RateLimiter;
  private sessionSecurity: SessionSecurity;
  private config: SecurityConfig;

  constructor(config: SecurityConfig) {
    this.config = config;
    this.authManager = new AuthManager(config.auth);
    this.rateLimiter = new RateLimiter(config.rateLimit);
    this.sessionSecurity = new SessionSecurity(config.sessionSecurity);
  }

  /**
   * Authenticate WebSocket connection
   */
  public authenticateConnection(socket: Socket, credentials?: { username?: string; password?: string }): SecurityContext {
    const clientId = this.getClientId(socket);
    const ipAddress = this.getClientIpAddress(socket);
    const userAgent = socket.handshake.headers['user-agent'];

    // Check if client is blocked
    if (this.rateLimiter.isClientBlocked(clientId)) {
      throw new Error('Client is temporarily blocked due to rate limiting');
    }

    // Authenticate if credentials provided
    let authSession: string | null = null;
    let isAuthenticated = false;

    if (credentials && credentials.username && credentials.password) {
      authSession = this.authManager.authenticate(
        credentials.username,
        credentials.password,
        ipAddress,
        userAgent
      );
      
      if (!authSession) {
        this.logSecurityEvent('AUTH_FAILED', clientId, ipAddress, 'Invalid credentials');
        throw new Error('Authentication failed');
      }
      
      isAuthenticated = true;
      this.logSecurityEvent('AUTH_SUCCESS', clientId, ipAddress, 'User authenticated');
    } else if (this.config.auth.enabled) {
      throw new Error('Authentication required');
    }

    const context: SecurityContext = {
      clientId,
      authSession: authSession || undefined,
      ipAddress,
      userAgent,
      isAuthenticated,
      isRateLimited: false,
    };

    this.logSecurityEvent('CONNECTION', clientId, ipAddress, 'Client connected');
    return context;
  }

  /**
   * Validate session join request
   */
  public validateSessionJoin(context: SecurityContext, sessionId: string): boolean {
    // Validate session security (signature/expiration in secure mode only)
    if (!this.sessionSecurity.validateSessionId(sessionId)) {
      this.logSecurityEvent('SESSION_SECURITY_FAILED', context.clientId, context.ipAddress, `Session security validation failed: ${sessionId}`);
      return false;
    }

    // Check session client limit
    if (!this.rateLimiter.checkSessionClientLimit(sessionId)) {
      this.logSecurityEvent('SESSION_FULL', context.clientId, context.ipAddress, `Session full: ${sessionId}`);
      return false;
    }

    // Add client to session
    if (!this.rateLimiter.addClientToSession(sessionId)) {
      return false;
    }

    context.sessionId = sessionId;
    this.logSecurityEvent('SESSION_JOIN', context.clientId, context.ipAddress, `Joined session: ${sessionId}`);
    return true;
  }

  /**
   * Check WebSocket message rate limit
   */
  public checkMessageRateLimit(context: SecurityContext): boolean {
    const allowed = this.rateLimiter.checkWebSocketRateLimit(context.clientId);
    
    if (!allowed) {
      context.isRateLimited = true;
      this.logSecurityEvent('RATE_LIMIT_WS', context.clientId, context.ipAddress, 'WebSocket rate limit exceeded');
    }

    return allowed;
  }

  /**
   * Check Polly API rate limit
   */
  public checkPollyRateLimit(context: SecurityContext): boolean {
    const allowed = this.rateLimiter.checkPollyRateLimit(context.clientId);
    
    if (!allowed) {
      this.logSecurityEvent('RATE_LIMIT_POLLY', context.clientId, context.ipAddress, 'Polly rate limit exceeded');
    }

    return allowed;
  }

  /**
   * Generate secure session ID (if enabled)
   */
  public generateSessionId(adminContext: SecurityContext, clientProvidedId?: string): string | undefined {
    if (!this.config.autoGenerateSessionIds) {
      return clientProvidedId;
    }

    const metadata = {
      adminId: adminContext.authSession,
      ipAddress: adminContext.ipAddress,
      userAgent: adminContext.userAgent,
    };

    const sessionId = this.sessionSecurity.generateSessionId(metadata);
    this.logSecurityEvent('SESSION_CREATE', adminContext.clientId, adminContext.ipAddress, `Created session: ${sessionId}`);
    
    return sessionId;
  }

  /**
   * Handle client disconnect
   */
  public handleDisconnect(context: SecurityContext): void {
    // Remove from session if joined
    if (context.sessionId) {
      this.rateLimiter.removeClientFromSession(context.sessionId);
    }

    // Logout if authenticated
    if (context.authSession) {
      this.authManager.logout(context.authSession);
    }

    this.logSecurityEvent('DISCONNECT', context.clientId, context.ipAddress, 'Client disconnected');
  }

  /**
   * Block client temporarily
   */
  public blockClient(context: SecurityContext, reason: string, durationMs: number = 60000): void {
    this.rateLimiter.blockClient(context.clientId, durationMs);
    this.logSecurityEvent('CLIENT_BLOCKED', context.clientId, context.ipAddress, `Blocked: ${reason}`);
  }

  /**
   * Get security statistics
   */
  public getSecurityStatistics(): {
    auth: { activeSessions: number; sessionCount: number };
    rateLimit: { totalClients: number; blockedClients: number; activeSessions: number };
    sessions: { totalSessions: number; activeSessions: number; securityEnabled: boolean };
  } {
    return {
      auth: {
        activeSessions: this.authManager.getActiveSessions().length,
        sessionCount: this.authManager.getSessionCount(),
      },
      rateLimit: this.rateLimiter.getStatistics(),
      sessions: this.sessionSecurity.getStatistics(),
    };
  }

  /**
   * Validate authentication session
   */
  public validateAuthSession(sessionId: string): boolean {
    const session = this.authManager.validateSession(sessionId);
    return session !== null;
  }

  /**
   * Get client ID from socket
   */
  private getClientId(socket: Socket): string {
    return socket.id;
  }

  /**
   * Get client IP address from socket
   */
  private getClientIpAddress(socket: Socket): string {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    if (forwarded && typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    
    return socket.handshake.address || 'unknown';
  }

  /**
   * Log security events
   */
  private logSecurityEvent(event: string, clientId: string, ipAddress: string, details: string): void {
    if (!this.config.enableLogging) return;

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] SECURITY ${event} - Client: ${clientId} - IP: ${ipAddress} - ${details}`;
    
    console.log(logEntry);
    
    // In a production environment, you might want to write to a security log file
    // or send to a security monitoring system
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.authManager.destroy();
    this.rateLimiter.destroy();
    this.sessionSecurity.destroy();
  }
}
