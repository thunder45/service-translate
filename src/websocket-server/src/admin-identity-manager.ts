import * as jwt from 'jsonwebtoken';
import { AdminIdentityStore, AdminIdentity } from './admin-identity-store';
import { SessionData, AdminPermissions } from '../../shared/types';
import { JWTSecurityManager, JWTSecurityConfig } from './jwt-security';

/**
 * JWT Token Payload
 */
export interface JWTPayload {
  adminId: string;
  username: string;
  tokenVersion: number;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

/**
 * JWT Configuration
 */
export interface JWTConfig {
  secret: string;
  algorithm: 'HS256';
  issuer: string;
  audience: string;
  accessTokenExpiry: string;   // e.g., '1h'
  refreshTokenExpiry: string;  // e.g., '30d'
}

/**
 * Token pair returned on authentication
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiry: Date;
  refreshTokenExpiry: Date;
}

/**
 * AdminIdentityManager manages persistent admin identities and their relationship to sessions
 */
export class AdminIdentityManager {
  private store: AdminIdentityStore;
  private jwtConfig: JWTConfig;
  private jwtSecurity: JWTSecurityManager;
  private socketToAdminMap: Map<string, string>; // socketId -> adminId (in-memory)
  private expiryWarningTimers: Map<string, NodeJS.Timeout>; // adminId -> timer

  constructor(store: AdminIdentityStore, jwtConfig: JWTConfig, dataDir: string = './data') {
    this.store = store;
    this.jwtConfig = jwtConfig;
    
    // Initialize JWT security manager
    const jwtSecurityConfig: JWTSecurityConfig = {
      secret: jwtConfig.secret,
      algorithm: jwtConfig.algorithm,
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
      accessTokenExpiry: jwtConfig.accessTokenExpiry,
      refreshTokenExpiry: jwtConfig.refreshTokenExpiry,
      rotationPolicy: {
        enabled: false, // Can be configured via environment
        intervalDays: 90
      },
      blacklistEnabled: true,
      blacklistCleanupIntervalMs: 60 * 60 * 1000 // 1 hour
    };
    
    this.jwtSecurity = new JWTSecurityManager(jwtSecurityConfig, dataDir);
    this.socketToAdminMap = new Map();
    this.expiryWarningTimers = new Map();
  }

  /**
   * Register a new admin connection with credentials
   * Creates admin identity if it doesn't exist
   */
  public registerAdminConnection(username: string, socketId: string): AdminIdentity {
    // Get or create admin identity
    let identity = this.store.getAdminByUsername(username);
    
    if (!identity) {
      identity = this.store.createAdminIdentity(username);
    }
    
    // Add socket to active connections
    this.store.addActiveSocket(identity.adminId, socketId);
    this.socketToAdminMap.set(socketId, identity.adminId);
    
    // Update last seen
    this.store.updateLastSeen(identity.adminId);
    
    return identity;
  }

