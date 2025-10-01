// Shared TypeScript types for Service Translate
// Based on API_SPECIFICATION-2025-10-01-FINAL.md

export type ConnectionType = 'admin' | 'client';
export type SourceLanguage = 'pt';
export type TargetLanguage = 'en' | 'fr' | 'es' | 'de' | 'it';
export type AudioEncoding = 'pcm' | 'opus' | 'flac';
export type SessionStatus = 'started' | 'active' | 'paused' | 'ending' | 'ended' | 'error';
export type MessageType = 'connection' | 'session' | 'session_membership' | 'audio_ack' | 
  'translation' | 'language' | 'terminology' | 'status' | 'warning' | 'error';

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
