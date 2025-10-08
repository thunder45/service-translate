import { Socket, Server as SocketIOServer } from 'socket.io';
import { SessionManager } from './session-manager';
import { MessageValidator } from './message-validator';
import { AudioManager } from './audio-manager';
import { TTSService } from './tts-service';
import { TTSFallbackManager } from './tts-fallback-manager';
import { 
  ErrorMessage,
  SessionMetadataMessage,
  TargetLanguage,
  TranslationBroadcast,
  AudioMetadata
} from './types';

export class MessageRouter {
  private ttsService: TTSService;
  private ttsFallbackManager: TTSFallbackManager;

  constructor(
    private io: SocketIOServer,
    private sessionManager: SessionManager,
    private audioManager?: AudioManager,
    private errorLogger?: any
  ) {
    this.ttsService = new TTSService();
    this.ttsFallbackManager = new TTSFallbackManager(this.ttsService);

    // Forward fallback notifications to clients
    this.ttsFallbackManager.on('fallback-notification', (notification) => {
      this.broadcastFallbackNotification(notification);
    });
  }

  /**
   * Route incoming message to appropriate handler
   */
  routeMessage(socket: Socket, messageType: string, data: any): void {
    console.log(`Routing message: ${messageType} from ${socket.id}`);

    try {
      switch (messageType) {
        case 'start-session':
          this.handleStartSession(socket, data);
          break;
        case 'end-session':
          this.handleEndSession(socket, data);
          break;
        case 'list-sessions':
          this.handleListSessions(socket);
          break;
        case 'join-session':
          this.handleJoinSession(socket, data);
          break;
        case 'leave-session':
          this.handleLeaveSession(socket, data);
          break;
        case 'change-language':
          this.handleLanguageChange(socket, data);
          break;
        case 'config-update':
          this.handleConfigUpdate(socket, data);
          break;
        case 'broadcast-translation':
          this.handleTranslationBroadcast(socket, data);
          break;
        case 'tts-config-update':
          this.handleTTSConfigUpdate(socket, data);
          break;
        case 'language-update':
          this.handleLanguageUpdate(socket, data);
          break;
        case 'generate-tts':
          this.handleGenerateTTS(socket, data);
          break;
        default:
          this.sendError(socket, 400, `Unknown message type: ${messageType}`);
      }
    } catch (error) {
      console.error(`Error routing message ${messageType}:`, error);
      this.sendError(socket, 500, 'Internal server error');
    }
  }

  /**
   * Handle session creation (admin only)
   */
  private handleStartSession(socket: Socket, data: any): void {
    const validation = MessageValidator.validateStartSession(data);
    if (!validation.valid || !validation.message) {
      this.sendError(socket, 400, validation.error || 'Invalid start session message');
      return;
    }

    const { sessionId, config } = validation.message;

    try {
      const sessionData = this.sessionManager.createSession(sessionId, config, socket.id);
      
      socket.join(sessionId);
      socket.emit('session-started', {
        type: 'session-started',
        sessionId,
        config,
        timestamp: new Date().toISOString()
      });
      
      console.log(`Session started: ${sessionId} by admin ${socket.id}`);
    } catch (error) {
      this.sendError(socket, 400, error instanceof Error ? error.message : 'Failed to start session', { sessionId });
    }
  }

  /**
   * Handle session end (admin only)
   */
  private handleEndSession(socket: Socket, data: any): void {
    const { sessionId } = data;
    
    if (!sessionId) {
      this.sendError(socket, 400, 'sessionId is required');
      return;
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      this.sendError(socket, 404, 'Session not found', { sessionId });
      return;
    }

    // Verify admin
    if (session.adminSocketId !== socket.id) {
      this.sendError(socket, 403, 'Only session admin can end the session', { sessionId });
      return;
    }

    const success = this.sessionManager.endSession(sessionId);
    
    if (success) {
      // Notify all clients
      this.io.to(sessionId).emit('session-ended', {
        type: 'session-ended',
        sessionId,
        timestamp: new Date().toISOString()
      });
      
      // Disconnect all clients from room
      this.io.in(sessionId).socketsLeave(sessionId);
      
      socket.emit('session-ended', {
        type: 'session-ended',
        sessionId,
        timestamp: new Date().toISOString()
      });
      
      console.log(`Session ended: ${sessionId} by admin ${socket.id}`);
    } else {
      this.sendError(socket, 500, 'Failed to end session', { sessionId });
    }
  }

