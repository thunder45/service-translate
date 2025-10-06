import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { SessionData, SessionConfig, ClientData, AudioCapabilities, TargetLanguage } from './types';

export class SessionManager {
  private sessions: Map<string, SessionData> = new Map();
  private persistenceDir: string;

  constructor(persistenceDir: string = './sessions') {
    this.persistenceDir = persistenceDir;
    this.ensurePersistenceDir();
    this.loadPersistedSessions();
  }

  /**
   * Generate a human-readable session ID
   * Format: CHURCH-YYYY-NNN (e.g., "CHURCH-2025-001")
   */
  generateSessionId(): string {
    const year = new Date().getFullYear();
    const existingSessions = Array.from(this.sessions.keys())
      .filter(id => id.startsWith(`CHURCH-${year}-`))
      .map(id => parseInt(id.split('-')[2]) || 0)
      .sort((a, b) => b - a);
    
    const nextNumber = (existingSessions[0] || 0) + 1;
    return `CHURCH-${year}-${nextNumber.toString().padStart(3, '0')}`;
  }

  /**
   * Create a new session
   */
  createSession(sessionId: string, config: SessionConfig, adminSocketId: string): SessionData {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }

    const sessionData: SessionData = {
      sessionId,
      adminSocketId,
      config,
      clients: new Map(),
      createdAt: new Date(),
      lastActivity: new Date(),
      status: 'started'
    };

    this.sessions.set(sessionId, sessionData);
    this.persistSession(sessionData);
    
