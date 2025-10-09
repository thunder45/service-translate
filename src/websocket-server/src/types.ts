// Local WebSocket Server Types
// Extends shared types for local session management

import { SessionConfig, TargetLanguage } from '../../shared/types';

// Re-export needed types from shared
export { TargetLanguage };
export type SessionStatus = 'started' | 'active' | 'paused' | 'ending' | 'ended' | 'error';

export interface SessionRuntimeConfig {
  sessionId: string;
  enabledLanguages: TargetLanguage[];
  ttsMode: 'neural' | 'standard' | 'local' | 'disabled';
  audioQuality: 'high' | 'medium' | 'low';
  audioCaching: boolean;
  maxConcurrentAudio: number;
}

export interface ClientData {
  socketId: string;
  preferredLanguage: TargetLanguage;
  joinedAt: Date;
  lastSeen: Date;
  audioCapabilities: AudioCapabilities;
}

export interface AudioCapabilities {
  supportsPolly: boolean;
  localTTSLanguages: TargetLanguage[];
  audioFormats: string[];
}

export interface SessionData {
  sessionId: string;
  adminId: string;                    // Persistent admin owner
  currentAdminSocketId: string | null; // Current admin connection
  createdBy: string;                  // Username for display
  config: SessionConfig;
  clients: Map<string, ClientData>;
  createdAt: Date;
  lastActivity: Date;
  status: SessionStatus;
}

// WebSocket Message Types for Local Server
export interface StartSessionMessage {
  type: 'start-session';
  sessionId: string;
  config: SessionConfig;
}

export interface JoinSessionMessage {
  type: 'join-session';
  sessionId: string;
  preferredLanguage: TargetLanguage;
  audioCapabilities?: AudioCapabilities;
}

export interface LeaveSessionMessage {
  type: 'leave-session';
  sessionId: string;
}

export interface LanguageChangeMessage {
  type: 'change-language';
  sessionId: string;
  newLanguage: TargetLanguage;
}

export interface ConfigUpdateMessage {
  type: 'config-update';
  sessionId: string;
  config: SessionConfig;
}

export interface TTSConfigUpdateMessage {
  type: 'tts-config-update';
  sessionId: string;
  ttsMode: 'neural' | 'standard' | 'local' | 'disabled';
  audioQuality?: 'high' | 'medium' | 'low';
}

export interface LanguageUpdateMessage {
  type: 'language-update';
  sessionId: string;
  enabledLanguages: TargetLanguage[];
  removedLanguages?: TargetLanguage[];
}

export interface SessionMetadataUpdateMessage {
  type: 'session-metadata-update';
  sessionId: string;
  metadata: {
    config: SessionConfig;
    availableLanguages: TargetLanguage[];
    ttsAvailable: boolean;
    audioQuality: string;
    clientCount: number;
  };
}

export interface AudioMetadata {
  audioId: string;
  url: string;
  duration?: number;
  format: string;
  voiceType: 'neural' | 'standard' | 'local';
  size: number;
}

export interface TranslationBroadcast {
  type: 'translation';
  sessionId: string;
  text: string;
  language: TargetLanguage;
  timestamp: number;
  audioUrl?: string;
  audioMetadata?: AudioMetadata;
  useLocalTTS?: boolean;
}

export interface GenerateTTSMessage {
  type: 'generate-tts';
  sessionId: string;
  text: string;
  language: TargetLanguage;
  voiceType?: 'neural' | 'standard';
}

export interface SessionMetadataMessage {
  type: 'session-metadata';
  config: SessionConfig;
  availableLanguages: TargetLanguage[];
  ttsAvailable: boolean;
  audioQuality: string;
}

export interface ErrorMessage {
  type: 'error';
  code: number;
  message: string;
  details?: any;
}

// Union types for local WebSocket messages
export type ClientMessage = 
  | JoinSessionMessage
  | LeaveSessionMessage
  | LanguageChangeMessage;

export type AdminMessage = 
  | StartSessionMessage
  | ConfigUpdateMessage
  | TTSConfigUpdateMessage
  | LanguageUpdateMessage
  | TranslationBroadcast
  | GenerateTTSMessage;

export type ServerMessage = 
  | SessionMetadataMessage
  | SessionMetadataUpdateMessage
  | TranslationBroadcast
  | ConfigUpdateMessage
  | TTSConfigUpdateMessage
  | LanguageUpdateMessage
  | ErrorMessage;