  /**
   * Handle list sessions request
   */
  private handleListSessions(socket: Socket): void {
    const sessions = this.sessionManager.getAllSessions();
    
    const sessionsList = sessions.map(session => ({
      sessionId: session.sessionId,
      status: session.status,
      clientCount: session.clients.size,
      createdAt: session.createdAt.toISOString(),
      lastActivity: session.lastActivity.toISOString(),
      isAdmin: session.adminSocketId === socket.id,
      config: {
        enabledLanguages: session.config.enabledLanguages,
        ttsMode: session.config.ttsMode,
        audioQuality: session.config.audioQuality
      }
    }));
    
    socket.emit('sessions-list', {
      type: 'sessions-list',
      sessions: sessionsList,
      timestamp: new Date().toISOString()
    });
    
    console.log(`Listed ${sessionsList.length} sessions for ${socket.id}`);
  }

  /**
   * Handle client joining session
   */
  private handleJoinSession(socket: Socket, data: any): void {
    console.log('DEBUG: handleJoinSession called with data:', JSON.stringify(data, null, 2));
    
    const validation = MessageValidator.validateJoinSession(data);
    console.log('DEBUG: validation result:', validation);
    
    if (!validation.valid || !validation.message) {
      console.log('DEBUG: Validation failed, sending error');
      this.sendError(socket, 400, validation.error || 'Invalid join session message');
      return;
    }

    const { sessionId, preferredLanguage, audioCapabilities } = validation.message;

    const success = this.sessionManager.addClient(
      sessionId,
      socket.id,
      preferredLanguage,
      audioCapabilities
    );
    
    if (success) {
      const session = this.sessionManager.getSession(sessionId);
      if (session) {
        socket.join(sessionId);
        
        const metadata: SessionMetadataMessage = {
          type: 'session-metadata',
          config: session.config,
          availableLanguages: session.config.enabledLanguages,
          ttsAvailable: session.config.ttsMode !== 'disabled',
          audioQuality: session.config.audioQuality
        };
        
        socket.emit('session-joined', metadata);
        console.log(`Client ${socket.id} joined session: ${sessionId}`);
      }
    } else {
      this.sendError(socket, 404, 'Session not found or join failed', { sessionId });
    }
  }

  /**
   * Handle client leaving session
   */
  private handleLeaveSession(socket: Socket, data: any): void {
    const validation = MessageValidator.validateLeaveSession(data);
    if (!validation.valid || !validation.message) {
      this.sendError(socket, 400, validation.error || 'Invalid leave session message');
      return;
    }

    const { sessionId } = validation.message;
    const success = this.sessionManager.removeClient(sessionId, socket.id);
    
    if (success) {
      socket.leave(sessionId);
      socket.emit('session-left', {
        type: 'session-left',
        sessionId,
        timestamp: new Date().toISOString()
      });
      console.log(`Client ${socket.id} left session: ${sessionId}`);
    }
  }

  /**
   * Handle language change
   */
  private handleLanguageChange(socket: Socket, data: any): void {
    const validation = MessageValidator.validateLanguageChange(data);
    if (!validation.valid || !validation.message) {
      this.sendError(socket, 400, validation.error || 'Invalid language change message');
      return;
    }

    const { sessionId, newLanguage } = validation.message;
    const success = this.sessionManager.updateClientLanguage(sessionId, socket.id, newLanguage);
    
    if (success) {
      socket.emit('language-changed', {
        type: 'language-changed',
        sessionId,
        language: newLanguage,
        timestamp: new Date().toISOString()
      });
      console.log(`Client ${socket.id} changed language to ${newLanguage} in session: ${sessionId}`);
    } else {
      this.sendError(socket, 404, 'Session not found or language change failed', { sessionId });
    }
  }