  /**
   * Register an admin connection using a valid JWT token
   * Validates token and retrieves admin identity
   */
  public registerAdminConnectionWithToken(token: string, socketId: string): AdminIdentity {
    const payload = this.validateAccessToken(token);
    
    const identity = this.store.getAdminIdentity(payload.adminId);
    if (!identity) {
      throw new Error('Admin identity not found');
    }
    
    // Verify token version matches
    if (payload.tokenVersion !== identity.tokenVersion) {
      throw new Error('Token has been invalidated');
    }
    
    // Add socket to active connections
    this.store.addActiveSocket(identity.adminId, socketId);
    this.socketToAdminMap.set(socketId, identity.adminId);
    
    // Update last seen
    this.store.updateLastSeen(identity.adminId);
    
    return identity;
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
   * Generate JWT access token for an admin
   */
  public generateAccessToken(adminId: string): string {
    const identity = this.store.getAdminIdentity(adminId);
    if (!identity) {
      throw new Error('Admin identity not found');
    }
    
    return this.jwtSecurity.generateAccessToken(
      identity.adminId,
      identity.username,
      identity.tokenVersion
    );
  }

  /**
   * Generate JWT refresh token for an admin
   */
  public generateRefreshToken(adminId: string): string {
    const identity = this.store.getAdminIdentity(adminId);
    if (!identity) {
      throw new Error('Admin identity not found');
    }
    
    const refreshToken = this.jwtSecurity.generateRefreshToken(
      identity.adminId,
      identity.username,
      identity.tokenVersion
    );
    
    // Store refresh token
    this.store.addRefreshToken(adminId, refreshToken);
    
    return refreshToken;
  }

  /**
   * Generate both access and refresh tokens
   */
  public generateTokenPair(adminId: string): TokenPair {
    const accessToken = this.generateAccessToken(adminId);
    const refreshToken = this.generateRefreshToken(adminId);
    
    // Decode to get expiry times
    const accessPayload = jwt.decode(accessToken) as JWTPayload;
    const refreshPayload = jwt.decode(refreshToken) as JWTPayload;
    
    return {
      accessToken,
      refreshToken,
      accessTokenExpiry: new Date(accessPayload.exp * 1000),
      refreshTokenExpiry: new Date(refreshPayload.exp * 1000)
    };
  }

  /**
   * Validate JWT access token
   */
  public validateAccessToken(token: string): JWTPayload {
    const result = this.jwtSecurity.validateToken(token);
    
    if (!result.valid) {
      throw new Error(result.error || 'Token validation failed');
    }
    
    if (!result.payload) {
      throw new Error('Token payload is missing');
    }
    
    return result.payload;
  }
  
  /**
   * Revoke a specific token
   */
  public revokeToken(token: string, reason?: string): boolean {
    return this.jwtSecurity.revokeToken(token, reason);
  }
  
  /**
   * Get JWT security manager for advanced operations
   */
  public getJWTSecurity(): JWTSecurityManager {
    return this.jwtSecurity;
  }

  /**
   * Validate and refresh tokens using refresh token
   */
  public refreshTokens(refreshToken: string): TokenPair {
    // Validate refresh token
    const payload = this.validateAccessToken(refreshToken);
    
    const identity = this.store.getAdminIdentity(payload.adminId);
    if (!identity) {
      throw new Error('Admin identity not found');
    }
    
    // Verify token version matches
    if (payload.tokenVersion !== identity.tokenVersion) {
      throw new Error('Token has been invalidated');
    }
    
    // Verify refresh token is in store
    if (!identity.refreshTokens.has(refreshToken)) {
      throw new Error('Refresh token not found or has been revoked');
    }
    
    // Remove old refresh token
    this.store.removeRefreshToken(payload.adminId, refreshToken);
    
    // Generate new token pair
    return this.generateTokenPair(payload.adminId);
  }

  /**
   * Revoke a specific refresh token
   */
  public revokeRefreshToken(adminId: string, refreshToken: string): void {
    this.store.removeRefreshToken(adminId, refreshToken);
  }

  /**
   * Invalidate all tokens for an admin (force re-authentication)
   */
  public invalidateAllTokens(adminId: string): void {
    this.store.invalidateAllTokens(adminId);
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
   * Check if token is about to expire
   * Returns true if token expires within the specified minutes
   */
  public isTokenExpiringSoon(token: string, withinMinutes: number = 5): boolean {
    try {
      const payload = jwt.decode(token) as JWTPayload;
      if (!payload || !payload.exp) {
        return false;
      }
      
      const expiryTime = payload.exp * 1000;
      const now = Date.now();
      const timeUntilExpiry = expiryTime - now;
      const minutesUntilExpiry = timeUntilExpiry / (60 * 1000);
      
      return minutesUntilExpiry <= withinMinutes && minutesUntilExpiry > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get token expiry time
   */
  public getTokenExpiry(token: string): Date | null {
    try {
      const payload = jwt.decode(token) as JWTPayload;
      if (!payload || !payload.exp) {
        return null;
      }
      
      return new Date(payload.exp * 1000);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get time remaining until token expiry in seconds
   */
  public getTokenTimeRemaining(token: string): number {
    const expiry = this.getTokenExpiry(token);
    if (!expiry) {
      return 0;
    }
    
    const now = Date.now();
    const timeRemaining = expiry.getTime() - now;
    
    return Math.max(0, Math.floor(timeRemaining / 1000));
  }

  /**
   * Validate token and check if it needs refresh
   * Returns status and recommendation
   */
  public checkTokenStatus(token: string): {
    isValid: boolean;
    isExpired: boolean;
    needsRefresh: boolean;
    timeRemaining: number;
    error?: string;
  } {
    try {
      const payload = this.validateAccessToken(token);
      const timeRemaining = this.getTokenTimeRemaining(token);
      const needsRefresh = timeRemaining < 300; // Less than 5 minutes
      
      return {
        isValid: true,
        isExpired: false,
        needsRefresh,
        timeRemaining
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isExpired = errorMessage.includes('expired');
      
      return {
        isValid: false,
        isExpired,
        needsRefresh: isExpired,
        timeRemaining: 0,
        error: errorMessage
      };
    }
  }

  /**
   * Handle token refresh with automatic cleanup
   * Removes old refresh token and generates new pair
   */
  public handleTokenRefresh(
    refreshToken: string,
    onSuccess?: (adminId: string, tokens: TokenPair) => void,
    onError?: (error: Error) => void
  ): TokenPair | null {
    try {
      const tokens = this.refreshTokens(refreshToken);
      
      // Get admin ID from new token
      const payload = jwt.decode(tokens.accessToken) as JWTPayload;
      
      if (onSuccess) {
        onSuccess(payload.adminId, tokens);
      }
      
      return tokens;
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error : new Error('Token refresh failed'));
      }
      return null;
    }
  }

  /**
   * Schedule automatic token refresh
   * Attempts to refresh token before it expires
   */
  public scheduleAutoRefresh(
    adminId: string,
    refreshToken: string,
    tokenExpiry: Date,
    callback: (adminId: string, tokens: TokenPair | null, error?: Error) => void
  ): void {
    const now = Date.now();
    const expiryTime = tokenExpiry.getTime();
    const refreshTime = expiryTime - (10 * 60 * 1000); // 10 minutes before expiry
    const delay = refreshTime - now;
    
    // Only schedule if refresh time is in the future
    if (delay > 0) {
      setTimeout(() => {
        this.handleTokenRefresh(
          refreshToken,
          (adminId, tokens) => callback(adminId, tokens),
          (error) => callback(adminId, null, error)
        );
      }, delay);
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
    
    // Cleanup JWT security manager
    this.jwtSecurity.cleanup();
    
    // Stop cleanup scheduler in store
    this.store.stopCleanupScheduler();
  }
}
