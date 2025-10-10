/**
 * Token Store - In-Memory Token Storage for WebSocket Server
 * 
 * Stores Cognito access tokens in memory only (no persistence).
 * Tokens are lost on server restart, requiring re-authentication.
 * Automatically checks token expiry when retrieving tokens.
 */

interface StoredToken {
  accessToken: string;
  adminId: string;
  expiresAt: Date;
}

export class TokenStore {
  // In-memory storage only - cleared on server restart
  private activeTokens: Map<string, StoredToken> = new Map();

  /**
   * Store a Cognito access token for a socket connection
   * @param socketId - WebSocket connection ID
   * @param accessToken - Cognito access token
   * @param adminId - Cognito user ID (sub)
   * @param expiresIn - Token expiry time in seconds
   */
  storeToken(socketId: string, accessToken: string, adminId: string, expiresIn: number): void {
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    
    this.activeTokens.set(socketId, {
      accessToken,
      adminId,
      expiresAt
    });
  }

  /**
   * Retrieve a stored token for a socket connection
   * Automatically checks expiry and removes expired tokens
   * @param socketId - WebSocket connection ID
   * @returns Access token if valid and not expired, null otherwise
   */
  getToken(socketId: string): string | null {
    const token = this.activeTokens.get(socketId);
    
    if (!token) {
      return null;
    }
    
    // Check if token has expired
    if (token.expiresAt < new Date()) {
      // Token expired, remove it
      this.activeTokens.delete(socketId);
      return null;
    }
    
    return token.accessToken;
  }

  /**
   * Get admin ID associated with a socket connection
   * @param socketId - WebSocket connection ID
   * @returns Admin ID if token exists and is valid, null otherwise
   */
  getAdminId(socketId: string): string | null {
    const token = this.activeTokens.get(socketId);
    
    if (!token) {
      return null;
    }
    
    // Check if token has expired
    if (token.expiresAt < new Date()) {
      this.activeTokens.delete(socketId);
      return null;
    }
    
    return token.adminId;
  }

  /**
   * Remove a token for a socket connection
   * Called on disconnect or logout
   * @param socketId - WebSocket connection ID
   */
  removeToken(socketId: string): void {
    this.activeTokens.delete(socketId);
  }

  /**
   * Remove all tokens for a specific admin
   * Used when admin is deleted from Cognito
   * @param adminId - Cognito user ID (sub)
   * @returns Number of tokens removed
   */
  removeTokensByAdminId(adminId: string): number {
    let removedCount = 0;
    
    for (const [socketId, token] of this.activeTokens.entries()) {
      if (token.adminId === adminId) {
        this.activeTokens.delete(socketId);
        removedCount++;
      }
    }
    
    return removedCount;
  }

  /**
   * Clean up expired tokens
   * Should be called periodically to prevent memory leaks
   * @returns Number of expired tokens removed
   */
  cleanupExpiredTokens(): number {
    let removedCount = 0;
    const now = new Date();
    
    for (const [socketId, token] of this.activeTokens.entries()) {
      if (token.expiresAt < now) {
        this.activeTokens.delete(socketId);
        removedCount++;
      }
    }
    
    return removedCount;
  }

  /**
   * Get count of active tokens
   * Useful for monitoring and debugging
   */
  getActiveTokenCount(): number {
    return this.activeTokens.size;
  }

  /**
   * Clear all tokens
   * Used for testing or emergency shutdown
   */
  clearAll(): void {
    this.activeTokens.clear();
  }
}
