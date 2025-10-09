import { AdminErrorCode, ERROR_MESSAGES, AdminErrorMessage } from '../../shared/types';
import { ServerErrorLogger } from './error-logger';

/**
 * AdminErrorManager
 * 
 * Manages error handling for admin operations including:
 * - Error code mapping to user-friendly messages
 * - Retryable error classification
 * - Error logging and audit trail
 * - Standardized error response generation
 */
export class AdminErrorManager {
  private errorLogger: ServerErrorLogger;
  private securityEventLog: Array<{
    timestamp: Date;
    errorCode: AdminErrorCode;
    adminId?: string;
    operation?: string;
    details?: any;
  }> = [];

  constructor(errorLogger: ServerErrorLogger) {
    this.errorLogger = errorLogger;
  }

  /**
   * Create a standardized admin error message
   */
  createErrorMessage(
    errorCode: AdminErrorCode,
    details?: {
      sessionId?: string;
      operation?: string;
      adminId?: string;
      validationErrors?: string[];
    }
  ): AdminErrorMessage {
    const errorInfo = ERROR_MESSAGES[errorCode];
    
    if (!errorInfo) {
      // Fallback for unknown error codes
      return {
        type: 'admin-error',
        errorCode: AdminErrorCode.SYSTEM_INTERNAL_ERROR,
        message: 'Unknown error occurred',
        userMessage: 'An unexpected error occurred. Please try again.',
        retryable: true,
        retryAfter: 30,
        details,
        timestamp: new Date().toISOString()
      };
    }

    return {
      type: 'admin-error',
      errorCode,
      message: errorInfo.message,
      userMessage: errorInfo.userMessage,
      retryable: errorInfo.retryable,
      retryAfter: errorInfo.retryAfter,
      details,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Check if an error code is retryable
   */
  isRetryable(errorCode: AdminErrorCode): boolean {
    const errorInfo = ERROR_MESSAGES[errorCode];
    return errorInfo?.retryable ?? false;
  }

  /**
   * Get retry delay for an error code
   */
  getRetryDelay(errorCode: AdminErrorCode): number | undefined {
    const errorInfo = ERROR_MESSAGES[errorCode];
    return errorInfo?.retryAfter;
  }

  /**
   * Log an error with context
   */
  logError(
    errorCode: AdminErrorCode,
    context: {
      adminId?: string;
      sessionId?: string;
      operation?: string;
      error?: Error;
      details?: any;
    }
  ): void {
    const errorInfo = ERROR_MESSAGES[errorCode];
    
    this.errorLogger.error(
      'system',
      `Admin Error: ${errorCode} - ${errorInfo?.message || 'Unknown error'}`,
      {
        errorCode,
        ...context
      }
    );
  }

  /**
   * Log a security event (authentication failures, authorization denials, etc.)
   */
  logSecurityEvent(
    errorCode: AdminErrorCode,
    context: {
      adminId?: string;
      operation?: string;
      details?: any;
    }
  ): void {
    const event = {
      timestamp: new Date(),
      errorCode,
      ...context
    };

    this.securityEventLog.push(event);

    // Log to error logger for persistence
    this.errorLogger.warn(
      'system',
      `Security Event: ${errorCode} - ${ERROR_MESSAGES[errorCode]?.message || 'Security event'}`,
      {
        securityEvent: true,
        ...context
      }
    );

    // Keep only last 1000 security events in memory
    if (this.securityEventLog.length > 1000) {
      this.securityEventLog.shift();
    }
  }

  /**
   * Get recent security events (for audit trail)
   */
  getSecurityEvents(limit: number = 100): Array<{
    timestamp: Date;
    errorCode: AdminErrorCode;
    adminId?: string;
    operation?: string;
    details?: any;
  }> {
    return this.securityEventLog.slice(-limit);
  }

  /**
   * Get security events for a specific admin
   */
  getAdminSecurityEvents(adminId: string, limit: number = 50): Array<{
    timestamp: Date;
    errorCode: AdminErrorCode;
    operation?: string;
    details?: any;
  }> {
    return this.securityEventLog
      .filter(event => event.adminId === adminId)
      .slice(-limit);
  }

  /**
   * Check if error is an authentication error
   */
  isAuthenticationError(errorCode: AdminErrorCode): boolean {
    return errorCode.startsWith('AUTH_');
  }

  /**
   * Check if error is an authorization error
   */
  isAuthorizationError(errorCode: AdminErrorCode): boolean {
    return errorCode.startsWith('AUTHZ_');
  }

  /**
   * Check if error is a validation error
   */
  isValidationError(errorCode: AdminErrorCode): boolean {
    return errorCode.startsWith('VALIDATION_');
  }

  /**
   * Check if error is a system error
   */
  isSystemError(errorCode: AdminErrorCode): boolean {
    return errorCode.startsWith('SYSTEM_');
  }

  /**
   * Aggregate validation errors into a single error message
   */
  createValidationErrorMessage(
    validationErrors: string[],
    operation?: string
  ): AdminErrorMessage {
    return this.createErrorMessage(
      AdminErrorCode.VALIDATION_INVALID_INPUT,
      {
        operation,
        validationErrors
      }
    );
  }

  /**
   * Create error message from caught exception
   */
  createErrorFromException(
    error: Error,
    context: {
      adminId?: string;
      sessionId?: string;
      operation?: string;
    }
  ): AdminErrorMessage {
    // Try to map common error messages to specific error codes
    const errorMessage = error.message.toLowerCase();
    
    let errorCode: AdminErrorCode;
    
    if (errorMessage.includes('not found')) {
      if (context.sessionId) {
        errorCode = AdminErrorCode.SESSION_NOT_FOUND;
      } else if (context.adminId) {
        errorCode = AdminErrorCode.ADMIN_IDENTITY_NOT_FOUND;
      } else {
        errorCode = AdminErrorCode.SYSTEM_INTERNAL_ERROR;
      }
    } else if (errorMessage.includes('permission') || errorMessage.includes('unauthorized')) {
      errorCode = AdminErrorCode.AUTHZ_ACCESS_DENIED;
    } else if (errorMessage.includes('token')) {
      errorCode = AdminErrorCode.AUTH_TOKEN_INVALID;
    } else if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      errorCode = AdminErrorCode.SYSTEM_NETWORK_ERROR;
    } else if (errorMessage.includes('database') || errorMessage.includes('storage')) {
      errorCode = AdminErrorCode.SYSTEM_DATABASE_ERROR;
    } else {
      errorCode = AdminErrorCode.SYSTEM_INTERNAL_ERROR;
    }

    // Log the error
    this.logError(errorCode, { ...context, error });

    return this.createErrorMessage(errorCode, context);
  }

  /**
   * Clear old security events (for cleanup)
   */
  clearOldSecurityEvents(olderThanDays: number = 30): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const initialLength = this.securityEventLog.length;
    this.securityEventLog = this.securityEventLog.filter(
      event => event.timestamp > cutoffDate
    );

    return initialLength - this.securityEventLog.length;
  }
}
