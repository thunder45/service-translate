"use strict";
// Shared TypeScript types for Service Translate
// Based on API_SPECIFICATION-2025-10-01-FINAL.md and Admin Session Persistence Spec
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_RETRY_STRATEGY = exports.ERROR_MESSAGES = exports.AdminErrorCode = void 0;
// Error Code Enumeration
var AdminErrorCode;
(function (AdminErrorCode) {
    // Authentication Errors (1000-1099)
    AdminErrorCode["AUTH_INVALID_CREDENTIALS"] = "AUTH_1001";
    AdminErrorCode["AUTH_TOKEN_EXPIRED"] = "AUTH_1002";
    AdminErrorCode["AUTH_TOKEN_INVALID"] = "AUTH_1003";
    AdminErrorCode["AUTH_REFRESH_TOKEN_EXPIRED"] = "AUTH_1004";
    AdminErrorCode["AUTH_REFRESH_TOKEN_INVALID"] = "AUTH_1005";
    AdminErrorCode["AUTH_SESSION_NOT_FOUND"] = "AUTH_1006";
    AdminErrorCode["AUTH_RATE_LIMITED"] = "AUTH_1007";
    AdminErrorCode["AUTH_ACCOUNT_LOCKED"] = "AUTH_1008";
    // Authorization Errors (1100-1199)
    AdminErrorCode["AUTHZ_ACCESS_DENIED"] = "AUTHZ_1101";
    AdminErrorCode["AUTHZ_SESSION_NOT_OWNED"] = "AUTHZ_1102";
    AdminErrorCode["AUTHZ_INSUFFICIENT_PERMISSIONS"] = "AUTHZ_1103";
    AdminErrorCode["AUTHZ_OPERATION_NOT_ALLOWED"] = "AUTHZ_1104";
    // Session Management Errors (1200-1299)
    AdminErrorCode["SESSION_NOT_FOUND"] = "SESSION_1201";
    AdminErrorCode["SESSION_ALREADY_EXISTS"] = "SESSION_1202";
    AdminErrorCode["SESSION_INVALID_CONFIG"] = "SESSION_1203";
    AdminErrorCode["SESSION_CREATION_FAILED"] = "SESSION_1204";
    AdminErrorCode["SESSION_UPDATE_FAILED"] = "SESSION_1205";
    AdminErrorCode["SESSION_DELETE_FAILED"] = "SESSION_1206";
    AdminErrorCode["SESSION_CLIENT_LIMIT_EXCEEDED"] = "SESSION_1207";
    // Admin Identity Errors (1300-1399)
    AdminErrorCode["ADMIN_IDENTITY_NOT_FOUND"] = "ADMIN_1301";
    AdminErrorCode["ADMIN_IDENTITY_CREATION_FAILED"] = "ADMIN_1302";
    AdminErrorCode["ADMIN_USERNAME_TAKEN"] = "ADMIN_1303";
    AdminErrorCode["ADMIN_IDENTITY_CORRUPTED"] = "ADMIN_1304";
    // System Errors (1400-1499)
    AdminErrorCode["SYSTEM_INTERNAL_ERROR"] = "SYSTEM_1401";
    AdminErrorCode["SYSTEM_DATABASE_ERROR"] = "SYSTEM_1402";
    AdminErrorCode["SYSTEM_NETWORK_ERROR"] = "SYSTEM_1403";
    AdminErrorCode["SYSTEM_RATE_LIMITED"] = "SYSTEM_1404";
    AdminErrorCode["SYSTEM_MAINTENANCE_MODE"] = "SYSTEM_1405";
    AdminErrorCode["SYSTEM_CONNECTION_LIMIT_EXCEEDED"] = "SYSTEM_1406";
    // Validation Errors (1500-1599)
    AdminErrorCode["VALIDATION_INVALID_INPUT"] = "VALIDATION_1501";
    AdminErrorCode["VALIDATION_MISSING_REQUIRED_FIELD"] = "VALIDATION_1502";
    AdminErrorCode["VALIDATION_INVALID_SESSION_ID"] = "VALIDATION_1503";
    AdminErrorCode["VALIDATION_INVALID_LANGUAGE"] = "VALIDATION_1504";
    AdminErrorCode["VALIDATION_INVALID_CONFIG"] = "VALIDATION_1505";
})(AdminErrorCode || (exports.AdminErrorCode = AdminErrorCode = {}));
// Error Code to User Message Mapping
exports.ERROR_MESSAGES = {
    [AdminErrorCode.AUTH_INVALID_CREDENTIALS]: {
        message: 'Invalid username or password provided',
        userMessage: 'Invalid username or password. Please check your credentials and try again.',
        retryable: true
    },
    [AdminErrorCode.AUTH_TOKEN_EXPIRED]: {
        message: 'Authentication token has expired',
        userMessage: 'Your session has expired. Please log in again.',
        retryable: true
    },
    [AdminErrorCode.AUTH_TOKEN_INVALID]: {
        message: 'Authentication token is invalid or malformed',
        userMessage: 'Authentication error. Please log in again.',
        retryable: true
    },
    [AdminErrorCode.AUTH_REFRESH_TOKEN_EXPIRED]: {
        message: 'Refresh token has expired',
        userMessage: 'Your session has expired. Please log in again.',
        retryable: true
    },
    [AdminErrorCode.AUTH_REFRESH_TOKEN_INVALID]: {
        message: 'Refresh token is invalid or malformed',
        userMessage: 'Authentication error. Please log in again.',
        retryable: true
    },
    [AdminErrorCode.AUTH_SESSION_NOT_FOUND]: {
        message: 'Authentication session not found',
        userMessage: 'Session not found. Please log in again.',
        retryable: true
    },
    [AdminErrorCode.AUTH_RATE_LIMITED]: {
        message: 'Too many authentication attempts',
        userMessage: 'Too many login attempts. Please wait before trying again.',
        retryable: true,
        retryAfter: 300 // 5 minutes
    },
    [AdminErrorCode.AUTH_ACCOUNT_LOCKED]: {
        message: 'Account has been locked due to security reasons',
        userMessage: 'Account locked. Please contact administrator.',
        retryable: false
    },
    [AdminErrorCode.AUTHZ_ACCESS_DENIED]: {
        message: 'Access denied for requested operation',
        userMessage: 'You do not have permission to perform this action.',
        retryable: false
    },
    [AdminErrorCode.AUTHZ_SESSION_NOT_OWNED]: {
        message: 'Admin does not own the specified session',
        userMessage: 'You can only manage sessions that you created.',
        retryable: false
    },
    [AdminErrorCode.AUTHZ_INSUFFICIENT_PERMISSIONS]: {
        message: 'Insufficient permissions for requested operation',
        userMessage: 'You do not have sufficient permissions for this action.',
        retryable: false
    },
    [AdminErrorCode.AUTHZ_OPERATION_NOT_ALLOWED]: {
        message: 'Operation not allowed in current context',
        userMessage: 'This operation is not allowed at this time.',
        retryable: false
    },
    [AdminErrorCode.SESSION_NOT_FOUND]: {
        message: 'Specified session does not exist',
        userMessage: 'Session not found. It may have been deleted or expired.',
        retryable: false
    },
    [AdminErrorCode.SESSION_ALREADY_EXISTS]: {
        message: 'Session with this ID already exists',
        userMessage: 'A session with this ID already exists. Please choose a different ID.',
        retryable: true
    },
    [AdminErrorCode.SESSION_INVALID_CONFIG]: {
        message: 'Session configuration is invalid',
        userMessage: 'Invalid session configuration. Please check your settings.',
        retryable: true
    },
    [AdminErrorCode.SESSION_CREATION_FAILED]: {
        message: 'Failed to create session',
        userMessage: 'Failed to create session. Please try again.',
        retryable: true,
        retryAfter: 5
    },
    [AdminErrorCode.SESSION_UPDATE_FAILED]: {
        message: 'Failed to update session',
        userMessage: 'Failed to update session. Please try again.',
        retryable: true,
        retryAfter: 5
    },
    [AdminErrorCode.SESSION_DELETE_FAILED]: {
        message: 'Failed to delete session',
        userMessage: 'Failed to delete session. Please try again.',
        retryable: true,
        retryAfter: 5
    },
    [AdminErrorCode.SESSION_CLIENT_LIMIT_EXCEEDED]: {
        message: 'Session has reached maximum client limit',
        userMessage: 'Session is full. Maximum number of clients reached.',
        retryable: false
    },
    [AdminErrorCode.ADMIN_IDENTITY_NOT_FOUND]: {
        message: 'Admin identity not found',
        userMessage: 'Admin account not found. Please contact administrator.',
        retryable: false
    },
    [AdminErrorCode.ADMIN_IDENTITY_CREATION_FAILED]: {
        message: 'Failed to create admin identity',
        userMessage: 'Failed to create admin account. Please try again.',
        retryable: true,
        retryAfter: 10
    },
    [AdminErrorCode.ADMIN_USERNAME_TAKEN]: {
        message: 'Username is already taken',
        userMessage: 'Username is already in use. Please choose a different username.',
        retryable: true
    },
    [AdminErrorCode.ADMIN_IDENTITY_CORRUPTED]: {
        message: 'Admin identity data is corrupted',
        userMessage: 'Account data error. Please contact administrator.',
        retryable: false
    },
    [AdminErrorCode.SYSTEM_INTERNAL_ERROR]: {
        message: 'Internal server error occurred',
        userMessage: 'An unexpected error occurred. Please try again later.',
        retryable: true,
        retryAfter: 30
    },
    [AdminErrorCode.SYSTEM_DATABASE_ERROR]: {
        message: 'Database operation failed',
        userMessage: 'System error. Please try again later.',
        retryable: true,
        retryAfter: 60
    },
    [AdminErrorCode.SYSTEM_NETWORK_ERROR]: {
        message: 'Network communication error',
        userMessage: 'Network error. Please check your connection and try again.',
        retryable: true,
        retryAfter: 10
    },
    [AdminErrorCode.SYSTEM_RATE_LIMITED]: {
        message: 'System rate limit exceeded',
        userMessage: 'Too many requests. Please wait before trying again.',
        retryable: true,
        retryAfter: 60
    },
    [AdminErrorCode.SYSTEM_MAINTENANCE_MODE]: {
        message: 'System is in maintenance mode',
        userMessage: 'System is under maintenance. Please try again later.',
        retryable: true,
        retryAfter: 300
    },
    [AdminErrorCode.SYSTEM_CONNECTION_LIMIT_EXCEEDED]: {
        message: 'Maximum connection limit exceeded',
        userMessage: 'Server is at capacity. Please try again later.',
        retryable: true,
        retryAfter: 120
    },
    [AdminErrorCode.VALIDATION_INVALID_INPUT]: {
        message: 'Invalid input provided',
        userMessage: 'Invalid input. Please check your data and try again.',
        retryable: true
    },
    [AdminErrorCode.VALIDATION_MISSING_REQUIRED_FIELD]: {
        message: 'Required field is missing',
        userMessage: 'Required information is missing. Please complete all fields.',
        retryable: true
    },
    [AdminErrorCode.VALIDATION_INVALID_SESSION_ID]: {
        message: 'Session ID format is invalid',
        userMessage: 'Invalid session ID format. Please check and try again.',
        retryable: true
    },
    [AdminErrorCode.VALIDATION_INVALID_LANGUAGE]: {
        message: 'Invalid language code provided',
        userMessage: 'Invalid language selection. Please choose a supported language.',
        retryable: true
    },
    [AdminErrorCode.VALIDATION_INVALID_CONFIG]: {
        message: 'Configuration validation failed',
        userMessage: 'Invalid configuration. Please check your settings.',
        retryable: true
    }
};
exports.DEFAULT_RETRY_STRATEGY = {
    maxAttempts: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
    backoffMultiplier: 2,
    retryableErrors: [
        AdminErrorCode.SYSTEM_INTERNAL_ERROR,
        AdminErrorCode.SYSTEM_NETWORK_ERROR,
        AdminErrorCode.AUTH_TOKEN_EXPIRED,
        AdminErrorCode.SESSION_CREATION_FAILED,
        AdminErrorCode.SESSION_UPDATE_FAILED
    ]
};
//# sourceMappingURL=types.js.map