  /**
   * Handle configuration updates (admin only)
   */
  private handleConfigUpdate(socket: Socket, data: any): void {
    const validation = MessageValidator.validateConfigUpdate(data);
    if (!validation.valid || !validation.message) {
      this.sendError(socket, 400, validation.error || 'Invalid config update message');
      return;
    }

    const { sessionId, config } = validation.message;
    const success = this.sessionManager.updateSessionConfig(sessionId, config);
    
    if (success) {
      // Get updated session metadata
      const metadata = this.sessionManager.getSessionMetadata(sessionId);
      
      if (metadata) {
        // Broadcast session metadata update to all clients
        this.io.to(sessionId).emit('session-metadata-update', {
          type: 'session-metadata-update',
          sessionId,
          metadata,
          timestamp: new Date().toISOString()
        });
      }
      
      // Broadcast config update to all clients in the session
      this.io.to(sessionId).emit('config-updated', {
        type: 'config-updated',
        sessionId,
        config,
        timestamp: new Date().toISOString()
      });
      console.log(`Config updated for session: ${sessionId}`);
    } else {
      this.sendError(socket, 404, 'Session not found or config update failed', { sessionId });
    }
  }

  /**
   * Handle TTS configuration updates (admin only)
   */
  private handleTTSConfigUpdate(socket: Socket, data: any): void {
    const { sessionId, ttsMode, audioQuality } = data;
    
    if (!sessionId || !ttsMode) {
      this.sendError(socket, 400, 'Missing required fields: sessionId, ttsMode');
      return;
    }

    const success = this.sessionManager.updateTTSMode(sessionId, ttsMode);
    
    if (success && audioQuality) {
      this.sessionManager.updateAudioQuality(sessionId, audioQuality);
    }
    
    if (success) {
      // Broadcast TTS config update to all clients
      this.broadcastTTSConfigUpdate(sessionId, ttsMode);
      
      // Get updated session metadata
      const metadata = this.sessionManager.getSessionMetadata(sessionId);
      if (metadata) {
        this.io.to(sessionId).emit('session-metadata-update', {
          type: 'session-metadata-update',
          sessionId,
          metadata,
          timestamp: new Date().toISOString()
        });
      }
      
      console.log(`TTS config updated for session: ${sessionId}, mode: ${ttsMode}`);
    } else {
      this.sendError(socket, 404, 'Session not found or TTS config update failed', { sessionId });
    }
  }

  /**
   * Handle language updates (admin only)
   */
  private handleLanguageUpdate(socket: Socket, data: any): void {
    const { sessionId, enabledLanguages } = data;
    
    if (!sessionId || !enabledLanguages || !Array.isArray(enabledLanguages)) {
      this.sendError(socket, 400, 'Missing required fields: sessionId, enabledLanguages');
      return;
    }

    // Get current languages to determine which were removed
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      this.sendError(socket, 404, 'Session not found', { sessionId });
      return;
    }

    const currentLanguages = session.config.enabledLanguages;
    const removedLanguages = currentLanguages.filter(lang => !enabledLanguages.includes(lang));
    
    const success = this.sessionManager.updateEnabledLanguages(sessionId, enabledLanguages);
    
