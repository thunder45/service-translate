export type ConnectionType = 'admin' | 'client';
export type SourceLanguage = 'pt';
export type TargetLanguage = 'en' | 'fr' | 'es' | 'de' | 'it';
export type AudioEncoding = 'pcm' | 'opus' | 'flac';
export type SessionStatus = 'started' | 'active' | 'paused' | 'ending' | 'ended' | 'error';
export type MessageType = 'connection' | 'session' | 'session_membership' | 'audio_ack' | 'translation' | 'language' | 'terminology' | 'status' | 'warning' | 'error';
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
export type ClientRequest = StartSessionRequest | AudioStreamRequest | EndSessionRequest | JoinSessionRequest | LeaveSessionRequest | SetLanguageRequest | AddTerminologyRequest;
export type ServerResponse = ConnectionResponse | StartSessionResponse | EndSessionResponse | AudioAckResponse | JoinSessionResponse | LeaveSessionResponse | SetLanguageResponse | TranslationMessage | StatusMessage | AddTerminologyResponse | ErrorResponse;
//# sourceMappingURL=types.d.ts.map