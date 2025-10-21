/**
 * Secure Token Storage - Encrypted File Storage for Capture App
 * 
 * Stores Cognito tokens in encrypted file storage using Electron safeStorage.
 * Tokens persist across app restarts for better UX.
 * Uses OS-level encryption (Keychain on macOS, DPAPI on Windows, libsecret on Linux).
 */

import { safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

interface CognitoTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresAt: Date;
  username?: string;  // Optional: store username for display
}

export class SecureTokenStorage {
  private tokenFilePath: string;

  /**
   * Initialize secure token storage
   * @param appDataPath - Path to app data directory (e.g., app.getPath('userData'))
   */
  constructor(appDataPath: string) {
    this.tokenFilePath = path.join(appDataPath, 'cognito-tokens.enc');
  }

  /**
   * Store Cognito tokens encrypted using Electron safeStorage
   * Uses OS-level encryption for maximum security
   * @param tokens - Cognito tokens to store
   */
  storeTokens(tokens: CognitoTokens): void {
    try {
      // Check if safeStorage is available
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Encryption is not available on this system');
      }

      // Serialize tokens to JSON
      const tokenData = JSON.stringify({
        accessToken: tokens.accessToken,
        idToken: tokens.idToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt.toISOString(),
        username: tokens.username,
        storedAt: new Date().toISOString()
      });

      // Encrypt using OS-level encryption
      const encrypted = safeStorage.encryptString(tokenData);

      // Write encrypted data to file
      fs.writeFileSync(this.tokenFilePath, encrypted);
    } catch (error) {
      console.error('Failed to store tokens:', error);
      throw new Error(`Token storage failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load and decrypt stored tokens
   * Automatically checks if tokens have expired
   * @returns Decrypted tokens if valid, null if not found or expired
   */
  loadTokens(): CognitoTokens | null {
    try {
      // Check if token file exists
      if (!fs.existsSync(this.tokenFilePath)) {
        return null;
      }

      // Check if safeStorage is available
      if (!safeStorage.isEncryptionAvailable()) {
        console.warn('Encryption is not available, cannot decrypt tokens');
        return null;
      }

      // Read encrypted data
      const encrypted = fs.readFileSync(this.tokenFilePath);

      // Decrypt using OS-level decryption
      const decrypted = safeStorage.decryptString(encrypted);

      // Parse JSON
      const tokenData = JSON.parse(decrypted);

      // Convert ISO string back to Date
      const expiresAt = new Date(tokenData.expiresAt);

      // Check if access token has expired
      if (expiresAt < new Date()) {
        console.log('Stored access token has expired - clearing tokens');
        // Clear expired tokens to force fresh login
        // Refresh token cannot be used here without proper Cognito refresh flow
        this.clearTokens();
        return null;
      }

      return {
        accessToken: tokenData.accessToken,
        idToken: tokenData.idToken,
        refreshToken: tokenData.refreshToken,
        expiresAt,
        username: tokenData.username
      };
    } catch (error) {
      console.error('Failed to load tokens:', error);
      // If decryption fails, clear the corrupted file
      this.clearTokens();
      return null;
    }
  }

  /**
   * Clear stored tokens
   * Called on logout or when tokens are invalid
   */
  clearTokens(): void {
    try {
      if (fs.existsSync(this.tokenFilePath)) {
        fs.unlinkSync(this.tokenFilePath);
      }
    } catch (error) {
      console.error('Failed to clear tokens:', error);
      // Don't throw - clearing tokens should always succeed
    }
  }

  /**
   * Check if tokens are stored
   * @returns true if token file exists, false otherwise
   */
  hasStoredTokens(): boolean {
    return fs.existsSync(this.tokenFilePath);
  }

  /**
   * Get token expiry time
   * @returns Expiry date if tokens exist, null otherwise
   */
  getTokenExpiry(): Date | null {
    const tokens = this.loadTokens();
    return tokens ? tokens.expiresAt : null;
  }

  /**
   * Check if access token is expired
   * @returns true if expired or no tokens, false if still valid
   */
  isAccessTokenExpired(): boolean {
    const tokens = this.loadTokens();
    if (!tokens) {
      return true;
    }
    return tokens.expiresAt < new Date();
  }

  /**
   * Check if access token will expire soon
   * Default threshold of 10 minutes matches Requirement 6.7:
   * "Client checks token expiry every 5 minutes and refreshes if less than 10 minutes remaining"
   * @param minutesThreshold - Minutes before expiry to consider "soon" (default: 10)
   * @returns true if token expires within threshold, false otherwise
   */
  willExpireSoon(minutesThreshold: number = 10): boolean {
    const tokens = this.loadTokens();
    if (!tokens) {
      return true;
    }

    const thresholdMs = minutesThreshold * 60 * 1000;
    const expiresIn = tokens.expiresAt.getTime() - Date.now();
    
    return expiresIn < thresholdMs;
  }

  /**
   * Update only the access token and expiry
   * Used after token refresh (refresh token stays the same)
   * @param accessToken - New access token
   * @param expiresIn - Token expiry in seconds
   */
  updateAccessToken(accessToken: string, expiresIn: number): void {
    const existingTokens = this.loadTokens();
    
    if (!existingTokens) {
      throw new Error('Cannot update access token: no tokens stored');
    }

    // Update access token and expiry, keep other tokens
    this.storeTokens({
      accessToken,
      idToken: existingTokens.idToken,
      refreshToken: existingTokens.refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      username: existingTokens.username
    });
  }
}
