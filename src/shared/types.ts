// Shared TypeScript types for Service Translate
// Based on API_SPECIFICATION-2025-10-01-FINAL.md and Admin Session Persistence Spec

export type ConnectionType = 'admin' | 'client';
export type SourceLanguage = 'pt' | 'en' | 'es' | 'fr' | 'de' | 'it';
export type TargetLanguage = 'en' | 'fr' | 'es' | 'de' | 'it' | 'pt';
export type AudioEncoding = 'pcm' | 'opus' | 'flac';
export type SessionStatus = 'started' | 'active' | 'paused' | 'ending' | 'ended' | 'error';
export type MessageType = 'connection' | 'session' | 'session_membership' | 'audio_ack' | 
  'translation' | 'language' | 'terminology' | 'status' | 'warning' | 'error' | 'admin-auth' |
  'admin-auth-response' | 'start-session-response' | 'end-session-response' | 'list-sessions' |
  'list-sessions-response' | 'update-session-config' | 'update-session-config-response' |
  'session-status-update' | 'admin-reconnection' | 'admin-session-access' | 'admin-session-access-response' |
  'admin-error' | 'admin-status-update' | 'token-refresh' | 'token-refresh-response' |
  'token-expiry-warning' | 'session-expired';

// Admin Authentication Types
export interface AdminIdentity {
  adminId: string;           // UUID v4 persistent identifier
  username: string;          // Display name (unique)
  createdAt: Date;
  lastSeen: Date;
  activeSockets: Set<string>; // Current socket connections (not persisted)
  ownedSessions: Set<string>; // Sessions created by this admin
  tokenVersion: number;       // For token invalidation
  refreshTokens: Set<string>; // Active refresh tokens
}

export interface AdminPermissions {
  canCreateSessions: boolean;
  canViewAllSessions: boolean;
  canManageOwnSessions: boolean;
  canDeleteOwnSessions: boolean;
}

export interface AdminConnectionContext {
  socketId: string;
  adminId: string;
  username: string;
  authSessionId: string;
  connectedAt: Date;
  permissions: AdminPermissions;
}

// Enhanced Session Data with Admin Identity
export interface SessionData {
  sessionId: string;
  adminId: string;                    // Persistent admin owner (replaces adminSocketId)
  currentAdminSocketId: string | null; // Current admin connection
  createdBy: string;                  // Username for display
  config: SessionConfig;
  clients: Map<string, ClientData>;
  createdAt: Date;
  lastActivity: Date;
  status: SessionStatus;
}

export interface SessionConfig {
  sourceLanguage: SourceLanguage;
  targetLanguages: TargetLanguage[];
  enabledLanguages: TargetLanguage[];
  ttsMode: 'neural' | 'standard' | 'local' | 'disabled';
  audioQuality: 'high' | 'medium' | 'low';
  audioConfig: AudioConfig;
  sessionName?: string;
}

export interface AudioCapabilities {
  supportsPolly: boolean;
  localTTSLanguages: TargetLanguage[];
  audioFormats: string[];
}

export interface ClientData {
  clientId: string;
  socketId: string;
  preferredLanguage: TargetLanguage;
  clientName?: string;
  connectedAt: Date;
  lastActivity: Date;
  joinedAt: Date;
  lastSeen: Date;
  audioCapabilities?: AudioCapabilities;
}

export interface SessionSummary {
  sessionId: string;
  status: SessionStatus;
  clientCount: number;
  createdAt: string;
  createdBy: string;
  isOwner: boolean;
  config: {
    enabledLanguages: TargetLanguage[];
    ttsMode: string;
  };
}

// Connection
export interface ConnectQueryParams {
  connectionType: ConnectionType;
  deviceId: string;
  Authorization?: string; // "Bearer <token>" - required for admin
}

export interface ConnectionResponse {
  type: 'connection';
  connectionId: string;
  status: 'connected';
  timestamp: string;
}

// Audio Configuration
export interface AudioConfig {
  sampleRate: 8000 | 16000 | 22050 | 44100 | 48000;
  encoding: AudioEncoding;
  channels: 1 | 2;
}

