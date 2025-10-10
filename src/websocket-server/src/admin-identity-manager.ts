import { AdminIdentityStore, AdminIdentity } from './admin-identity-store';
import { AdminPermissions } from '../../shared/types';
import { CognitoAuthService, CognitoAuthResult, CognitoRefreshResult, CognitoUserInfo, CognitoAuthError } from './cognito-auth';
import { TokenStore } from './token-store';

/**
 * Cognito token pair returned on authentication
 */
export interface CognitoTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * AdminIdentityManager manages persistent admin identities with Cognito authentication
 */
export class AdminIdentityManager {
  private store: AdminIdentityStore;
  private cognitoAuth: CognitoAuthService;
  private tokenStore: TokenStore;
  private socketToAdminMap: Map<string, string>; // socketId -> adminId (in-memory)
  private expiryWarningTimers: Map<string, NodeJS.Timeout>; // adminId -> timer

  constructor(
    store: AdminIdentityStore,
    cognitoAuth: CognitoAuthService,
    tokenStore: TokenStore
  ) {
    this.store = store;
    this.cognitoAuth = cognitoAuth;
    this.tokenStore = tokenStore;
    this.socketToAdminMap = new Map();
    this.expiryWarningTimers = new Map();
  }

  /**
   * Authenticate admin using Cognito credentials
   * Creates admin identity if it doesn't exist
   * Stores tokens in memory
   */
  public async authenticateWithCredentials(
    username: string,
    password: string,
    socketId: string
  ): Promise<{
    adminId: string;
    cognitoTokens: CognitoTokens;
    ownedSessions: string[];
  }> {
    // Authenticate with Cognito
    const authResult: CognitoAuthResult = await this.cognitoAuth.authenticateUser(username, password);
    
    // Get or create admin identity using Cognito sub as adminId
    let identity = this.store.getAdminIdentity(authResult.userInfo.sub);
    
    if (!identity) {
      // Create new admin identity with Cognito user info
      identity = this.store.createAdminIdentityFromCognito(authResult.userInfo);
    } else {
      // Update existing identity with latest Cognito info
      this.store.updateCognitoUserInfo(authResult.userInfo.sub, authResult.userInfo);
    }
    
    // Store token in memory
    this.tokenStore.storeToken(
      socketId,
      authResult.accessToken,
      authResult.userInfo.sub,
      authResult.expiresIn
    );
    
    // Add socket to active connections
    this.store.addActiveSocket(identity.adminId, socketId);
    this.socketToAdminMap.set(socketId, identity.adminId);
    
    // Update last seen
    this.store.updateLastSeen(identity.adminId);
    
    return {
      adminId: identity.adminId,
      cognitoTokens: {
        accessToken: authResult.accessToken,
        idToken: authResult.idToken,
        refreshToken: authResult.refreshToken,
        expiresIn: authResult.expiresIn
      },
      ownedSessions: Array.from(identity.ownedSessions)
    };
  }

  /**
   * Authenticate admin using Cognito access token
   * Validates token from memory and retrieves admin identity
   */
  public async authenticateWithToken(
    accessToken: string,
    socketId: string
  ): Promise<{
    adminId: string;
    ownedSessions: string[];
  }> {
    try {
      // Validate token with Cognito
      const userInfo: CognitoUserInfo = await this.cognitoAuth.validateToken(accessToken);
      
      // Get or create admin identity
      let identity = this.store.getAdminIdentity(userInfo.sub);
      if (!identity) {
        console.log('Creating new admin identity from token:', userInfo.sub);
        identity = this.store.createAdminIdentityFromCognito(userInfo);
      }
      
      // Store token in memory
      this.tokenStore.storeToken(
        socketId,
        accessToken,
        userInfo.sub,
        3600 // Default 1 hour expiry
      );
      
      // Add socket to active connections (supports multiple connections per admin)
      this.store.addActiveSocket(identity.adminId, socketId);
      this.socketToAdminMap.set(socketId, identity.adminId);
      
      // Update last seen
      this.store.updateLastSeen(identity.adminId);
      
      return {
        adminId: identity.adminId,
        ownedSessions: Array.from(identity.ownedSessions)
      };
    } catch (error) {
      console.error('authenticateWithToken error:', error);
      throw error;
    }
  }