    if (success) {
      // Notify clients affected by language removal
      if (removedLanguages.length > 0) {
        const affectedClients = this.sessionManager.getClientsAffectedByLanguageChange(sessionId, removedLanguages);
        
        affectedClients.forEach(client => {
          this.io.to(client.socketId).emit('language-removed', {
            type: 'language-removed',
            sessionId,
            removedLanguage: client.preferredLanguage,
            availableLanguages: enabledLanguages,
            timestamp: new Date().toISOString()
          });
        });
      }
      
      // Broadcast language update to all clients
      this.io.to(sessionId).emit('language-update', {
        type: 'language-update',
        sessionId,
        enabledLanguages,
        removedLanguages,
        timestamp: new Date().toISOString()
      });
      
      // Get updated session metadata
      const metadata = this.sessionManager.getSessionMetadata(sessionId);
      if (metadata) {
        this.io.to(sessionId).emit('session-metadata-update', {
          type: 'session-metadata-update',
          sessionId,
          metadata,
          timestamp: new Date().toISOString()
        });
      }
      
      console.log(`Languages updated for session: ${sessionId}, enabled: [${enabledLanguages.join(', ')}], removed: [${removedLanguages.join(', ')}]`);
    } else {
      this.sendError(socket, 404, 'Session not found or language update failed', { sessionId });
    }
  }

  /**
   * Handle direct TTS generation requests (admin only)
   */
  private async handleGenerateTTS(socket: Socket, data: any): Promise<void> {
    const { sessionId, text, language, voiceType } = data;
    
    if (!sessionId || !text || !language) {
      this.sendError(socket, 400, 'Missing required fields: sessionId, text, language');
      return;
    }

    // Get session to check TTS configuration
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      this.sendError(socket, 404, 'Session not found', { sessionId });
      return;
    }

    if (session.config.ttsMode === 'disabled') {
      this.sendError(socket, 400, 'TTS is disabled for this session', { sessionId });
      return;
    }

    try {
      const effectiveVoiceType = voiceType || session.config.ttsMode;
      
      // Check for cached audio first
      let audioInfo = null;
      if (this.audioManager) {
        audioInfo = this.audioManager.getAudioInfo(text, language, effectiveVoiceType);
      }

      if (!audioInfo) {
        // Generate new TTS audio
        console.log(`Generating TTS for direct request: ${text.substring(0, 50)}... (${language}, ${effectiveVoiceType})`);
        
        const ttsResult = await this.ttsService.synthesizeSpeech(
          text,
          language,
          effectiveVoiceType
        );

        // Store audio if audio manager is available
        if (this.audioManager) {
          audioInfo = await this.audioManager.storeAudioFile(
            ttsResult.audioBuffer,
            text,
            language,
            ttsResult.voiceType,
            ttsResult.format,
            ttsResult.duration
          );
        }
      }

      // Send TTS result back to admin
      socket.emit('tts-generated', {
        type: 'tts-generated',
        sessionId,
        text,
        language,
        audioUrl: audioInfo?.url,
        audioMetadata: audioInfo ? {
          audioId: audioInfo.id,
          url: audioInfo.url,
          duration: audioInfo.duration,
          format: audioInfo.format,
          voiceType: audioInfo.voiceType,
          size: audioInfo.size
        } : undefined,
        timestamp: new Date().toISOString()
      });

      console.log(`TTS generation completed for direct request: ${language}`);
    } catch (error) {
      console.error('Direct TTS generation failed:', error);
      this.sendError(socket, 500, 'TTS generation failed', { 
        sessionId, 
        language, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Handle translation broadcasting (admin only)
   */
  private async handleTranslationBroadcast(socket: Socket, data: any): Promise<void> {
    const { sessionId, translations, audioResults, original } = data;
    
    if (!sessionId) {
      this.sendError(socket, 400, 'Missing sessionId');
      return;
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      this.sendError(socket, 404, 'Session not found', { sessionId });
      return;
    }

    // Broadcast to all clients in session
    const clients = this.sessionManager.getSessionClients(sessionId);
    
    if (clients.length === 0) {
      console.log(`No clients in session ${sessionId}`);
      return;
    }

    // Send to each client based on their language preference
    clients.forEach(client => {
      const lang = client.preferredLanguage;
      const translatedText = translations?.[lang];
      const audioResult = audioResults?.find((a: any) => a.language === lang);
      
      if (translatedText) {
        this.io.to(client.socketId).emit('translation', {
          type: 'translation',
          sessionId,
          original,
          text: translatedText,
          language: lang,
          timestamp: Date.now(),
          audioUrl: audioResult?.audioUrl || null,
          audioMetadata: audioResult?.audioMetadata || null,
          ttsAvailable: !!audioResult?.audioUrl
        });
      }
    });
    
    console.log(`Broadcasted translations to ${clients.length} clients in session ${sessionId}`);
  }

  /**
   * Generate TTS audio with fallback chain
   */
  private async generateAndCacheTTS(
    message: TranslationBroadcast, 
    voiceType: 'neural' | 'standard'
  ): Promise<void> {
    try {
      console.log(`Generating TTS audio for: ${message.text.substring(0, 50)}... (${message.language}, ${voiceType})`);
      
      // Log TTS request
      if (this.errorLogger) {
        this.errorLogger.logTTSOperation('request', {
          text: message.text.substring(0, 100),
          language: message.language,
          voiceType,
          sessionId: message.sessionId
        });
      }
      
      const startTime = Date.now();
      const result = await this.ttsFallbackManager.generateAudioWithFallback(
        message.text,
        message.language,
        voiceType,
        message.sessionId
      );
      const duration = Date.now() - startTime;

      if (result.success) {
        if (result.audioBuffer && this.audioManager) {
          // Store audio and get URL
          const audioInfo = await this.audioManager.storeAudioFile(
            result.audioBuffer,
            message.text,
            message.language,
            result.voiceType || voiceType,
            'mp3',
            result.duration
          );
          
          message.audioUrl = audioInfo.url;
          message.audioMetadata = {
            audioId: audioInfo.id,
            url: audioInfo.url,
            duration: audioInfo.duration,
            format: audioInfo.format,
            voiceType: audioInfo.voiceType,
            size: audioInfo.size
          };
          
          // Log successful TTS generation
          if (this.errorLogger) {
            this.errorLogger.logTTSOperation('success', {
              text: message.text.substring(0, 100),
              language: message.language,
              voiceType: result.voiceType || voiceType,
              duration,
              sessionId: message.sessionId
            });
          }
          
          console.log(`TTS generated with ${result.fallbackUsed}: ${message.language}`);
        } else if (result.fallbackUsed === 'local') {
          // Use local TTS
          message.useLocalTTS = true;
          
          // Log fallback usage
          if (this.errorLogger) {
            this.errorLogger.logTTSOperation('fallback', {
              text: message.text.substring(0, 100),
              language: message.language,
              fallbackMethod: 'local',
              duration,
              sessionId: message.sessionId
            });
          }
          
          console.log(`Using local TTS fallback for: ${message.language}`);
        }
      } else {
        // All TTS methods failed, use text-only
        console.warn(`All TTS methods failed: ${result.error}`);
        message.useLocalTTS = true;
        
        // Log TTS failure
        if (this.errorLogger) {
          this.errorLogger.logTTSOperation('failure', {
            text: message.text.substring(0, 100),
            language: message.language,
            voiceType,
            duration,
            error: result.error,
            sessionId: message.sessionId
          });
        }
      }
    } catch (error) {
      console.error('TTS generation with fallback failed:', error);
      message.useLocalTTS = true;
    }
  }

  /**
   * Broadcast fallback notifications to clients
   */
  private broadcastFallbackNotification(notification: any): void {
    if (notification.sessionId) {
      // Broadcast to specific session
      this.io.to(notification.sessionId).emit('tts-fallback-notification', {
        type: 'tts-fallback-notification',
        ...notification,
        timestamp: new Date().toISOString()
      });
    } else {
      // Broadcast to all connected clients
      this.io.emit('tts-fallback-notification', {
        type: 'tts-fallback-notification',
        ...notification,
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`Broadcasted fallback notification: ${notification.type} - ${notification.originalMethod} → ${notification.fallbackMethod}`);
  }

  /**
   * Handle client disconnection cleanup
   */
  handleDisconnection(socket: Socket, reason: string): void {
    console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
    
    // Remove client from all sessions
    const sessions = this.sessionManager.getAllSessions();
    sessions.forEach(session => {
      this.sessionManager.removeClient(session.sessionId, socket.id);
    });
  }

  /**
   * Send error message to client
   */
  private sendError(socket: Socket, code: number, message: string, details?: any): void {
    const errorMsg: ErrorMessage = {
      type: 'error',
      code,
      message,
      details
    };
    socket.emit('error', errorMsg);
    console.error(`Error sent to ${socket.id}: ${code} - ${message}`, details);
  }

  /**
   * Broadcast to language-specific client groups
   */
  broadcastToLanguageGroup(sessionId: string, language: TargetLanguage, message: any): void {
    const targetClients = this.sessionManager.getClientsByLanguage(sessionId, language);
    targetClients.forEach(clientSocketId => {
      this.io.to(clientSocketId).emit('broadcast', message);
    });
  }

  /**
   * Broadcast to all clients in a session
   */
  broadcastToSession(sessionId: string, message: any): void {
    this.io.to(sessionId).emit('broadcast', message);
  }

  /**
   * Broadcast audio with metadata to language-specific clients
   */
  broadcastAudioToLanguageGroup(
    sessionId: string, 
    language: TargetLanguage, 
    audioBuffer: Buffer,
    text: string,
    voiceType: 'neural' | 'standard' | 'local',
    format: string = 'mp3',
    duration?: number
  ): void {
    if (!this.audioManager) {
      console.warn('Audio manager not available for audio broadcasting');
      return;
    }

    // Store audio file and get info
    this.audioManager.storeAudioFile(audioBuffer, text, language, voiceType, format, duration)
      .then(audioInfo => {
        const audioMetadata: AudioMetadata = {
          audioId: audioInfo.id,
          url: audioInfo.url,
          duration: audioInfo.duration,
          format: audioInfo.format,
          voiceType: audioInfo.voiceType,
          size: audioInfo.size
        };

        const message: TranslationBroadcast = {
          type: 'translation',
          sessionId,
          text,
          language,
          timestamp: Date.now(),
          audioUrl: audioInfo.url,
          audioMetadata
        };

        // Get clients for the specific language
        const targetClients = this.sessionManager.getClientsByLanguage(sessionId, language);
        
        targetClients.forEach(clientSocketId => {
          this.io.to(clientSocketId).emit('translation', message);
        });

        console.log(`Broadcasted audio to ${targetClients.length} clients for language: ${language}`);
      })
      .catch(error => {
        console.error('Failed to store and broadcast audio:', error);
      });
  }

  /**
   * Broadcast TTS configuration update to all clients
   */
  broadcastTTSConfigUpdate(sessionId: string, ttsMode: 'neural' | 'standard' | 'local' | 'disabled'): void {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      console.error(`Session not found for TTS config update: ${sessionId}`);
      return;
    }

    const configUpdate = {
      type: 'tts-config-update',
      sessionId,
      ttsMode,
      ttsAvailable: ttsMode !== 'disabled',
      audioQuality: session.config.audioQuality,
      timestamp: new Date().toISOString()
    };

    this.io.to(sessionId).emit('tts-config-update', configUpdate);
    console.log(`Broadcasted TTS config update to session: ${sessionId}, mode: ${ttsMode}`);
  }

  /**
   * Get audio streaming statistics for monitoring
   */
  getAudioStreamingStats(sessionId: string): {
    totalClients: number;
    clientsByLanguage: Record<TargetLanguage, number>;
    audioCapabilities: {
      pollySupported: number;
      localTTSSupported: number;
      audioFormatsSupported: Record<string, number>;
    };
  } {
    const clients = this.sessionManager.getSessionClients(sessionId);
    
    const stats = {
      totalClients: clients.length,
      clientsByLanguage: {} as Record<TargetLanguage, number>,
      audioCapabilities: {
        pollySupported: 0,
        localTTSSupported: 0,
        audioFormatsSupported: {} as Record<string, number>
      }
    };

    // Initialize language counts
    const languages: TargetLanguage[] = ['en', 'es', 'fr', 'de', 'it'];
    languages.forEach(lang => {
      stats.clientsByLanguage[lang] = 0;
    });

    // Count clients by language and capabilities
    clients.forEach(client => {
      stats.clientsByLanguage[client.preferredLanguage]++;
      
      if (client.audioCapabilities.supportsPolly) {
        stats.audioCapabilities.pollySupported++;
      }
      
      if (client.audioCapabilities.localTTSLanguages.length > 0) {
        stats.audioCapabilities.localTTSSupported++;
      }
      
      client.audioCapabilities.audioFormats.forEach(format => {
        stats.audioCapabilities.audioFormatsSupported[format] = 
          (stats.audioCapabilities.audioFormatsSupported[format] || 0) + 1;
      });
    });

    return stats;
  }

  /**
   * Test TTS capabilities
   */
  async testTTSCapabilities(language: TargetLanguage = 'en'): Promise<{
    polly: boolean;
    local: boolean;
    textOnly: boolean;
    supportedLanguages: TargetLanguage[];
    performanceMetrics?: any;
  }> {
    const capabilities = await this.ttsFallbackManager.testTTSCapabilities(language);
    const metrics = this.ttsFallbackManager.getPerformanceMetrics();
    
    return {
      ...capabilities,
      supportedLanguages: this.ttsService.getSupportedLanguages(),
      performanceMetrics: metrics
    };
  }

  /**
   * Get fallback manager performance metrics
   */
  getFallbackMetrics() {
    return this.ttsFallbackManager.getPerformanceMetrics();
  }

  /**
   * Update fallback configuration
   */
  updateFallbackConfig(config: any) {
    this.ttsFallbackManager.updateConfig(config);
  }
}