// Session Management
export interface StartSessionRequest {
  action: 'startsession';
  sourceLanguage: SourceLanguage;
  targetLanguages: TargetLanguage[];
  timestamp: string;
  sessionName?: string;
  audioConfig: AudioConfig;
}

export interface StartSessionResponse {
  type: 'session';
  sessionId: string;
  sessionName: string;
  status: 'started';
  timestamp: string;
  qrCode: string;
  shortUrl: string;
}

export interface EndSessionRequest {
  action: 'endsession';
  sessionId: string;
  reason?: string;
  timestamp: string;
}

export interface EndSessionResponse {
  type: 'session';
  sessionId: string;
  status: 'ended';
  timestamp: string;
  statistics: {
    duration: number;
    audioProcessed: number;
    translationsSent: number;
    connectedUsers: number;
  };
}

// Audio Streaming
export interface AudioStreamRequest {
  action: 'audiostream';
  sessionId: string;
  timestamp: string;
  sequenceNumber: number;
  audioData: string; // base64
  isLastChunk?: boolean;
}

export interface AudioAckResponse {
  type: 'audio_ack';
  status: 'received';
  sequenceNumber: number;
  timestamp: string;
}

// Session Membership
export interface JoinSessionRequest {
  action: 'joinsession';
  connectionType: ConnectionType;
  sessionName?: string;
  preferredLanguage?: TargetLanguage;
  clientName?: string;
  timestamp: string;
}

export interface JoinSessionResponse {
  type: 'session_membership';
  status: 'joined';
  sessionId: string;
  availableLanguages: TargetLanguage[];
  currentLanguage: TargetLanguage;
  sessionName?: string;
  startTime: string;
  timestamp: string;
}

export interface LeaveSessionRequest {
  action: 'leavesession';
  sessionId: string;
  timestamp: string;
}

export interface LeaveSessionResponse {
  type: 'session_membership';
  status: 'left';
  sessionId: string;
  timestamp: string;
}

// Language Management
export interface SetLanguageRequest {
  action: 'setlanguage';
  sessionId: string;
  language: TargetLanguage;
  timestamp: string;
}

export interface SetLanguageResponse {
  type: 'language';
  status: 'updated';
  sessionId: string;
  language: TargetLanguage;
  timestamp: string;
}

// Translation
export interface TranslationMessage {
  type: 'translation';
  sessionId: string;
  sourceLanguage: SourceLanguage;
  targetLanguage: TargetLanguage;
  text: string;
  confidence: number;
  isFinal: boolean;
  timestamp: string;
  sequenceNumber: number;
  metadata: {
    sourceText: string;
    processingTime: number;
    translationMethod: string;
  };
}

// Status
export interface StatusMessage {
  type: 'status';
  sessionId: string;
  status: SessionStatus;
  message?: string;
  timestamp: string;
}

// Terminology
export interface TerminologyEntry {
  sourceText: string;
  translations: Partial<Record<TargetLanguage, string>>;
  category?: string;
  confidence?: number;
  priority?: number;
  context?: string;
}

export interface AddTerminologyRequest {
  action: 'addterminology';
  timestamp: string;
  entries: TerminologyEntry[];
}

export interface AddTerminologyResponse {
  type: 'terminology';
  status: 'added' | 'partial';
  entriesAdded: number;
  entriesRejected: number;
  rejectedEntries: Array<{
    sourceText: string;
    reason: string;
  }>;
  timestamp: string;
}

// Error
export interface ErrorResponse {
  type: 'error';
  code: number;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
}

// Admin Authentication Messages
export interface AdminAuthMessage {
  type: 'admin-auth';
  method: 'credentials' | 'token';
  // For credentials method
  username?: string;
  password?: string;
  // For token method
  token?: string;
  clientInfo?: {
    appVersion: string;
    platform: string;
    deviceId: string;
  };
}

