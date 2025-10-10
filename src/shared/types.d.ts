export type ConnectionType = 'admin' | 'client';
export type SourceLanguage = 'pt' | 'en' | 'es' | 'fr' | 'de' | 'it';
export type TargetLanguage = 'en' | 'fr' | 'es' | 'de' | 'it' | 'pt';
export type AudioEncoding = 'pcm' | 'opus' | 'flac';
export type SessionStatus = 'started' | 'active' | 'paused' | 'ending' | 'ended' | 'error';
export type MessageType = 'connection' | 'session' | 'session_membership' | 'audio_ack' | 'translation' | 'language' | 'terminology' | 'status' | 'warning' | 'error' | 'admin-auth' | 'admin-auth-response' | 'start-session-response' | 'end-session-response' | 'list-sessions' | 'list-sessions-response' | 'update-session-config' | 'update-session-config-response' | 'session-status-update' | 'admin-reconnection' | 'admin-session-access' | 'admin-session-access-response' | 'admin-error' | 'admin-status-update' | 'token-refresh' | 'token-refresh-response' | 'token-expiry-warning' | 'session-expired';
export interface AdminIdentity {
    adminId: string;
    username: string;
    createdAt: Date;
    lastSeen: Date;
    activeSockets: Set<string>;
    ownedSessions: Set<string>;
    tokenVersion: number;
    refreshTokens: Set<string>;
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
export interface SessionData {
    sessionId: string;
    adminId: string;
    currentAdminSocketId: string | null;
    createdBy: string;
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
export interface ConnectQueryParams {
    connectionType: ConnectionType;
    deviceId: string;
    Authorization?: string;
}
export interface ConnectionResponse {
    type: 'connection';
    connectionId: string;
    status: 'connected';
    timestamp: string;
}
export interface AudioConfig {
    sampleRate: 8000 | 16000 | 22050 | 44100 | 48000;
    encoding: AudioEncoding;
    channels: 1 | 2;
}
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
export interface AudioStreamRequest {
    action: 'audiostream';
    sessionId: string;
    timestamp: string;
    sequenceNumber: number;
    audioData: string;
    isLastChunk?: boolean;
}
export interface AudioAckResponse {
    type: 'audio_ack';
    status: 'received';
    sequenceNumber: number;
    timestamp: string;
}
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
export interface StatusMessage {
    type: 'status';
    sessionId: string;
    status: SessionStatus;
    message?: string;
    timestamp: string;
}
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
export interface ErrorResponse {
    type: 'error';
    code: number;
    message: string;
    details?: Record<string, any>;
    timestamp: string;
}
export interface AdminAuthMessage {
    type: 'admin-auth';
    method: 'credentials' | 'token';
    username?: string;
    password?: string;
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
    token?: string;
    tokenExpiry?: string;
    refreshToken?: string;
    ownedSessions?: SessionSummary[];
    allSessions?: SessionSummary[];
    permissions?: AdminPermissions;
    error?: string;
    timestamp: string;
}
export interface StartSessionMessage {
    type: 'start-session';
    sessionId: string;
    config: SessionConfig;
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
    timeRemaining: number;
    timestamp: string;
}
export interface SessionExpiredNotification {
    type: 'session-expired';
    adminId: string;
    reason: 'token-expired' | 'invalid-token' | 'revoked';
    timestamp: string;
}
export interface AdminErrorMessage {
    type: 'admin-error';
    errorCode: AdminErrorCode;
    message: string;
    userMessage: string;
    retryable: boolean;
    retryAfter?: number;
    details?: {
        sessionId?: string;
        operation?: string;
        adminId?: string;
        validationErrors?: string[];
    };
    timestamp: string;
}
export declare enum AdminErrorCode {
    AUTH_INVALID_CREDENTIALS = "AUTH_1001",
    AUTH_TOKEN_EXPIRED = "AUTH_1002",
    AUTH_TOKEN_INVALID = "AUTH_1003",
    AUTH_REFRESH_TOKEN_EXPIRED = "AUTH_1004",
    AUTH_REFRESH_TOKEN_INVALID = "AUTH_1005",
    AUTH_SESSION_NOT_FOUND = "AUTH_1006",
    AUTH_RATE_LIMITED = "AUTH_1007",
    AUTH_ACCOUNT_LOCKED = "AUTH_1008",
    COGNITO_USER_NOT_FOUND = "COGNITO_1010",
    COGNITO_USER_DISABLED = "COGNITO_1011",
    COGNITO_UNAVAILABLE = "COGNITO_1012",
    COGNITO_INSUFFICIENT_PERMISSIONS = "COGNITO_1013",
    AUTHZ_ACCESS_DENIED = "AUTHZ_1101",
    AUTHZ_SESSION_NOT_OWNED = "AUTHZ_1102",
    AUTHZ_INSUFFICIENT_PERMISSIONS = "AUTHZ_1103",
    AUTHZ_OPERATION_NOT_ALLOWED = "AUTHZ_1104",
    SESSION_NOT_FOUND = "SESSION_1201",
    SESSION_ALREADY_EXISTS = "SESSION_1202",
    SESSION_INVALID_CONFIG = "SESSION_1203",
    SESSION_CREATION_FAILED = "SESSION_1204",
    SESSION_UPDATE_FAILED = "SESSION_1205",
    SESSION_DELETE_FAILED = "SESSION_1206",
    SESSION_CLIENT_LIMIT_EXCEEDED = "SESSION_1207",
    ADMIN_IDENTITY_NOT_FOUND = "ADMIN_1301",
    ADMIN_IDENTITY_CREATION_FAILED = "ADMIN_1302",
    ADMIN_USERNAME_TAKEN = "ADMIN_1303",
    ADMIN_IDENTITY_CORRUPTED = "ADMIN_1304",
    SYSTEM_INTERNAL_ERROR = "SYSTEM_1401",
    SYSTEM_DATABASE_ERROR = "SYSTEM_1402",
    SYSTEM_NETWORK_ERROR = "SYSTEM_1403",
    SYSTEM_RATE_LIMITED = "SYSTEM_1404",
    SYSTEM_MAINTENANCE_MODE = "SYSTEM_1405",
    SYSTEM_CONNECTION_LIMIT_EXCEEDED = "SYSTEM_1406",
    VALIDATION_INVALID_INPUT = "VALIDATION_1501",
    VALIDATION_MISSING_REQUIRED_FIELD = "VALIDATION_1502",
    VALIDATION_INVALID_SESSION_ID = "VALIDATION_1503",
    VALIDATION_INVALID_LANGUAGE = "VALIDATION_1504",
    VALIDATION_INVALID_CONFIG = "VALIDATION_1505"
}
export declare const ERROR_MESSAGES: Record<AdminErrorCode, {
    message: string;
    userMessage: string;
    retryable: boolean;
    retryAfter?: number;
}>;
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
export type ClientRequest = StartSessionRequest | AudioStreamRequest | EndSessionRequest | JoinSessionRequest | LeaveSessionRequest | SetLanguageRequest | AddTerminologyRequest;
export type ServerResponse = ConnectionResponse | StartSessionResponse | EndSessionResponse | AudioAckResponse | JoinSessionResponse | LeaveSessionResponse | SetLanguageResponse | TranslationMessage | StatusMessage | AddTerminologyResponse | ErrorResponse;
export type AdminRequest = AdminAuthMessage | StartSessionMessage | EndSessionMessage | ListSessionsMessage | UpdateSessionConfigMessage | AdminSessionAccessMessage | TokenRefreshMessage;
export type AdminResponse = AdminAuthResponse | StartSessionResponseMessage | EndSessionResponseMessage | ListSessionsResponse | UpdateSessionConfigResponse | SessionStatusUpdate | AdminReconnectionNotification | AdminSessionAccessResponse | AdminStatusUpdate | TokenRefreshResponse | TokenExpiryWarning | SessionExpiredNotification | AdminErrorMessage;
export type LocalClientMessage = LocalJoinSessionMessage | LocalLeaveSessionMessage | LocalLanguageChangeMessage;
export type LocalAdminMessage = LocalStartSessionMessage | LocalConfigUpdateMessage | LocalTranslationBroadcast | AdminAuthMessage | StartSessionMessage | EndSessionMessage | ListSessionsMessage | UpdateSessionConfigMessage | AdminSessionAccessMessage | TokenRefreshMessage;
export type LocalServerMessage = LocalSessionMetadataMessage | LocalTranslationBroadcast | LocalConfigUpdateMessage | LocalErrorMessage | AdminAuthResponse | StartSessionResponseMessage | EndSessionResponseMessage | ListSessionsResponse | UpdateSessionConfigResponse | SessionStatusUpdate | AdminReconnectionNotification | AdminSessionAccessResponse | AdminStatusUpdate | TokenRefreshResponse | TokenExpiryWarning | SessionExpiredNotification | AdminErrorMessage;
export interface RetryStrategy {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
    retryableErrors: AdminErrorCode[];
}
export declare const DEFAULT_RETRY_STRATEGY: RetryStrategy;
//# sourceMappingURL=types.d.ts.map