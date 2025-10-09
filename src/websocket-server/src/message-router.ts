import { Socket, Server as SocketIOServer } from 'socket.io';
import { SessionManager } from './session-manager';
import { MessageValidator } from './message-validator';
import { AudioManager } from './audio-manager';
import { TTSService } from './tts-service';
import { TTSFallbackManager } from './tts-fallback-manager';
import { AuthManager } from './auth-manager';
import { AdminIdentityManager } from './admin-identity-manager';
import { 
  AdminAuthMessage,
  AdminAuthResponse,
  SessionSummary,
  AdminErrorCode,
  ERROR_MESSAGES,
  TargetLanguage as SharedTargetLanguage
} from '../../shared/types';
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
    private authManager: AuthManager,
    private adminIdentityManager: AdminIdentityManager,
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
        case 'admin-auth':
          this.handleAdminAuth(socket, data);
          break;
        case 'token-refresh':
          this.handleTokenRefresh(socket, data);
          break;
        case 'admin-session-access':
          this.handleAdminSessionAccess(socket, data);
          break;
        case 'start-session':
          this.handleStartSession(socket, data);
          break;
        case 'end-session':
          this.handleEndSession(socket, data);
          break;
        case 'list-sessions':
          this.handleListSessions(socket, data);
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
        case 'update-session-config':
          this.handleUpdateSessionConfig(socket, data);
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

  // ============================================================================
  // Admin Authentication Handlers (Task 5.1)
  // ============================================================================

  /**
   * Handle admin authentication with both credential and token methods
   */
  private async handleAdminAuth(socket: Socket, data: AdminAuthMessage): Promise<void> {
    console.log(`Admin authentication request from ${socket.id}, method: ${data.method}`);

    try {
      // Validate required fields
      if (!data.method || (data.method !== 'credentials' && data.method !== 'token')) {
        this.sendAdminError(socket, AdminErrorCode.VALIDATION_INVALID_INPUT, {
          validationErrors: ['method must be either "credentials" or "token"']
        });
        return;
      }

      let adminIdentity;
      let tokens;
      let isReconnection = false;

      if (data.method === 'credentials') {
        // Credential-based authentication
        if (!data.username || !data.password) {
          this.sendAdminError(socket, AdminErrorCode.VALIDATION_MISSING_REQUIRED_FIELD, {
            validationErrors: ['username and password are required for credentials method']
          });
          return;
        }

        // Authenticate with AuthManager
        const authSessionId = this.authManager.authenticate(
          data.username,
          data.password,
          socket.handshake.address,
          socket.handshake.headers['user-agent']
        );

        if (!authSessionId) {
          this.sendAdminError(socket, AdminErrorCode.AUTH_INVALID_CREDENTIALS);
          return;
        }

        // Register or retrieve admin identity
        adminIdentity = this.adminIdentityManager.registerAdminConnection(data.username, socket.id);
        
        // Generate JWT tokens
        tokens = this.adminIdentityManager.generateTokenPair(adminIdentity.adminId);
        
        // Schedule token expiry warning
        this.adminIdentityManager.scheduleExpiryWarning(
          adminIdentity.adminId,
          tokens.accessTokenExpiry,
          (adminId, expiresAt, timeRemaining) => {
            this.sendTokenExpiryWarning(adminId, expiresAt, timeRemaining);
          }
        );

        console.log(`Admin authenticated with credentials: ${data.username} (${adminIdentity.adminId})`);
      } else {
        // Token-based authentication
        if (!data.token) {
          this.sendAdminError(socket, AdminErrorCode.VALIDATION_MISSING_REQUIRED_FIELD, {
            validationErrors: ['token is required for token method']
          });
          return;
        }

        try {
          // Validate token and register connection
          adminIdentity = this.adminIdentityManager.registerAdminConnectionWithToken(data.token, socket.id);
          
          // Check if token needs refresh
          const tokenStatus = this.adminIdentityManager.checkTokenStatus(data.token);
          if (tokenStatus.needsRefresh) {
            // Token is valid but expiring soon, include in response
            console.log(`Token for admin ${adminIdentity.adminId} needs refresh (${tokenStatus.timeRemaining}s remaining)`);
          }
          
          // Use existing token
          tokens = {
            accessToken: data.token,
            refreshToken: '', // Client should already have refresh token
            accessTokenExpiry: this.adminIdentityManager.getTokenExpiry(data.token)!,
            refreshTokenExpiry: new Date() // Not used for token auth
          };
          
          // Schedule token expiry warning
          this.adminIdentityManager.scheduleExpiryWarning(
            adminIdentity.adminId,
            tokens.accessTokenExpiry,
            (adminId, expiresAt, timeRemaining) => {
              this.sendTokenExpiryWarning(adminId, expiresAt, timeRemaining);
            }
          );

          isReconnection = true;
          console.log(`Admin reconnected with token: ${adminIdentity.username} (${adminIdentity.adminId})`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          if (errorMessage.includes('expired')) {
            this.sendAdminError(socket, AdminErrorCode.AUTH_TOKEN_EXPIRED);
          } else if (errorMessage.includes('invalid')) {
            this.sendAdminError(socket, AdminErrorCode.AUTH_TOKEN_INVALID);
          } else {
            this.sendAdminError(socket, AdminErrorCode.SYSTEM_INTERNAL_ERROR, {
              operation: 'token-validation'
            });
          }
          return;
        }
      }

      // Recover admin sessions
      const ownedSessionIds = this.adminIdentityManager.recoverAdminSessions(adminIdentity.adminId);
      
      // Update session admin socket IDs
      const updatedCount = this.adminIdentityManager.updateSessionAdminSocket(
        adminIdentity.adminId,
        socket.id,
        (sessionId, newSocketId) => {
          this.sessionManager.updateCurrentAdminSocket(sessionId, newSocketId);
        }
      );

      // Get owned sessions with full details
      const ownedSessions: SessionSummary[] = ownedSessionIds.map(sessionId => {
        const session = this.sessionManager.getSession(sessionId);
        if (!session) return null;
        
        return {
          sessionId: session.sessionId,
          status: session.status,
          clientCount: session.clients.size,
          createdAt: session.createdAt.toISOString(),
          createdBy: session.createdBy,
          isOwner: true,
          config: {
            enabledLanguages: session.config.enabledLanguages,
            ttsMode: session.config.ttsMode
          }
        };
      }).filter(s => s !== null) as SessionSummary[];

      // Get all sessions
      const allSessions: SessionSummary[] = this.sessionManager.getAllSessions().map(session => ({
        sessionId: session.sessionId,
        status: session.status,
        clientCount: session.clients.size,
        createdAt: session.createdAt.toISOString(),
        createdBy: session.createdBy,
        isOwner: session.adminId === adminIdentity.adminId,
        config: {
          enabledLanguages: session.config.enabledLanguages,
          ttsMode: session.config.ttsMode
        }
      }));

      // Get admin permissions
      const permissions = this.adminIdentityManager.getAdminPermissions(adminIdentity.adminId);

      // Send successful authentication response
      const response: AdminAuthResponse = {
        type: 'admin-auth-response',
        success: true,
        adminId: adminIdentity.adminId,
        username: adminIdentity.username,
        token: tokens.accessToken,
        tokenExpiry: tokens.accessTokenExpiry.toISOString(),
        refreshToken: data.method === 'credentials' ? tokens.refreshToken : undefined,
        ownedSessions,
        allSessions,
        permissions,
        timestamp: new Date().toISOString()
      };

      socket.emit('admin-auth-response', response);

      // If reconnection, send reconnection notification
      if (isReconnection && ownedSessionIds.length > 0) {
        socket.emit('admin-reconnection', {
          type: 'admin-reconnection',
          adminId: adminIdentity.adminId,
          username: adminIdentity.username,
          recoveredSessions: ownedSessionIds,
          timestamp: new Date().toISOString()
        });
      }

      console.log(`Admin authentication successful: ${adminIdentity.username}, recovered ${updatedCount} sessions`);
    } catch (error) {
      console.error('Admin authentication error:', error);
      this.sendAdminError(socket, AdminErrorCode.SYSTEM_INTERNAL_ERROR, {
        operation: 'admin-auth'
      });
    }
  }

  /**
   * Send token expiry warning to admin
   */
  private sendTokenExpiryWarning(adminId: string, expiresAt: Date, timeRemaining: number): void {
    const sockets = this.adminIdentityManager.getAdminSockets(adminId);
    
    for (const socketId of sockets) {
      this.io.to(socketId).emit('token-expiry-warning', {
        type: 'token-expiry-warning',
        adminId,
        expiresAt: expiresAt.toISOString(),
        timeRemaining,
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`Sent token expiry warning to admin ${adminId} (${timeRemaining}s remaining)`);
  }

  /**
   * Send admin error message
   */
  private sendAdminError(
    socket: Socket,
    errorCode: AdminErrorCode,
    details?: {
      sessionId?: string;
      operation?: string;
      adminId?: string;
      validationErrors?: string[];
    }
  ): void {
    const errorInfo = ERROR_MESSAGES[errorCode];
    
    socket.emit('admin-error', {
      type: 'admin-error',
      errorCode,
      message: errorInfo.message,
      userMessage: errorInfo.userMessage,
      retryable: errorInfo.retryable,
      retryAfter: errorInfo.retryAfter,
      details,
      timestamp: new Date().toISOString()
    });
    
    console.error(`Admin error sent to ${socket.id}: ${errorCode} - ${errorInfo.message}`, details);
  }

  // ============================================================================
  // Token Management Handlers (Task 5.2)
  // ============================================================================

  /**
   * Handle token refresh request
   */
  private async handleTokenRefresh(socket: Socket, data: any): Promise<void> {
    console.log(`Token refresh request from ${socket.id}`);

    try {
      // Validate required fields
      if (!data.refreshToken) {
        this.sendAdminError(socket, AdminErrorCode.VALIDATION_MISSING_REQUIRED_FIELD, {
          operation: 'token-refresh',
          validationErrors: ['refreshToken is required']
        });
        return;
      }

      // Attempt to refresh tokens
      const tokens = this.adminIdentityManager.handleTokenRefresh(
        data.refreshToken,
        (adminId, newTokens) => {
          // Success callback - schedule new expiry warning
          this.adminIdentityManager.scheduleExpiryWarning(
            adminId,
            newTokens.accessTokenExpiry,
            (adminId, expiresAt, timeRemaining) => {
              this.sendTokenExpiryWarning(adminId, expiresAt, timeRemaining);
            }
          );
          
          console.log(`Token refreshed successfully for admin ${adminId}`);
        },
        (error) => {
          // Error callback
          console.error('Token refresh failed:', error);
        }
      );

      if (tokens) {
        // Send success response
        socket.emit('token-refresh-response', {
          type: 'token-refresh-response',
          success: true,
          token: tokens.accessToken,
          tokenExpiry: tokens.accessTokenExpiry.toISOString(),
          refreshToken: tokens.refreshToken,
          timestamp: new Date().toISOString()
        });
        
        console.log(`Token refresh successful for socket ${socket.id}`);
      } else {
        // Refresh failed
        this.sendAdminError(socket, AdminErrorCode.AUTH_REFRESH_TOKEN_INVALID, {
          operation: 'token-refresh'
        });
      }
    } catch (error) {
      console.error('Token refresh error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('expired')) {
        this.sendAdminError(socket, AdminErrorCode.AUTH_REFRESH_TOKEN_EXPIRED);
      } else if (errorMessage.includes('invalid') || errorMessage.includes('not found')) {
        this.sendAdminError(socket, AdminErrorCode.AUTH_REFRESH_TOKEN_INVALID);
      } else {
        this.sendAdminError(socket, AdminErrorCode.SYSTEM_INTERNAL_ERROR, {
          operation: 'token-refresh'
        });
      }
    }
  }

  /**
   * Send session expired notification to admin
   */
  private sendSessionExpiredNotification(adminId: string, reason: 'token-expired' | 'invalid-token' | 'revoked'): void {
    const sockets = this.adminIdentityManager.getAdminSockets(adminId);
    
    for (const socketId of sockets) {
      this.io.to(socketId).emit('session-expired', {
        type: 'session-expired',
        adminId,
        reason,
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`Sent session expired notification to admin ${adminId} (reason: ${reason})`);
  }

  /**
   * Clean up expired tokens for an admin
   * Called periodically or on specific events
   */
  private cleanupExpiredTokens(adminId: string): void {
    try {
      const identity = this.adminIdentityManager.getAdminIdentity(adminId);
      if (!identity) {
        return;
      }

      // Check each refresh token for expiry
      const expiredTokens: string[] = [];
      for (const refreshToken of identity.refreshTokens) {
        try {
          const tokenStatus = this.adminIdentityManager.checkTokenStatus(refreshToken);
          if (tokenStatus.isExpired) {
            expiredTokens.push(refreshToken);
          }
        } catch (error) {
          // Token is invalid, mark for removal
          expiredTokens.push(refreshToken);
        }
      }

      // Remove expired tokens
      for (const token of expiredTokens) {
        this.adminIdentityManager.revokeRefreshToken(adminId, token);
      }

      if (expiredTokens.length > 0) {
        console.log(`Cleaned up ${expiredTokens.length} expired tokens for admin ${adminId}`);
      }
    } catch (error) {
      console.error(`Failed to cleanup expired tokens for admin ${adminId}:`, error);
    }
  }

  /**
   * Start automatic token cleanup scheduler
   * Runs every hour to clean up expired tokens
   */
  public startTokenCleanupScheduler(): void {
    setInterval(() => {
      console.log('Running automatic token cleanup...');
      const allAdmins = this.adminIdentityManager.getAllAdminIdentities();
      
      for (const admin of allAdmins) {
        this.cleanupExpiredTokens(admin.adminId);
      }
    }, 60 * 60 * 1000); // Every hour
    
    console.log('Token cleanup scheduler started');
  }

  // ============================================================================
  // Admin Session Access Handlers (Task 5.4)
  // ============================================================================

  /**
   * Handle admin session access request
   * Allows admins to view (read-only) sessions created by other admins
   */
  private handleAdminSessionAccess(socket: Socket, data: any): void {
    // Get admin identity
    const adminIdentity = this.adminIdentityManager.getAdminBySocketId(socket.id);
    if (!adminIdentity) {
      this.sendAdminError(socket, AdminErrorCode.AUTH_SESSION_NOT_FOUND);
      return;
    }

    // Validate required fields
    if (!data.sessionId) {
      this.sendAdminError(socket, AdminErrorCode.VALIDATION_MISSING_REQUIRED_FIELD, {
        operation: 'admin-session-access',
        validationErrors: ['sessionId is required']
      });
      return;
    }

    if (!data.accessType || (data.accessType !== 'read' && data.accessType !== 'write')) {
      this.sendAdminError(socket, AdminErrorCode.VALIDATION_INVALID_INPUT, {
        operation: 'admin-session-access',
        validationErrors: ['accessType must be either "read" or "write"']
      });
      return;
    }

    const { sessionId, accessType } = data;

    // Get session
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      this.sendAdminError(socket, AdminErrorCode.SESSION_NOT_FOUND, { sessionId });
      return;
    }

    // Verify access
    const hasAccess = this.sessionManager.verifyAdminAccess(sessionId, adminIdentity.adminId, accessType);
    
    if (!hasAccess) {
      if (accessType === 'write') {
        // Write access denied - only owner can modify
        this.sendAdminError(socket, AdminErrorCode.AUTHZ_SESSION_NOT_OWNED, {
          sessionId,
          adminId: adminIdentity.adminId,
          operation: 'admin-session-access'
        });
      } else {
        // Read access should always be granted, but just in case
        this.sendAdminError(socket, AdminErrorCode.AUTHZ_ACCESS_DENIED, {
          sessionId,
          adminId: adminIdentity.adminId,
          operation: 'admin-session-access'
        });
      }
      return;
    }

    // Prepare session data response
    // For read-only access, include full session data but mark as read-only
    const sessionData = {
      sessionId: session.sessionId,
      adminId: session.adminId,
      currentAdminSocketId: session.currentAdminSocketId,
      createdBy: session.createdBy,
      config: session.config,
      clients: Array.from(session.clients.values()).map(client => ({
        socketId: client.socketId,
        preferredLanguage: client.preferredLanguage,
        joinedAt: client.joinedAt.toISOString(),
        lastSeen: client.lastSeen.toISOString(),
        audioCapabilities: client.audioCapabilities
      })),
      createdAt: session.createdAt.toISOString(),
      lastActivity: session.lastActivity.toISOString(),
      status: session.status,
      isOwner: session.adminId === adminIdentity.adminId,
      accessType
    };

    // Send success response
    socket.emit('admin-session-access-response', {
      type: 'admin-session-access-response',
      success: true,
      sessionId,
      accessType,
      sessionData,
      timestamp: new Date().toISOString()
    });

    console.log(`Admin ${adminIdentity.username} accessed session ${sessionId} with ${accessType} access`);
  }

  /**
   * Handle session creation (admin only)
   */
  private handleStartSession(socket: Socket, data: any): void {
    // Get admin identity
    const adminIdentity = this.adminIdentityManager.getAdminBySocketId(socket.id);
    if (!adminIdentity) {
      this.sendAdminError(socket, AdminErrorCode.AUTH_SESSION_NOT_FOUND);
      return;
    }

    const validation = MessageValidator.validateStartSession(data);
    if (!validation.valid || !validation.message) {
      this.sendAdminError(socket, AdminErrorCode.VALIDATION_INVALID_INPUT, {
        operation: 'start-session',
        validationErrors: [validation.error || 'Invalid start session message']
      });
      return;
    }

    const { sessionId, config } = validation.message;

    try {
      // Create session with admin identity
      const sessionData = this.sessionManager.createSession(
        sessionId,
        config,
        adminIdentity.adminId,
        socket.id,
        adminIdentity.username
      );
      
      // Add session to admin's owned sessions
      this.adminIdentityManager.addOwnedSession(adminIdentity.adminId, sessionId);
      
      socket.join(sessionId);
      socket.emit('start-session-response', {
        type: 'start-session-response',
        success: true,
        sessionId,
        adminId: adminIdentity.adminId,
        config,
        timestamp: new Date().toISOString()
      });
      
      console.log(`Session started: ${sessionId} by admin ${adminIdentity.username} (${adminIdentity.adminId})`);
    } catch (error) {
      console.error('Failed to start session:', error);
      this.sendAdminError(socket, AdminErrorCode.SESSION_CREATION_FAILED, {
        sessionId,
        operation: 'start-session'
      });
    }
  }

  /**
   * Handle session end (admin only)
   */
  private handleEndSession(socket: Socket, data: any): void {
    // Get admin identity
    const adminIdentity = this.adminIdentityManager.getAdminBySocketId(socket.id);
    if (!adminIdentity) {
      this.sendAdminError(socket, AdminErrorCode.AUTH_SESSION_NOT_FOUND);
      return;
    }

    const { sessionId } = data;
    
    if (!sessionId) {
      this.sendAdminError(socket, AdminErrorCode.VALIDATION_MISSING_REQUIRED_FIELD, {
        operation: 'end-session',
        validationErrors: ['sessionId is required']
      });
      return;
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      this.sendAdminError(socket, AdminErrorCode.SESSION_NOT_FOUND, { sessionId });
      return;
    }

    // Verify admin ownership
    if (!this.sessionManager.verifyAdminAccess(sessionId, adminIdentity.adminId, 'write')) {
      this.sendAdminError(socket, AdminErrorCode.AUTHZ_SESSION_NOT_OWNED, {
        sessionId,
        adminId: adminIdentity.adminId
      });
      return;
    }

    const success = this.sessionManager.endSession(sessionId);
    
    if (success) {
      // Remove session from admin's owned sessions
      this.adminIdentityManager.removeOwnedSession(adminIdentity.adminId, sessionId);
      
      // Notify all clients
      this.io.to(sessionId).emit('session-ended', {
        type: 'session-ended',
        sessionId,
        timestamp: new Date().toISOString()
      });
      
      // Disconnect all clients from room
      this.io.in(sessionId).socketsLeave(sessionId);
      
      socket.emit('end-session-response', {
        type: 'end-session-response',
        success: true,
        sessionId,
        timestamp: new Date().toISOString()
      });
      
      console.log(`Session ended: ${sessionId} by admin ${adminIdentity.username} (${adminIdentity.adminId})`);
    } else {
      this.sendAdminError(socket, AdminErrorCode.SESSION_DELETE_FAILED, { sessionId });
    }
  }

  private handleUpdateSessionConfig(socket: Socket, data: any): void {
    const adminIdentity = this.adminIdentityManager.getAdminBySocketId(socket.id);
    if (!adminIdentity) {
      this.sendAdminError(socket, AdminErrorCode.AUTH_SESSION_NOT_FOUND);
      return;
    }

    const { sessionId, config } = data;
    
    if (!sessionId || !config) {
      this.sendAdminError(socket, AdminErrorCode.VALIDATION_MISSING_REQUIRED_FIELD, {
        operation: 'update-session-config',
        validationErrors: ['sessionId and config are required']
      });
      return;
    }

    if (!this.sessionManager.verifyAdminAccess(sessionId, adminIdentity.adminId, 'write')) {
      this.sendAdminError(socket, AdminErrorCode.AUTHZ_SESSION_NOT_OWNED, { sessionId });
      return;
    }

    const success = this.sessionManager.updateSessionConfig(sessionId, config);
    
    if (success) {
      socket.emit('update-session-config-response', {
        type: 'update-session-config-response',
        success: true,
        sessionId
      });
    } else {
      this.sendAdminError(socket, AdminErrorCode.SESSION_UPDATE_FAILED, { sessionId });
    }
  }

  /**
   * Handle list sessions request with admin-specific filtering
   */
  private handleListSessions(socket: Socket, data?: any): void {
    // Get admin identity
    const adminIdentity = this.adminIdentityManager.getAdminBySocketId(socket.id);
    if (!adminIdentity) {
      this.sendAdminError(socket, AdminErrorCode.AUTH_SESSION_NOT_FOUND);
      return;
    }

    const filter = data?.filter || 'all'; // 'owned' or 'all'
    
    let sessions;
    if (filter === 'owned') {
      sessions = this.sessionManager.getSessionsByAdmin(adminIdentity.adminId);
    } else {
      sessions = this.sessionManager.getAllSessions();
    }
    
    const sessionsList: SessionSummary[] = sessions.map(session => ({
      sessionId: session.sessionId,
      status: session.status,
      clientCount: session.clients.size,
      createdAt: session.createdAt.toISOString(),
      createdBy: session.createdBy,
      isOwner: session.adminId === adminIdentity.adminId,
      config: {
        enabledLanguages: session.config.enabledLanguages,
        ttsMode: session.config.ttsMode
      }
    }));
    
    socket.emit('list-sessions-response', {
      type: 'list-sessions-response',
      sessions: sessionsList,
      timestamp: new Date().toISOString()
    });
    
    console.log(`Listed ${sessionsList.length} sessions for admin ${adminIdentity.username} (filter: ${filter})`);
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
    // Get admin identity
    const adminIdentity = this.adminIdentityManager.getAdminBySocketId(socket.id);
    if (!adminIdentity) {
      this.sendAdminError(socket, AdminErrorCode.AUTH_SESSION_NOT_FOUND);
      return;
    }

    const validation = MessageValidator.validateConfigUpdate(data);
    if (!validation.valid || !validation.message) {
      this.sendAdminError(socket, AdminErrorCode.VALIDATION_INVALID_INPUT, {
        operation: 'update-session-config',
        validationErrors: [validation.error || 'Invalid config update message']
      });
      return;
    }

    const { sessionId, config } = validation.message;
    
    // Verify admin ownership
    if (!this.sessionManager.verifyAdminAccess(sessionId, adminIdentity.adminId, 'write')) {
      this.sendAdminError(socket, AdminErrorCode.AUTHZ_SESSION_NOT_OWNED, {
        sessionId,
        adminId: adminIdentity.adminId
      });
      return;
    }
    
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
      
      // Send success response to admin
      socket.emit('update-session-config-response', {
        type: 'update-session-config-response',
        success: true,
        sessionId,
        config,
        timestamp: new Date().toISOString()
      });
      
      console.log(`Config updated for session: ${sessionId} by admin ${adminIdentity.username}`);
    } else {
      this.sendAdminError(socket, AdminErrorCode.SESSION_UPDATE_FAILED, { sessionId });
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
      
      if (client.audioCapabilities?.supportsPolly) {
        stats.audioCapabilities.pollySupported++;
      }
      
      if ((client.audioCapabilities?.localTTSLanguages.length || 0) > 0) {
        stats.audioCapabilities.localTTSSupported++;
      }
      
      client.audioCapabilities?.audioFormats.forEach(format => {
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