export interface AdminAuthResponse {
  type: 'admin-auth-response';
  success: boolean;
  adminId?: string;
  username?: string;
  // JWT token for future authentication
  token?: string;
  tokenExpiry?: string; // ISO timestamp
  refreshToken?: string;
  ownedSessions?: SessionSummary[];
  allSessions?: SessionSummary[];
  permissions?: AdminPermissions;
  error?: string;
  timestamp: string;
}

// Session Management Messages
export interface StartSessionMessage {
  type: 'start-session';
  sessionId: string;
  config: SessionConfig;
  // adminId is derived from authenticated connection
}

export interface StartSessionResponseMessage {
  type: 'start-session-response';
  success: boolean;
  sessionId?: string;
  adminId?: string;
  config?: SessionConfig;
  error?: string;
  timestamp: string;
}

export interface EndSessionMessage {
  type: 'end-session';
  sessionId: string;
  reason?: string;
}

export interface EndSessionResponseMessage {
  type: 'end-session-response';
  success: boolean;
  sessionId: string;
  error?: string;
  timestamp: string;
}

export interface ListSessionsMessage {
  type: 'list-sessions';
  filter?: 'owned' | 'all';
}

export interface ListSessionsResponse {
  type: 'list-sessions-response';
  sessions: SessionSummary[];
  timestamp: string;
}

export interface UpdateSessionConfigMessage {
  type: 'update-session-config';
  sessionId: string;
  config: Partial<SessionConfig>;
}

export interface UpdateSessionConfigResponse {
  type: 'update-session-config-response';
  success: boolean;
  sessionId: string;
  config?: SessionConfig;
  error?: string;
  timestamp: string;
}

export interface SessionStatusUpdate {
  type: 'session-status-update';
  sessionId: string;
  status: SessionStatus;
  clientCount: number;
  config: SessionConfig;
  lastActivity: string;
  isOwner: boolean;
}

// Admin Management Messages
export interface AdminReconnectionNotification {
  type: 'admin-reconnection';
  adminId: string;
  username: string;
  recoveredSessions: string[];
  timestamp: string;
}

export interface AdminSessionAccessMessage {
  type: 'admin-session-access';
  sessionId: string;
  accessType: 'read' | 'write';
}

export interface AdminSessionAccessResponse {
  type: 'admin-session-access-response';
  success: boolean;
  sessionId: string;
  accessType: 'read' | 'write';
  sessionData?: SessionData;
  error?: string;
  timestamp: string;
}

export interface AdminStatusUpdate {
  type: 'admin-status-update';
  adminId: string;
  activeConnections: number;
  ownedSessions: number;
  totalSessions: number;
  lastActivity: string;
  permissions: AdminPermissions;
}

// Token Management Messages
export interface TokenRefreshMessage {
  type: 'token-refresh';
  refreshToken: string;
  adminId: string;
}

export interface TokenRefreshResponse {
  type: 'token-refresh-response';
  success: boolean;
  token?: string;
  tokenExpiry?: string;
  refreshToken?: string;
  error?: string;
  timestamp: string;
}

export interface TokenExpiryWarning {
  type: 'token-expiry-warning';
  adminId: string;
  expiresAt: string;
  timeRemaining: number; // seconds
  timestamp: string;
}

export interface SessionExpiredNotification {
  type: 'session-expired';
  adminId: string;
  reason: 'token-expired' | 'invalid-token' | 'revoked';
  timestamp: string;
}

// Admin Error Messages
export interface AdminErrorMessage {
  type: 'admin-error';
  errorCode: AdminErrorCode;
  message: string;
  userMessage: string;        // User-friendly message for UI display
  retryable: boolean;         // Whether operation can be retried
  retryAfter?: number;        // Seconds to wait before retry (if retryable)
  details?: {
    sessionId?: string;
    operation?: string;
    adminId?: string;
    validationErrors?: string[];
  };
  timestamp: string;
}

