import { AdminErrorManager } from './admin-error-manager';
import { AdminErrorCode, AdminErrorMessage } from '../../shared/types';
import WebSocket from 'ws';

/**
 * AdminErrorMiddleware
 * 
 * Provides middleware functionality for handling errors in admin operations:
 * - Catches and standardizes error responses
 * - Implements retry-after header support
 * - Aggregates validation errors
 * - Logs security events
 */
export class AdminErrorMiddleware {
  private errorManager: AdminErrorManager;
  private rateLimitTracker: Map<string, { count: number; resetTime: number }> = new Map();

  constructor(errorManager: AdminErrorManager) {
    this.errorManager = errorManager;
  }

  /**
   * Wrap an admin operation with error handling
   */
  async wrapOperation<T>(
    operation: () => Promise<T>,
    context: {
      adminId?: string;
      sessionId?: string;
      operation: string;
      ws?: WebSocket;
    }
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const errorMessage = this.errorManager.createErrorFromException(
        error as Error,
        context
      );

      // Send error to client if WebSocket provided
      if (context.ws && context.ws.readyState === WebSocket.OPEN) {
        this.sendErrorToClient(context.ws, errorMessage);
      }

      // Log security events for auth/authz errors
      if (
        this.errorManager.isAuthenticationError(errorMessage.errorCode) ||
        this.errorManager.isAuthorizationError(errorMessage.errorCode)
      ) {
        this.errorManager.logSecurityEvent(errorMessage.errorCode, {
          adminId: context.adminId,
          operation: context.operation,
          details: errorMessage.details
        });
      }

      throw error;
    }
  }

  /**
   * Send error message to WebSocket client
   */
  sendErrorToClient(ws: WebSocket, errorMessage: AdminErrorMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(errorMessage));
    }
  }

  /**
   * Handle authentication failure
   */
  handleAuthenticationFailure(
    ws: WebSocket,
    adminId: string | undefined,
    reason: 'invalid-credentials' | 'token-expired' | 'token-invalid' | 'rate-limited'
  ): void {
    let errorCode: AdminErrorCode;

    switch (reason) {
      case 'invalid-credentials':
        errorCode = AdminErrorCode.AUTH_INVALID_CREDENTIALS;
        break;
      case 'token-expired':
        errorCode = AdminErrorCode.AUTH_TOKEN_EXPIRED;
        break;
      case 'token-invalid':
        errorCode = AdminErrorCode.AUTH_TOKEN_INVALID;
        break;
      case 'rate-limited':
        errorCode = AdminErrorCode.AUTH_RATE_LIMITED;
        break;
    }

    const errorMessage = this.errorManager.createErrorMessage(errorCode, {
      adminId,
      operation: 'authentication'
    });

    this.sendErrorToClient(ws, errorMessage);

    // Log security event
    this.errorManager.logSecurityEvent(errorCode, {
      adminId,
      operation: 'authentication',
      details: { reason }
    });
  }

  /**
   * Handle authorization failure
   */
  handleAuthorizationFailure(
    ws: WebSocket,
    adminId: string,
    sessionId: string,
    operation: string
  ): void {
    const errorMessage = this.errorManager.createErrorMessage(
      AdminErrorCode.AUTHZ_SESSION_NOT_OWNED,
      {
        adminId,
        sessionId,
        operation
      }
    );

    this.sendErrorToClient(ws, errorMessage);

    // Log security event
    this.errorManager.logSecurityEvent(
      AdminErrorCode.AUTHZ_SESSION_NOT_OWNED,
      {
        adminId,
        operation,
        details: { sessionId }
      }
    );
  }

  /**
   * Handle validation errors
   */
  handleValidationErrors(
    ws: WebSocket,
    validationErrors: string[],
    context: {
      adminId?: string;
      sessionId?: string;
      operation: string;
    }
  ): void {
    const errorMessage = this.errorManager.createValidationErrorMessage(
      validationErrors,
      context.operation
    );

    this.sendErrorToClient(ws, errorMessage);

    this.errorManager.logError(
      AdminErrorCode.VALIDATION_INVALID_INPUT,
      {
        ...context,
        details: { validationErrors }
      }
    );
  }

  /**
   * Check rate limit for admin operations
   */
  checkRateLimit(
    adminId: string,
    operation: string,
    limit: number = 10,
    windowSeconds: number = 60
  ): { allowed: boolean; retryAfter?: number } {
    const key = `${adminId}:${operation}`;
    const now = Date.now();
    const tracker = this.rateLimitTracker.get(key);

    if (!tracker || now > tracker.resetTime) {
      // New window or expired window
      this.rateLimitTracker.set(key, {
        count: 1,
        resetTime: now + windowSeconds * 1000
      });
      return { allowed: true };
    }

    if (tracker.count >= limit) {
      // Rate limit exceeded
      const retryAfter = Math.ceil((tracker.resetTime - now) / 1000);
      return { allowed: false, retryAfter };
    }

    // Increment counter
    tracker.count++;
    return { allowed: true };
  }

  /**
   * Handle rate limit exceeded
   */
  handleRateLimitExceeded(
    ws: WebSocket,
    adminId: string,
    operation: string,
    retryAfter: number
  ): void {
    const errorMessage = this.errorManager.createErrorMessage(
      AdminErrorCode.SYSTEM_RATE_LIMITED,
      {
        adminId,
        operation
      }
    );

    // Override retry after with actual value
    errorMessage.retryAfter = retryAfter;

    this.sendErrorToClient(ws, errorMessage);

    this.errorManager.logError(
      AdminErrorCode.SYSTEM_RATE_LIMITED,
      {
        adminId,
        operation,
        details: { retryAfter }
      }
    );
  }

  /**
   * Validate admin operation request
   */
  validateAdminRequest(
    request: any,
    requiredFields: string[]
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const field of requiredFields) {
      if (request[field] === undefined || request[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Additional validation rules
    if (request.sessionId && typeof request.sessionId !== 'string') {
      errors.push('sessionId must be a string');
    }

    if (request.adminId && typeof request.adminId !== 'string') {
      errors.push('adminId must be a string');
    }

    if (request.config && typeof request.config !== 'object') {
      errors.push('config must be an object');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Handle session not found error
   */
  handleSessionNotFound(
    ws: WebSocket,
    sessionId: string,
    adminId?: string,
    operation?: string
  ): void {
    const errorMessage = this.errorManager.createErrorMessage(
      AdminErrorCode.SESSION_NOT_FOUND,
      {
        sessionId,
        adminId,
        operation
      }
    );

    this.sendErrorToClient(ws, errorMessage);

    this.errorManager.logError(
      AdminErrorCode.SESSION_NOT_FOUND,
      {
        sessionId,
        adminId,
        operation
      }
    );
  }

  /**
   * Handle session operation failure
   */
  handleSessionOperationFailure(
    ws: WebSocket,
    errorCode: AdminErrorCode,
    context: {
      sessionId: string;
      adminId?: string;
      operation: string;
      error?: Error;
    }
  ): void {
    const errorMessage = this.errorManager.createErrorMessage(errorCode, {
      sessionId: context.sessionId,
      adminId: context.adminId,
      operation: context.operation
    });

    this.sendErrorToClient(ws, errorMessage);

    this.errorManager.logError(errorCode, context);
  }

  /**
   * Clean up old rate limit trackers
   */
  cleanupRateLimitTrackers(): void {
    const now = Date.now();
    for (const [key, tracker] of this.rateLimitTracker.entries()) {
      if (now > tracker.resetTime) {
        this.rateLimitTracker.delete(key);
      }
    }
  }

  /**
   * Get rate limit status for an admin
   */
  getRateLimitStatus(adminId: string, operation: string): {
    count: number;
    limit: number;
    resetTime: number;
    remaining: number;
  } | null {
    const key = `${adminId}:${operation}`;
    const tracker = this.rateLimitTracker.get(key);

    if (!tracker) {
      return null;
    }

    const limit = 10; // Default limit
    return {
      count: tracker.count,
      limit,
      resetTime: tracker.resetTime,
      remaining: Math.max(0, limit - tracker.count)
    };
  }
}
