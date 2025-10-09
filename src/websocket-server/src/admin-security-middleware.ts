/**
 * Admin Security Middleware
 * Implements security controls for admin operations including
 * identity validation, session ownership verification, rate limiting,
 * and audit logging
 */

import { AdminIdentityManager } from './admin-identity-manager';
import { SessionManager } from './session-manager';
import { AdminErrorCode } from '../../shared/types';

/**
 * Admin operation types for audit logging
 */
export enum AdminOperation {
  // Authentication operations
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  
  // Session operations
  CREATE_SESSION = 'CREATE_SESSION',
  END_SESSION = 'END_SESSION',
  UPDATE_SESSION_CONFIG = 'UPDATE_SESSION_CONFIG',
  LIST_SESSIONS = 'LIST_SESSIONS',
  ACCESS_SESSION = 'ACCESS_SESSION',
  
  // Admin operations
  VIEW_ADMIN_STATUS = 'VIEW_ADMIN_STATUS',
  INVALIDATE_TOKENS = 'INVALIDATE_TOKENS'
}

/**
 * Security event types
 */
export enum SecurityEventType {
  AUTH_SUCCESS = 'AUTH_SUCCESS',
  AUTH_FAILURE = 'AUTH_FAILURE',
  AUTH_RATE_LIMITED = 'AUTH_RATE_LIMITED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_REFRESHED = 'TOKEN_REFRESHED',
  ACCESS_DENIED = 'ACCESS_DENIED',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  SESSION_OWNERSHIP_VIOLATION = 'SESSION_OWNERSHIP_VIOLATION',
  OPERATION_SUCCESS = 'OPERATION_SUCCESS',
  OPERATION_FAILURE = 'OPERATION_FAILURE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY'
}

/**
 * Security event log entry
 */