// Error Code Enumeration
export enum AdminErrorCode {
  // Authentication Errors (1000-1099)
  AUTH_INVALID_CREDENTIALS = 'AUTH_1001',
  AUTH_TOKEN_EXPIRED = 'AUTH_1002',
  AUTH_TOKEN_INVALID = 'AUTH_1003',
  AUTH_REFRESH_TOKEN_EXPIRED = 'AUTH_1004',
  AUTH_REFRESH_TOKEN_INVALID = 'AUTH_1005',
  AUTH_SESSION_NOT_FOUND = 'AUTH_1006',
  AUTH_RATE_LIMITED = 'AUTH_1007',
  AUTH_ACCOUNT_LOCKED = 'AUTH_1008',
  
  // Authorization Errors (1100-1199)
  AUTHZ_ACCESS_DENIED = 'AUTHZ_1101',
  AUTHZ_SESSION_NOT_OWNED = 'AUTHZ_1102',
  AUTHZ_INSUFFICIENT_PERMISSIONS = 'AUTHZ_1103',
  AUTHZ_OPERATION_NOT_ALLOWED = 'AUTHZ_1104',
  
  // Session Management Errors (1200-1299)
  SESSION_NOT_FOUND = 'SESSION_1201',
  SESSION_ALREADY_EXISTS = 'SESSION_1202',
  SESSION_INVALID_CONFIG = 'SESSION_1203',
  SESSION_CREATION_FAILED = 'SESSION_1204',
  SESSION_UPDATE_FAILED = 'SESSION_1205',
  SESSION_DELETE_FAILED = 'SESSION_1206',
  SESSION_CLIENT_LIMIT_EXCEEDED = 'SESSION_1207',
  
  // Admin Identity Errors (1300-1399)
  ADMIN_IDENTITY_NOT_FOUND = 'ADMIN_1301',
  ADMIN_IDENTITY_CREATION_FAILED = 'ADMIN_1302',
  ADMIN_USERNAME_TAKEN = 'ADMIN_1303',
  ADMIN_IDENTITY_CORRUPTED = 'ADMIN_1304',
  
  // System Errors (1400-1499)
  SYSTEM_INTERNAL_ERROR = 'SYSTEM_1401',
  SYSTEM_DATABASE_ERROR = 'SYSTEM_1402',
  SYSTEM_NETWORK_ERROR = 'SYSTEM_1403',
  SYSTEM_RATE_LIMITED = 'SYSTEM_1404',
  SYSTEM_MAINTENANCE_MODE = 'SYSTEM_1405',
  SYSTEM_CONNECTION_LIMIT_EXCEEDED = 'SYSTEM_1406',
  
  // Validation Errors (1500-1599)
  VALIDATION_INVALID_INPUT = 'VALIDATION_1501',
  VALIDATION_MISSING_REQUIRED_FIELD = 'VALIDATION_1502',
  VALIDATION_INVALID_SESSION_ID = 'VALIDATION_1503',
  VALIDATION_INVALID_LANGUAGE = 'VALIDATION_1504',
  VALIDATION_INVALID_CONFIG = 'VALIDATION_1505'
}