  /**
   * Refresh Cognito tokens
   */
  public async refreshTokens(
    username: string,
    refreshToken: string
  ): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    const result: CognitoRefreshResult = await this.cognitoAuth.refreshAccessToken(username, refreshToken);
    
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn
    };
  }

  /**
   * Get admin identity by admin ID
   */
  public getAdminIdentity(adminId: string): AdminIdentity | null {
    return this.store.getAdminIdentity(adminId);
  }

  /**
   * Get admin identity by socket ID
   */
  public getAdminBySocketId(socketId: string): AdminIdentity | null {
    const adminId = this.socketToAdminMap.get(socketId);
    if (!adminId) {
      return null;
    }
    return this.store.getAdminIdentity(adminId);
  }

  /**
   * Get admin identity by username
   */
  public getAdminByUsername(username: string): AdminIdentity | null {
    return this.store.getAdminByUsername(username);
  }

  /**
   * Verify that an admin owns a specific session
   */
  public verifySessionOwnership(adminId: string, sessionId: string): boolean {
    const identity = this.store.getAdminIdentity(adminId);
    if (!identity) {
      return false;
    }
    
    return identity.ownedSessions.has(sessionId);
  }

  /**
   * Add a session to an admin's owned sessions
   */
  public addOwnedSession(adminId: string, sessionId: string): void {
    this.store.addOwnedSession(adminId, sessionId);
  }

  /**
   * Remove a session from an admin's owned sessions
   */
  public removeOwnedSession(adminId: string, sessionId: string): void {
    this.store.removeOwnedSession(adminId, sessionId);
  }

  /**
   * Get all sessions owned by an admin
   * Note: This returns session IDs only. Caller must retrieve full session data from SessionManager
   */
  public getAdminSessionIds(adminId: string): string[] {
    const identity = this.store.getAdminIdentity(adminId);
    if (!identity) {
      return [];
    }
    
    return Array.from(identity.ownedSessions);
  }

  /**
   * Update admin socket ID for an existing connection
   * Used when admin reconnects
   */
  public updateAdminSocket(adminId: string, oldSocketId: string | null, newSocketId: string): void {
    // Remove old socket mapping if provided
    if (oldSocketId) {
      this.socketToAdminMap.delete(oldSocketId);
      this.store.removeActiveSocket(adminId, oldSocketId);
    }
    
    // Add new socket mapping
    this.socketToAdminMap.set(newSocketId, adminId);
    this.store.addActiveSocket(adminId, newSocketId);
    this.store.updateLastSeen(adminId);
  }

  /**
   * Remove an admin connection (on disconnect)
   */
  public removeAdminConnection(socketId: string): void {
    const adminId = this.socketToAdminMap.get(socketId);
    if (!adminId) {
      return;
    }
    
    // Remove socket mapping
    this.socketToAdminMap.delete(socketId);
    this.store.removeActiveSocket(adminId, socketId);
    
    // Remove token from memory
    this.tokenStore.removeToken(socketId);
    
    // Clear expiry warning timer if exists
    this.clearExpiryWarningTimer(adminId);
  }

  /**
   * Get all active socket IDs for an admin
   */
  public getAdminSockets(adminId: string): string[] {
    const identity = this.store.getAdminIdentity(adminId);
    if (!identity) {
      return [];
    }
    
    return Array.from(identity.activeSockets);
  }

  /**
   * Check if admin has any active connections
   */
  public hasActiveConnections(adminId: string): boolean {
    const identity = this.store.getAdminIdentity(adminId);
    if (!identity) {
      return false;
    }
    
    return identity.activeSockets.size > 0;
  }

  /**
   * Get admin permissions
   */
  public getAdminPermissions(adminId: string): AdminPermissions {
    // For now, all admins have the same permissions
    // This can be extended to support role-based permissions
    return {
      canCreateSessions: true,
      canViewAllSessions: true,
      canManageOwnSessions: true,
      canDeleteOwnSessions: true
    };
  }

  /**
   * Invalidate all tokens for an admin (force re-authentication)
   * Removes all tokens from memory for this admin
   */
  public invalidateAllTokens(adminId: string): void {
    // Remove all tokens from memory for this admin
    const removedCount = this.tokenStore.removeTokensByAdminId(adminId);
    console.log(`Invalidated ${removedCount} tokens for admin ${adminId}`);
  }

  /**
   * Schedule token expiry warning
   * Sends warning 5 minutes before token expires
   */
  public scheduleExpiryWarning(
    adminId: string,
    tokenExpiry: Date,
    callback: (adminId: string, expiresAt: Date, timeRemaining: number) => void
  ): void {
    // Clear existing timer if any
    this.clearExpiryWarningTimer(adminId);
    
    const now = Date.now();
    const expiryTime = tokenExpiry.getTime();
    const warningTime = expiryTime - (5 * 60 * 1000); // 5 minutes before expiry
    const delay = warningTime - now;
    
    // Only schedule if warning time is in the future
    if (delay > 0) {
      const timer = setTimeout(() => {
        const timeRemaining = Math.floor((expiryTime - Date.now()) / 1000);
        callback(adminId, tokenExpiry, timeRemaining);
        this.expiryWarningTimers.delete(adminId);
      }, delay);
      
      this.expiryWarningTimers.set(adminId, timer);
    }
  }

  /**
   * Clear token expiry warning timer
   */
  private clearExpiryWarningTimer(adminId: string): void {
    const timer = this.expiryWarningTimers.get(adminId);
    if (timer) {
      clearTimeout(timer);
      this.expiryWarningTimers.delete(adminId);
    }
  }

  /**
   * Get all admin identities
   */
  public getAllAdminIdentities(): AdminIdentity[] {
    return this.store.getAllAdminIdentities();
  }

  // ============================================================================
  // Session Recovery and Token Management (Subtask 3.2)
  // ============================================================================

  /**
   * Recover admin sessions on reconnection
   * Returns session IDs that the admin owns
   */
  public recoverAdminSessions(adminId: string): string[] {
    const identity = this.store.getAdminIdentity(adminId);
    if (!identity) {
      return [];
    }
    
    return Array.from(identity.ownedSessions);
  }

  /**
   * Update admin socket ID for existing sessions
   * Called when admin reconnects to update the current socket ID for all their sessions
   */
  public updateSessionAdminSocket(
    adminId: string,
    newSocketId: string,
    sessionUpdateCallback: (sessionId: string, newSocketId: string) => void
  ): number {
    const sessionIds = this.recoverAdminSessions(adminId);
    
    // Update each session with the new admin socket ID
    for (const sessionId of sessionIds) {
      sessionUpdateCallback(sessionId, newSocketId);
    }
    
    return sessionIds.length;
  }

  /**
   * Handle concurrent connections for the same admin
   * Returns information about existing connections
   */
  public handleConcurrentConnection(adminId: string, newSocketId: string): {
    isNewConnection: boolean;
    existingSocketCount: number;
    existingSockets: string[];
  } {
    const identity = this.store.getAdminIdentity(adminId);
    if (!identity) {
      throw new Error('Admin identity not found');
    }
    
    const existingSockets = Array.from(identity.activeSockets);
    const isNewConnection = !existingSockets.includes(newSocketId);
    
    // Add new socket if it's not already tracked
    if (isNewConnection) {
      this.store.addActiveSocket(adminId, newSocketId);
      this.socketToAdminMap.set(newSocketId, adminId);
    }
    
    return {
      isNewConnection,
      existingSocketCount: existingSockets.length,
      existingSockets
    };
  }

  /**
   * Notify all admin connections about a change
   * Used to broadcast updates to all sockets of the same admin
   */
  public notifyAdminConnections(
    adminId: string,
    callback: (socketId: string) => void
  ): void {
    const sockets = this.getAdminSockets(adminId);
    for (const socketId of sockets) {
      callback(socketId);
    }
  }





  /**
   * Get admin connection statistics
   */
  public getAdminConnectionStats(adminId: string): {
    activeConnections: number;
    ownedSessions: number;
    lastSeen: Date | null;
    createdAt: Date | null;
  } {
    const identity = this.store.getAdminIdentity(adminId);
    if (!identity) {
      return {
        activeConnections: 0,
        ownedSessions: 0,
        lastSeen: null,
        createdAt: null
      };
    }
    
    return {
      activeConnections: identity.activeSockets.size,
      ownedSessions: identity.ownedSessions.size,
      lastSeen: identity.lastSeen,
      createdAt: identity.createdAt
    };
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    // Clear all expiry warning timers
    for (const timer of this.expiryWarningTimers.values()) {
      clearTimeout(timer);
    }
    this.expiryWarningTimers.clear();
    
    // Clear all tokens from memory
    this.tokenStore.clearAll();
    
    // Stop cleanup scheduler in store
    this.store.stopCleanupScheduler();
  }

  /**
   * Delete an admin identity
   * Used when a user is deleted from Cognito
   */
  public deleteAdminIdentity(adminId: string): boolean {
    // Remove all active sockets
    const identity = this.store.getAdminIdentity(adminId);
    if (identity) {
      for (const socketId of identity.activeSockets) {
        this.socketToAdminMap.delete(socketId);
        this.tokenStore.removeToken(socketId);
      }
    }
    
    // Clear expiry warning timer
    this.clearExpiryWarningTimer(adminId);
    
    // Delete from store
    return this.store.deleteAdminIdentity(adminId);
  }
}