    console.log(`Created session: ${sessionId}`);
    return sessionData;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): SessionData | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): SessionData[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Update session configuration
   */
  updateSessionConfig(sessionId: string, config: SessionConfig): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const oldConfig = { ...session.config };
    session.config = config;
    session.lastActivity = new Date();
    this.persistSession(session);
    
    console.log(`Updated config for session: ${sessionId}`);
    
    // Log specific TTS configuration changes
    if (oldConfig.ttsMode !== config.ttsMode) {
      console.log(`TTS mode changed from ${oldConfig.ttsMode} to ${config.ttsMode} in session: ${sessionId}`);
    }
    
    if (JSON.stringify(oldConfig.enabledLanguages) !== JSON.stringify(config.enabledLanguages)) {
      console.log(`Enabled languages changed from [${oldConfig.enabledLanguages.join(', ')}] to [${config.enabledLanguages.join(', ')}] in session: ${sessionId}`);
    }
    
    return true;
  }

  /**
   * Update TTS mode for a session
   */
  updateTTSMode(sessionId: string, ttsMode: 'neural' | 'standard' | 'local' | 'disabled'): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const oldMode = session.config.ttsMode;
    session.config.ttsMode = ttsMode;
    session.lastActivity = new Date();
    this.persistSession(session);
    
    console.log(`TTS mode updated from ${oldMode} to ${ttsMode} for session: ${sessionId}`);
    return true;
  }

  /**
   * Update enabled languages for a session
   */
  updateEnabledLanguages(sessionId: string, enabledLanguages: TargetLanguage[]): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const oldLanguages = [...session.config.enabledLanguages];
    session.config.enabledLanguages = enabledLanguages;
    session.lastActivity = new Date();
    this.persistSession(session);
    
    console.log(`Enabled languages updated from [${oldLanguages.join(', ')}] to [${enabledLanguages.join(', ')}] for session: ${sessionId}`);
    return true;
  }

  /**
   * Update audio quality for a session
   */
  updateAudioQuality(sessionId: string, audioQuality: 'high' | 'medium' | 'low'): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const oldQuality = session.config.audioQuality;
    session.config.audioQuality = audioQuality;
    session.lastActivity = new Date();
    this.persistSession(session);
    
    console.log(`Audio quality updated from ${oldQuality} to ${audioQuality} for session: ${sessionId}`);
    return true;
  }

  /**
   * Add client to session
   */
  addClient(sessionId: string, socketId: string, preferredLanguage: TargetLanguage, audioCapabilities?: AudioCapabilities): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const clientData: ClientData = {
      socketId,
      preferredLanguage,
      joinedAt: new Date(),
      lastSeen: new Date(),
      audioCapabilities: audioCapabilities || {
        supportsPolly: false,
        localTTSLanguages: [],
        audioFormats: []
      }
    };

    session.clients.set(socketId, clientData);
    session.lastActivity = new Date();
    this.persistSession(session);
    
    console.log(`Client ${socketId} joined session: ${sessionId}`);
    return true;
  }

  /**
   * Remove client from session
   */
  removeClient(sessionId: string, socketId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const removed = session.clients.delete(socketId);
    if (removed) {
      session.lastActivity = new Date();
      this.persistSession(session);
      console.log(`Client ${socketId} left session: ${sessionId}`);
    }
    
    return removed;
  }

  /**
   * Update client's preferred language
   */
  updateClientLanguage(sessionId: string, socketId: string, newLanguage: TargetLanguage): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const client = session.clients.get(socketId);
    if (!client) {
      return false;
    }

    client.preferredLanguage = newLanguage;
    client.lastSeen = new Date();
    session.lastActivity = new Date();
    this.persistSession(session);
    
    console.log(`Client ${socketId} changed language to ${newLanguage} in session: ${sessionId}`);
    return true;
  }

  /**
   * Get clients by language for targeted broadcasting
   */
  getClientsByLanguage(sessionId: string, language: TargetLanguage): string[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    return Array.from(session.clients.values())
      .filter(client => client.preferredLanguage === language)
      .map(client => client.socketId);
  }

  /**
   * Get all clients in a session
   */
  getSessionClients(sessionId: string): ClientData[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    return Array.from(session.clients.values());
  }

  /**
   * Get session metadata for clients
   */
  getSessionMetadata(sessionId: string): {
    config: SessionConfig;
    availableLanguages: TargetLanguage[];
    ttsAvailable: boolean;
    audioQuality: string;
    clientCount: number;
    ttsCapabilities: {
      supportsPolly: boolean;
      supportsLocal: boolean;
      supportedLanguages: TargetLanguage[];
    };
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const clients = Array.from(session.clients.values());
    
    // Aggregate client TTS capabilities
    const ttsCapabilities = {
      supportsPolly: clients.some(c => c.audioCapabilities.supportsPolly),
      supportsLocal: clients.some(c => c.audioCapabilities.localTTSLanguages.length > 0),
      supportedLanguages: Array.from(new Set(
        clients.flatMap(c => c.audioCapabilities.localTTSLanguages)
      )) as TargetLanguage[]
    };

    return {
      config: session.config,
      availableLanguages: session.config.enabledLanguages,
      ttsAvailable: session.config.ttsMode !== 'disabled',
      audioQuality: session.config.audioQuality,
      clientCount: clients.length,
      ttsCapabilities
    };
  }

  /**
   * Get clients that need to be notified of language changes
   */
  getClientsAffectedByLanguageChange(sessionId: string, removedLanguages: TargetLanguage[]): ClientData[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    return Array.from(session.clients.values())
      .filter(client => removedLanguages.includes(client.preferredLanguage));
  }

  /**
   * Update client audio capabilities
   */
  updateClientAudioCapabilities(sessionId: string, socketId: string, audioCapabilities: AudioCapabilities): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const client = session.clients.get(socketId);
    if (!client) {
      return false;
    }

    client.audioCapabilities = audioCapabilities;
    client.lastSeen = new Date();
    session.lastActivity = new Date();
    this.persistSession(session);
    
    console.log(`Updated audio capabilities for client ${socketId} in session: ${sessionId}`);
    return true;
  }

  /**
   * Update admin socket ID for session
   */
  updateAdminSocket(sessionId: string, adminSocketId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.adminSocketId = adminSocketId;
    session.lastActivity = new Date();
    this.persistSession(session);
    
    console.log(`Updated admin socket for session: ${sessionId}`);
    return true;
  }

  /**
   * End a session
   */
  endSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.status = 'ended';
    session.lastActivity = new Date();
    this.persistSession(session);
    
    // Clean up after 1 hour
    setTimeout(() => {
      this.sessions.delete(sessionId);
      this.deletePersistedSession(sessionId);
    }, 60 * 60 * 1000);
    
    console.log(`Ended session: ${sessionId}`);
    return true;
  }

  /**
   * Clean up inactive sessions (older than 24 hours)
   */
  cleanupInactiveSessions(): void {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.lastActivity < cutoffTime) {
        this.sessions.delete(sessionId);
        this.deletePersistedSession(sessionId);
        console.log(`Cleaned up inactive session: ${sessionId}`);
      }
    }
  }

  // Private methods for persistence

  private ensurePersistenceDir(): void {
    if (!existsSync(this.persistenceDir)) {
      mkdirSync(this.persistenceDir, { recursive: true });
    }
  }

  private getSessionFilePath(sessionId: string): string {
    return join(this.persistenceDir, `${sessionId}.json`);
  }

  private persistSession(session: SessionData): void {
    try {
      const filePath = this.getSessionFilePath(session.sessionId);
      const serializable = {
        ...session,
        clients: Array.from(session.clients.entries())
      };
      writeFileSync(filePath, JSON.stringify(serializable, null, 2));
    } catch (error) {
      console.error(`Failed to persist session ${session.sessionId}:`, error);
    }
  }

  private loadPersistedSessions(): void {
    try {
      const files = require('fs').readdirSync(this.persistenceDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = join(this.persistenceDir, file);
            const data = JSON.parse(readFileSync(filePath, 'utf8'));
            
            // Reconstruct the session with Map for clients
            const session: SessionData = {
              ...data,
              createdAt: new Date(data.createdAt),
              lastActivity: new Date(data.lastActivity),
              clients: new Map(data.clients.map(([id, client]: [string, any]) => [
                id,
                {
                  ...client,
                  joinedAt: new Date(client.joinedAt),
                  lastSeen: new Date(client.lastSeen)
                }
              ]))
            };
            
            this.sessions.set(session.sessionId, session);
            console.log(`Loaded persisted session: ${session.sessionId}`);
          } catch (error) {
            console.error(`Failed to load session from ${file}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load persisted sessions:', error);
    }
  }

  private deletePersistedSession(sessionId: string): void {
    try {
      const filePath = this.getSessionFilePath(sessionId);
      if (existsSync(filePath)) {
        require('fs').unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`Failed to delete persisted session ${sessionId}:`, error);
    }
  }
}