// Error Code to User Message Mapping
export const ERROR_MESSAGES: Record<AdminErrorCode, { message: string; userMessage: string; retryable: boolean; retryAfter?: number }> = {
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

// Local WebSocket Message Types (for local server communication)
export interface LocalSessionConfig {
  sessionId: string;
  enabledLanguages: TargetLanguage[];
  ttsMode: 'neural' | 'standard' | 'local' | 'disabled';
  audioQuality: 'high' | 'medium' | 'low';
}

export interface LocalStartSessionMessage {
  type: 'start-session';
  sessionId: string;
  config: LocalSessionConfig;
}

export interface LocalJoinSessionMessage {
  type: 'join-session';
  sessionId: string;
  preferredLanguage: TargetLanguage;
  audioCapabilities?: {
    supportsPolly: boolean;
    localTTSLanguages: TargetLanguage[];
    audioFormats: string[];
  };
}

export interface LocalLeaveSessionMessage {
  type: 'leave-session';
  sessionId: string;
}

export interface LocalLanguageChangeMessage {
  type: 'change-language';
  sessionId: string;
  newLanguage: TargetLanguage;
}

export interface LocalConfigUpdateMessage {
  type: 'config-update';
  sessionId: string;
  config: LocalSessionConfig;
}

export interface LocalTranslationBroadcast {
  type: 'translation';
  sessionId: string;
  text: string;
  language: TargetLanguage;
  timestamp: number;
  audioUrl?: string;
  useLocalTTS?: boolean;
}

export interface LocalSessionMetadataMessage {
  type: 'session-metadata';
  config: LocalSessionConfig;
  availableLanguages: TargetLanguage[];
  ttsAvailable: boolean;
  audioQuality: string;
}

export interface LocalErrorMessage {
  type: 'error';
  code: number;
  message: string;
  details?: any;
}

// Union types for all messages
export type ClientRequest = 
  | StartSessionRequest
  | AudioStreamRequest
  | EndSessionRequest
  | JoinSessionRequest
  | LeaveSessionRequest
  | SetLanguageRequest
  | AddTerminologyRequest;

export type ServerResponse = 
  | ConnectionResponse
  | StartSessionResponse
  | EndSessionResponse
  | AudioAckResponse
  | JoinSessionResponse
  | LeaveSessionResponse
  | SetLanguageResponse
  | TranslationMessage
  | StatusMessage
  | AddTerminologyResponse
  | ErrorResponse;

// Admin message unions
export type AdminRequest = 
  | AdminAuthMessage
  | StartSessionMessage
  | EndSessionMessage
  | ListSessionsMessage
  | UpdateSessionConfigMessage
  | AdminSessionAccessMessage
  | TokenRefreshMessage;

export type AdminResponse = 
  | AdminAuthResponse
  | StartSessionResponseMessage
  | EndSessionResponseMessage
  | ListSessionsResponse
  | UpdateSessionConfigResponse
  | SessionStatusUpdate
  | AdminReconnectionNotification
  | AdminSessionAccessResponse
  | AdminStatusUpdate
  | TokenRefreshResponse
  | TokenExpiryWarning
  | SessionExpiredNotification
  | AdminErrorMessage;

// Local WebSocket message unions
export type LocalClientMessage = 
  | LocalJoinSessionMessage
  | LocalLeaveSessionMessage
  | LocalLanguageChangeMessage;

export type LocalAdminMessage = 
  | LocalStartSessionMessage
  | LocalConfigUpdateMessage
  | LocalTranslationBroadcast
  | AdminAuthMessage
  | StartSessionMessage
  | EndSessionMessage
  | ListSessionsMessage
  | UpdateSessionConfigMessage
  | AdminSessionAccessMessage
  | TokenRefreshMessage;

export type LocalServerMessage = 
  | LocalSessionMetadataMessage
  | LocalTranslationBroadcast
  | LocalConfigUpdateMessage
  | LocalErrorMessage
  | AdminAuthResponse
  | StartSessionResponseMessage
  | EndSessionResponseMessage
  | ListSessionsResponse
  | UpdateSessionConfigResponse
  | SessionStatusUpdate
  | AdminReconnectionNotification
  | AdminSessionAccessResponse
  | AdminStatusUpdate
  | TokenRefreshResponse
  | TokenExpiryWarning
  | SessionExpiredNotification
  | AdminErrorMessage;

// Retry Strategy Interface
export interface RetryStrategy {
  maxAttempts: number;
  baseDelay: number;        // milliseconds
  maxDelay: number;         // milliseconds
  backoffMultiplier: number;
  retryableErrors: AdminErrorCode[];
}

export const DEFAULT_RETRY_STRATEGY: RetryStrategy = {
  maxAttempts: 3,
  baseDelay: 1000,          // 1 second
  maxDelay: 30000,          // 30 seconds
  backoffMultiplier: 2,
  retryableErrors: [
    AdminErrorCode.SYSTEM_INTERNAL_ERROR,
    AdminErrorCode.SYSTEM_NETWORK_ERROR,
    AdminErrorCode.AUTH_TOKEN_EXPIRED,
    AdminErrorCode.SESSION_CREATION_FAILED,
    AdminErrorCode.SESSION_UPDATE_FAILED
  ]
};