export interface SecurityEvent {
  timestamp: Date;
  eventType: SecurityEventType;
  adminId?: string;
  username?: string;
  operation?: AdminOperation;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorCode?: AdminErrorCode;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

/**
 * Rate limit configuration for admin operations
 */
export interface AdminRateLimitConfig {
  authAttemptsPerMinute: number;      // Default: 5
  authAttemptsPerHour: number;        // Default: 20
  operationsPerMinute: number;        // Default: 60
  operationsPerHour: number;          // Default: 1000
  lockoutDurationMs: number;          // Default: 15 minutes
  lockoutThreshold: number;           // Default: 10 failed attempts
}

/**
 * Rate limit entry
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
  failedAttempts: number;
  lockedUntil?: number;
}

/**
 * Admin operation context
 */
export interface AdminOperationContext {
  adminId: string;
  username: string;
  operation: AdminOperation;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errorCode?: AdminErrorCode;
  errorMessage?: string;
  retryAfter?: number;
}

/**
 * Admin Security Middleware
 */
export class AdminSecurityMiddleware {
  private adminIdentityManager: AdminIdentityManager;
  private sessionManager: SessionManager;
  private rateLimitConfig: AdminRateLimitConfig;
  private authRateLimits: Map<string, RateLimitEntry>;
  private operationRateLimits: Map<string, RateLimitEntry>;
  private securityEventLog: SecurityEvent[];
  private maxLogSize: number = 10000;
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    adminIdentityManager: AdminIdentityManager,
    sessionManager: SessionManager,
    rateLimitConfig?: Partial<AdminRateLimitConfig>
  ) {
    this.adminIdentityManager = adminIdentityManager;
    this.sessionManager = sessionManager;
    
    // Set default rate limit configuration
    this.rateLimitConfig = {
      authAttemptsPerMinute: rateLimitConfig?.authAttemptsPerMinute ?? 5,
      authAttemptsPerHour: rateLimitConfig?.authAttemptsPerHour ?? 20,
      operationsPerMinute: rateLimitConfig?.operationsPerMinute ?? 60,
      operationsPerHour: rateLimitConfig?.operationsPerHour ?? 1000,
      lockoutDurationMs: rateLimitConfig?.lockoutDurationMs ?? 15 * 60 * 1000,
      lockoutThreshold: rateLimitConfig?.lockoutThreshold ?? 10
    };
    
    this.authRateLimits = new Map();
    this.operationRateLimits = new Map();
    this.securityEventLog = [];
    
    // Start cleanup scheduler
    this.cleanupInterval = setInterval(() => {
      this.cleanupRateLimits();
      this.cleanupSecurityLog();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Validate admin identity for an operation
   */
  public validateAdminIdentity(adminId: string): ValidationResult {
    const identity = this.adminIdentityManager.getAdminIdentity(adminId);
    
    if (!identity) {
      return {
        valid: false,
        errorCode: AdminErrorCode.ADMIN_IDENTITY_NOT_FOUND,
        errorMessage: 'Admin identity not found'
      };
    }
    
    return { valid: true };
  }

  /**
   * Verify session ownership for write operations
   */
  public verifySessionOwnership(
    adminId: string,
    sessionId: string,
    operation: AdminOperation
  ): ValidationResult {
    // Check if admin owns the session
    const ownsSession = this.adminIdentityManager.verifySessionOwnership(adminId, sessionId);
    
    if (!ownsSession) {
      // Log security event
      this.logSecurityEvent({
        timestamp: new Date(),
        eventType: SecurityEventType.SESSION_OWNERSHIP_VIOLATION,
        adminId,
        operation,
        sessionId,
        success: false,
        errorCode: AdminErrorCode.AUTHZ_SESSION_NOT_OWNED,
        errorMessage: 'Admin does not own the specified session'
      });
      
      return {
        valid: false,
        errorCode: AdminErrorCode.AUTHZ_SESSION_NOT_OWNED,
        errorMessage: 'You can only manage sessions that you created'
      };
    }
    
    return { valid: true };
  }

  /**
   * Check authentication rate limit
   */
  public checkAuthRateLimit(identifier: string): ValidationResult {
    const now = Date.now();
    const entry = this.authRateLimits.get(identifier) || {
      count: 0,
      resetTime: now + 60000, // 1 minute
      failedAttempts: 0
    };
    
    // Check if locked out
    if (entry.lockedUntil && entry.lockedUntil > now) {
      const retryAfter = Math.ceil((entry.lockedUntil - now) / 1000);
      
      this.logSecurityEvent({
        timestamp: new Date(),
        eventType: SecurityEventType.AUTH_RATE_LIMITED,
        ipAddress: identifier,
        success: false,
        errorCode: AdminErrorCode.AUTH_RATE_LIMITED,
        errorMessage: 'Too many authentication attempts',
        metadata: { retryAfter }
      });
      
      return {
        valid: false,
        errorCode: AdminErrorCode.AUTH_RATE_LIMITED,
        errorMessage: 'Too many authentication attempts. Please try again later.',
        retryAfter
      };
    }
    
    // Reset if window expired
    if (now >= entry.resetTime) {
      entry.count = 0;
      entry.resetTime = now + 60000;
    }
    
    // Check per-minute limit
    if (entry.count >= this.rateLimitConfig.authAttemptsPerMinute) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      
      this.logSecurityEvent({
        timestamp: new Date(),
        eventType: SecurityEventType.RATE_LIMIT_EXCEEDED,
        ipAddress: identifier,
        success: false,
        errorCode: AdminErrorCode.AUTH_RATE_LIMITED,
        errorMessage: 'Authentication rate limit exceeded',
        metadata: { retryAfter }
      });
      
      return {
        valid: false,
        errorCode: AdminErrorCode.AUTH_RATE_LIMITED,
        errorMessage: 'Too many authentication attempts. Please wait before trying again.',
        retryAfter
      };
    }
    
    // Increment counter
    entry.count++;
    this.authRateLimits.set(identifier, entry);
    
    return { valid: true };
  }

  /**
   * Record authentication failure
   */
  public recordAuthFailure(identifier: string): void {
    const now = Date.now();
    const entry = this.authRateLimits.get(identifier) || {
      count: 0,
      resetTime: now + 60000,
      failedAttempts: 0
    };
    
    entry.failedAttempts++;
    
    // Check if should lock out
    if (entry.failedAttempts >= this.rateLimitConfig.lockoutThreshold) {
      entry.lockedUntil = now + this.rateLimitConfig.lockoutDurationMs;
      
      this.logSecurityEvent({
        timestamp: new Date(),
        eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
        ipAddress: identifier,
        success: false,
        errorMessage: `Account locked due to ${entry.failedAttempts} failed authentication attempts`,
        metadata: { 
          failedAttempts: entry.failedAttempts,
          lockoutDuration: this.rateLimitConfig.lockoutDurationMs
        }
      });
    }
    
    this.authRateLimits.set(identifier, entry);
  }

  /**
   * Reset authentication rate limit on successful auth
   */
  public resetAuthRateLimit(identifier: string): void {
    this.authRateLimits.delete(identifier);
  }

  /**
   * Check operation rate limit
   */
  public checkOperationRateLimit(adminId: string): ValidationResult {
    const now = Date.now();
    const entry = this.operationRateLimits.get(adminId) || {
      count: 0,
      resetTime: now + 60000, // 1 minute
      failedAttempts: 0
    };
    
    // Reset if window expired
    if (now >= entry.resetTime) {
      entry.count = 0;
      entry.resetTime = now + 60000;
    }
    
    // Check per-minute limit
    if (entry.count >= this.rateLimitConfig.operationsPerMinute) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      
      this.logSecurityEvent({
        timestamp: new Date(),
        eventType: SecurityEventType.RATE_LIMIT_EXCEEDED,
        adminId,
        success: false,
        errorCode: AdminErrorCode.SYSTEM_RATE_LIMITED,
        errorMessage: 'Operation rate limit exceeded',
        metadata: { retryAfter }
      });
      
      return {
        valid: false,
        errorCode: AdminErrorCode.SYSTEM_RATE_LIMITED,
        errorMessage: 'Too many operations. Please slow down.',
        retryAfter
      };
    }
    
    // Increment counter
    entry.count++;
    this.operationRateLimits.set(adminId, entry);
    
    return { valid: true };
  }

  /**
   * Validate admin operation with all security checks
   */
  public validateAdminOperation(context: AdminOperationContext): ValidationResult {
    // 1. Validate admin identity
    const identityResult = this.validateAdminIdentity(context.adminId);
    if (!identityResult.valid) {
      this.logSecurityEvent({
        timestamp: context.timestamp,
        eventType: SecurityEventType.UNAUTHORIZED_ACCESS,
        adminId: context.adminId,
        operation: context.operation,
        sessionId: context.sessionId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        success: false,
        errorCode: identityResult.errorCode,
        errorMessage: identityResult.errorMessage
      });
      return identityResult;
    }
    
    // 2. Check operation rate limit
    const rateLimitResult = this.checkOperationRateLimit(context.adminId);
    if (!rateLimitResult.valid) {
      return rateLimitResult;
    }
    
    // 3. Verify session ownership for write operations
    if (context.sessionId && this.isWriteOperation(context.operation)) {
      const ownershipResult = this.verifySessionOwnership(
        context.adminId,
        context.sessionId,
        context.operation
      );
      if (!ownershipResult.valid) {
        return ownershipResult;
      }
    }
    
    // Log successful validation
    this.logSecurityEvent({
      timestamp: context.timestamp,
      eventType: SecurityEventType.OPERATION_SUCCESS,
      adminId: context.adminId,
      username: context.username,
      operation: context.operation,
      sessionId: context.sessionId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success: true
    });
    
    return { valid: true };
  }

  /**
   * Check if operation is a write operation requiring ownership
   */
  private isWriteOperation(operation: AdminOperation): boolean {
    const writeOperations = [
      AdminOperation.CREATE_SESSION,
      AdminOperation.END_SESSION,
      AdminOperation.UPDATE_SESSION_CONFIG
    ];
    return writeOperations.includes(operation);
  }

  /**
   * Log security event
   */
  public logSecurityEvent(event: SecurityEvent): void {
    this.securityEventLog.push(event);
    
    // Trim log if too large
    if (this.securityEventLog.length > this.maxLogSize) {
      this.securityEventLog = this.securityEventLog.slice(-this.maxLogSize);
    }
    
    // Console log for important events
    if (this.isImportantEvent(event.eventType)) {
      const logLevel = event.success ? 'info' : 'warn';
      console[logLevel](
        `[SECURITY] ${event.eventType} - Admin: ${event.adminId || 'N/A'} - ` +
        `Operation: ${event.operation || 'N/A'} - Success: ${event.success}` +
        (event.errorMessage ? ` - Error: ${event.errorMessage}` : '')
      );
    }
  }

  /**
   * Check if event type is important enough to log to console
   */
  private isImportantEvent(eventType: SecurityEventType): boolean {
    const importantEvents = [
      SecurityEventType.AUTH_FAILURE,
      SecurityEventType.AUTH_RATE_LIMITED,
      SecurityEventType.ACCESS_DENIED,
      SecurityEventType.UNAUTHORIZED_ACCESS,
      SecurityEventType.SESSION_OWNERSHIP_VIOLATION,
      SecurityEventType.RATE_LIMIT_EXCEEDED,
      SecurityEventType.SUSPICIOUS_ACTIVITY
    ];
    return importantEvents.includes(eventType);
  }

  /**
   * Get security events for an admin
   */
  public getAdminSecurityEvents(
    adminId: string,
    limit: number = 100
  ): SecurityEvent[] {
    return this.securityEventLog
      .filter(event => event.adminId === adminId)
      .slice(-limit);
  }

  /**
   * Get recent security events
   */
  public getRecentSecurityEvents(limit: number = 100): SecurityEvent[] {
    return this.securityEventLog.slice(-limit);
  }

  /**
   * Get security statistics
   */
  public getSecurityStatistics(): {
    totalEvents: number;
    authFailures: number;
    accessDenials: number;
    rateLimitViolations: number;
    suspiciousActivities: number;
    lockedAccounts: number;
  } {
    const now = Date.now();
    let authFailures = 0;
    let accessDenials = 0;
    let rateLimitViolations = 0;
    let suspiciousActivities = 0;
    
    for (const event of this.securityEventLog) {
      if (event.eventType === SecurityEventType.AUTH_FAILURE) authFailures++;
      if (event.eventType === SecurityEventType.ACCESS_DENIED) accessDenials++;
      if (event.eventType === SecurityEventType.RATE_LIMIT_EXCEEDED) rateLimitViolations++;
      if (event.eventType === SecurityEventType.SUSPICIOUS_ACTIVITY) suspiciousActivities++;
    }
    
    // Count locked accounts
    let lockedAccounts = 0;
    for (const entry of this.authRateLimits.values()) {
      if (entry.lockedUntil && entry.lockedUntil > now) {
        lockedAccounts++;
      }
    }
    
    return {
      totalEvents: this.securityEventLog.length,
      authFailures,
      accessDenials,
      rateLimitViolations,
      suspiciousActivities,
      lockedAccounts
    };
  }

  /**
   * Clean up expired rate limit entries
   */
  private cleanupRateLimits(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    // Clean up auth rate limits
    for (const [identifier, entry] of this.authRateLimits) {
      if (now >= entry.resetTime && (!entry.lockedUntil || now >= entry.lockedUntil)) {
        this.authRateLimits.delete(identifier);
        cleanedCount++;
      }
    }
    
    // Clean up operation rate limits
    for (const [adminId, entry] of this.operationRateLimits) {
      if (now >= entry.resetTime) {
        this.operationRateLimits.delete(adminId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`[SECURITY] Cleaned up ${cleanedCount} expired rate limit entries`);
    }
  }

  /**
   * Clean up old security log entries
   */
  private cleanupSecurityLog(): void {
    if (this.securityEventLog.length > this.maxLogSize) {
      const removed = this.securityEventLog.length - this.maxLogSize;
      this.securityEventLog = this.securityEventLog.slice(-this.maxLogSize);
      console.log(`[SECURITY] Cleaned up ${removed} old security log entries`);
    }
  }

  /**
   * Export security audit log
   */
  public exportAuditLog(
    startDate?: Date,
    endDate?: Date
  ): SecurityEvent[] {
    let events = this.securityEventLog;
    
    if (startDate) {
      events = events.filter(e => e.timestamp >= startDate);
    }
    
    if (endDate) {
      events = events.filter(e => e.timestamp <= endDate);
    }
    
    return events;
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
