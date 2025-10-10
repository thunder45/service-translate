import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { SessionData, SessionConfig, ClientData, AudioCapabilities, TargetLanguage } from '../../shared/types';

export class SessionManager {
  private sessions: Map<string, SessionData> = new Map();
  private persistenceDir: string;

  constructor(persistenceDir: string = './sessions') {
    this.persistenceDir = persistenceDir;
    this.ensurePersistenceDir();
    this.migrateOldSessionFiles(); // Migrate old format before loading
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
   * Create a new session with admin identity
   */
  createSession(sessionId: string, config: SessionConfig, adminId: string, adminSocketId: string, createdBy: string): SessionData {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }

    const sessionData: SessionData = {
      sessionId,
      adminId,
      currentAdminSocketId: adminSocketId,
      createdBy,
      config,
      clients: new Map(),
      createdAt: new Date(),
      lastActivity: new Date(),
      status: 'started'
    };

    this.sessions.set(sessionId, sessionData);
    this.persistSession(sessionData);
    
    console.log(`Created session: ${sessionId} by admin: ${createdBy} (${adminId})`);
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
  addClient(sessionId: string, clientId: string, socketId: string, preferredLanguage: TargetLanguage, audioCapabilities?: AudioCapabilities): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const clientData: ClientData = {
      clientId,
      socketId,
      preferredLanguage,
      connectedAt: new Date(),
      lastActivity: new Date(),
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
      supportsPolly: clients.some(c => c.audioCapabilities?.supportsPolly),
      supportsLocal: clients.some(c => (c.audioCapabilities?.localTTSLanguages.length || 0) > 0),
      supportedLanguages: Array.from(new Set(
        clients.flatMap(c => c.audioCapabilities?.localTTSLanguages || [])
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
   * Update current admin socket ID for session (for reconnection)
   */
  updateCurrentAdminSocket(sessionId: string, adminSocketId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.currentAdminSocketId = adminSocketId;
    session.lastActivity = new Date();
    this.persistSession(session);
    
    console.log(`Updated current admin socket for session: ${sessionId}`);
    return true;
  }

  /**
   * Verify admin access to a session
   * @param sessionId - The session to check access for
   * @param adminId - The admin requesting access
   * @param operation - The type of operation ('read' or 'write')
   * @returns true if access is granted, false otherwise
   */
  verifyAdminAccess(sessionId: string, adminId: string, operation: 'read' | 'write'): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Read access: all admins can view all sessions
    if (operation === 'read') {
      return true;
    }

    // Write access: only the session owner can modify
    if (operation === 'write') {
      return session.adminId === adminId;
    }

    return false;
  }

  /**
   * Get all sessions owned by a specific admin
   * @param adminId - The admin ID to filter by
   * @returns Array of sessions owned by the admin
   */
  getSessionsByAdmin(adminId: string): SessionData[] {
    return Array.from(this.sessions.values())
      .filter(session => session.adminId === adminId);
  }

  /**
   * Get session ownership information
   * @param sessionId - The session to check
   * @returns Object with ownership details or null if session not found
   */
  getSessionOwnership(sessionId: string): { adminId: string; createdBy: string; currentAdminSocketId: string | null } | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      adminId: session.adminId,
      createdBy: session.createdBy,
      currentAdminSocketId: session.currentAdminSocketId
    };
  }

  /**
   * End a session
   * Immediately deletes the session from memory and disk
   */
  endSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Delete immediately
    this.sessions.delete(sessionId);
    this.deletePersistedSession(sessionId);
    
    console.log(`Ended and deleted session: ${sessionId}`);
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

  /**
   * Migrate old session files to new format
   * Converts adminSocketId to adminId and currentAdminSocketId
   */
  migrateOldSessionFiles(): void {
    try {
      const files = readdirSync(this.persistenceDir);
      let migratedCount = 0;
      let errorCount = 0;

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = join(this.persistenceDir, file);
            const data = JSON.parse(readFileSync(filePath, 'utf8'));
            
            // Check if this is an old format session (has adminSocketId but not adminId)
            if (data.adminSocketId && !data.adminId) {
              console.log(`Migrating old session file: ${file}`);
              
              // Create a system admin identity for orphaned sessions
              data.adminId = 'system';
              data.currentAdminSocketId = null; // No current connection
              data.createdBy = 'system';
              
              // Remove old field
              delete data.adminSocketId;
              
              // Write back the migrated data
              writeFileSync(filePath, JSON.stringify(data, null, 2));
              migratedCount++;
              console.log(`Migrated session: ${data.sessionId}`);
            }
          } catch (error) {
            console.error(`Failed to migrate session from ${file}:`, error);
            errorCount++;
          }
        }
      }

      if (migratedCount > 0) {
        console.log(`Migration complete: ${migratedCount} sessions migrated, ${errorCount} errors`);
      }
    } catch (error) {
      console.error('Failed to migrate old session files:', error);
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
      const files = readdirSync(this.persistenceDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = join(this.persistenceDir, file);
            const data = JSON.parse(readFileSync(filePath, 'utf8'));
            
            // Skip if this is still old format (shouldn't happen after migration)
            if (data.adminSocketId && !data.adminId) {
              console.warn(`Skipping old format session: ${file}`);
              continue;
            }
            
            // Reconstruct the session with Map for clients
            const session: SessionData = {
              sessionId: data.sessionId,
              adminId: data.adminId,
              currentAdminSocketId: data.currentAdminSocketId || null,
              createdBy: data.createdBy || 'unknown',
              config: data.config,
              createdAt: new Date(data.createdAt),
              lastActivity: new Date(data.lastActivity),
              status: data.status,
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
            console.log(`Loaded persisted session: ${session.sessionId} (admin: ${session.createdBy})`);
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
        unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`Failed to delete persisted session ${sessionId}:`, error);
    }
  }
}
