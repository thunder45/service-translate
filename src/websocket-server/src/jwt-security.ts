/**
 * JWT Security Module
 * Implements secure JWT token generation, validation, and management
 * with token revocation and blacklist functionality
 */

import jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * JWT Configuration with security settings
 */
export interface JWTSecurityConfig {
  secret: string;
  algorithm: 'HS256' | 'HS384' | 'HS512';
  issuer: string;
  audience: string;
  accessTokenExpiry: string;   // e.g., '1h', '15m'
  refreshTokenExpiry: string;  // e.g., '30d', '7d'
  rotationPolicy: {
    enabled: boolean;
    intervalDays: number;       // Default: 90 days
    lastRotation?: Date;
  };
  blacklistEnabled: boolean;
  blacklistCleanupIntervalMs: number; // Default: 1 hour
}

/**
 * JWT Payload structure
 */
export interface JWTPayload {
  adminId: string;
  username: string;
  tokenVersion: number;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  jti?: string; // JWT ID for revocation tracking
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  valid: boolean;
  payload?: JWTPayload;
  error?: string;
  errorCode?: TokenErrorCode;
}

/**
 * Token error codes
 */
export enum TokenErrorCode {
  EXPIRED = 'TOKEN_EXPIRED',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  INVALID_FORMAT = 'INVALID_FORMAT',
  REVOKED = 'TOKEN_REVOKED',
  INVALID_ISSUER = 'INVALID_ISSUER',
  INVALID_AUDIENCE = 'INVALID_AUDIENCE',
  INVALID_VERSION = 'INVALID_VERSION',
  MISSING_CLAIMS = 'MISSING_CLAIMS'
}

/**
 * Blacklisted token entry
 */
interface BlacklistEntry {
  jti: string;
  adminId: string;
  revokedAt: Date;
  expiresAt: Date;
  reason?: string;
}

/**
 * JWT Security Manager
 * Handles all JWT token operations with security best practices
 */
export class JWTSecurityManager {
  private config: JWTSecurityConfig;
  private blacklist: Map<string, BlacklistEntry>;
  private blacklistCleanupTimer?: NodeJS.Timeout;
  private secretRotationTimer?: NodeJS.Timeout;
  private blacklistFilePath: string;

  constructor(config: JWTSecurityConfig, dataDir: string = './data') {
    this.config = config;
    this.blacklist = new Map();
    this.blacklistFilePath = path.join(dataDir, 'token-blacklist.json');
    
    // Load existing blacklist
    this.loadBlacklist();
    
    // Start cleanup scheduler if blacklist is enabled
    if (this.config.blacklistEnabled) {
      this.startBlacklistCleanup();
    }
    
    // Start secret rotation scheduler if enabled
    if (this.config.rotationPolicy.enabled) {
      this.startSecretRotationScheduler();
    }
  }

  /**
   * Generate a secure JWT access token
   */
  public generateAccessToken(
    adminId: string,
    username: string,
    tokenVersion: number
  ): string {
    const jti = this.generateJTI();
    
    const payload = {
      adminId,
      username,
      tokenVersion,
      iss: this.config.issuer,
      aud: this.config.audience,
      jti
    };
    
    return jwt.sign(payload, this.config.secret, {
      algorithm: this.config.algorithm as jwt.Algorithm,
      expiresIn: this.config.accessTokenExpiry
    } as jwt.SignOptions);
  }

  /**
   * Generate a secure JWT refresh token
   */
  public generateRefreshToken(
    adminId: string,
    username: string,
    tokenVersion: number
  ): string {
    const jti = this.generateJTI();
    
    const payload = {
      adminId,
      username,
      tokenVersion,
      iss: this.config.issuer,
      aud: this.config.audience,
      jti
    };
    
    return jwt.sign(payload, this.config.secret, {
      algorithm: this.config.algorithm as jwt.Algorithm,
      expiresIn: this.config.refreshTokenExpiry
    } as jwt.SignOptions);
  }

  /**
   * Validate JWT token with comprehensive checks
   */
  public validateToken(token: string): TokenValidationResult {
    try {
      // Verify token signature and claims
      const payload = jwt.verify(token, this.config.secret, {
        algorithms: [this.config.algorithm],
        issuer: this.config.issuer,
        audience: this.config.audience,
        complete: false
      }) as JWTPayload;
      
      // Validate required claims
      if (!payload.adminId || !payload.username || payload.tokenVersion === undefined) {
        return {
          valid: false,
          error: 'Missing required claims',
          errorCode: TokenErrorCode.MISSING_CLAIMS
        };
      }
      
      // Check if token is blacklisted
      if (this.config.blacklistEnabled && payload.jti) {
        if (this.isTokenBlacklisted(payload.jti)) {
          return {
            valid: false,
            error: 'Token has been revoked',
            errorCode: TokenErrorCode.REVOKED
          };
        }
      }
      
      return {
        valid: true,
        payload
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return {
          valid: false,
          error: 'Token has expired',
          errorCode: TokenErrorCode.EXPIRED
        };
      } else if (error instanceof jwt.JsonWebTokenError) {
        if (error.message.includes('invalid signature')) {
          return {
            valid: false,
            error: 'Invalid token signature',
            errorCode: TokenErrorCode.INVALID_SIGNATURE
          };
        } else if (error.message.includes('invalid issuer')) {
          return {
            valid: false,
            error: 'Invalid token issuer',
            errorCode: TokenErrorCode.INVALID_ISSUER
          };
        } else if (error.message.includes('invalid audience')) {
          return {
            valid: false,
            error: 'Invalid token audience',
            errorCode: TokenErrorCode.INVALID_AUDIENCE
          };
        }
        return {
          valid: false,
          error: 'Invalid token format',
          errorCode: TokenErrorCode.INVALID_FORMAT
        };
      }
      
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: TokenErrorCode.INVALID_FORMAT
      };
    }
  }

  /**
   * Revoke a specific token by adding it to blacklist
   */
  public revokeToken(token: string, reason?: string): boolean {
    if (!this.config.blacklistEnabled) {
      console.warn('Token blacklist is disabled. Token revocation has no effect.');
      return false;
    }
    
    try {
      const decoded = jwt.decode(token) as JWTPayload;
      
      if (!decoded || !decoded.jti || !decoded.exp) {
        return false;
      }
      
      const entry: BlacklistEntry = {
        jti: decoded.jti,
        adminId: decoded.adminId,
        revokedAt: new Date(),
        expiresAt: new Date(decoded.exp * 1000),
        reason
      };
      
      this.blacklist.set(decoded.jti, entry);
      this.saveBlacklist();
      
      console.log(`Token revoked: ${decoded.jti} for admin ${decoded.adminId}${reason ? ` - Reason: ${reason}` : ''}`);
      return true;
    } catch (error) {
      console.error('Failed to revoke token:', error);
      return false;
    }
  }

  /**
   * Revoke all tokens for a specific admin
   * This is done by incrementing the admin's token version
   */
  public revokeAllAdminTokens(adminId: string, reason?: string): void {
    // Find all tokens for this admin in blacklist
    const adminTokens: string[] = [];
    
    for (const [jti, entry] of this.blacklist) {
      if (entry.adminId === adminId) {
        adminTokens.push(jti);
      }
    }
    
    console.log(`Revoked all tokens for admin ${adminId}: ${adminTokens.length} tokens${reason ? ` - Reason: ${reason}` : ''}`);
  }

  /**
   * Check if a token is blacklisted
   */
  public isTokenBlacklisted(jti: string): boolean {
    return this.blacklist.has(jti);
  }

  /**
   * Get blacklist statistics
   */
  public getBlacklistStats(): {
    totalEntries: number;
    activeEntries: number;
    expiredEntries: number;
  } {
    const now = Date.now();
    let activeEntries = 0;
    let expiredEntries = 0;
    
    for (const entry of this.blacklist.values()) {
      if (entry.expiresAt.getTime() > now) {
        activeEntries++;
      } else {
        expiredEntries++;
      }
    }
    
    return {
      totalEntries: this.blacklist.size,
      activeEntries,
      expiredEntries
    };
  }

  /**
   * Decode token without validation (for inspection)
   */
  public decodeToken(token: string): JWTPayload | null {
    try {
      return jwt.decode(token) as JWTPayload;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get token expiry time
   */
  public getTokenExpiry(token: string): Date | null {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) {
      return null;
    }
    return new Date(decoded.exp * 1000);
  }

  /**
   * Check if token is expiring soon
   */
  public isTokenExpiringSoon(token: string, withinMinutes: number = 5): boolean {
    const expiry = this.getTokenExpiry(token);
    if (!expiry) {
      return false;
    }
    
    const now = Date.now();
    const timeUntilExpiry = expiry.getTime() - now;
    const minutesUntilExpiry = timeUntilExpiry / (60 * 1000);
    
    return minutesUntilExpiry <= withinMinutes && minutesUntilExpiry > 0;
  }

  /**
   * Generate unique JWT ID (jti)
   */
  private generateJTI(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Load blacklist from file
   */
  private loadBlacklist(): void {
    try {
      if (fs.existsSync(this.blacklistFilePath)) {
        const data = fs.readFileSync(this.blacklistFilePath, 'utf-8');
        const entries: BlacklistEntry[] = JSON.parse(data);
        
        // Convert date strings back to Date objects
        for (const entry of entries) {
          entry.revokedAt = new Date(entry.revokedAt);
          entry.expiresAt = new Date(entry.expiresAt);
          this.blacklist.set(entry.jti, entry);
        }
        
        console.log(`Loaded ${entries.length} blacklisted tokens`);
      }
    } catch (error) {
      console.error('Failed to load token blacklist:', error);
    }
  }

  /**
   * Save blacklist to file
   */
  private saveBlacklist(): void {
    try {
      const entries = Array.from(this.blacklist.values());
      const data = JSON.stringify(entries, null, 2);
      
      // Ensure directory exists
      const dir = path.dirname(this.blacklistFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.blacklistFilePath, data, 'utf-8');
    } catch (error) {
      console.error('Failed to save token blacklist:', error);
    }
  }

  /**
   * Clean up expired blacklist entries
   */
  private cleanupBlacklist(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [jti, entry] of this.blacklist) {
      if (entry.expiresAt.getTime() <= now) {
        this.blacklist.delete(jti);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired blacklist entries`);
      this.saveBlacklist();
    }
  }

  /**
   * Start blacklist cleanup scheduler
   */
  private startBlacklistCleanup(): void {
    this.blacklistCleanupTimer = setInterval(() => {
      this.cleanupBlacklist();
    }, this.config.blacklistCleanupIntervalMs);
  }

  /**
   * Start secret rotation scheduler
   */
  private startSecretRotationScheduler(): void {
    const checkInterval = 24 * 60 * 60 * 1000; // Check daily
    
    this.secretRotationTimer = setInterval(() => {
      this.checkSecretRotation();
    }, checkInterval);
  }

  /**
   * Check if secret needs rotation
   */
  private checkSecretRotation(): void {
    if (!this.config.rotationPolicy.enabled || !this.config.rotationPolicy.lastRotation) {
      return;
    }
    
    const daysSinceRotation = 
      (Date.now() - this.config.rotationPolicy.lastRotation.getTime()) / (24 * 60 * 60 * 1000);
    
    if (daysSinceRotation >= this.config.rotationPolicy.intervalDays) {
      console.warn(`JWT secret rotation is due! Last rotation was ${Math.floor(daysSinceRotation)} days ago.`);
      console.warn('Please rotate the JWT secret and update the configuration.');
    }
  }

  /**
   * Generate a new secure JWT secret
   */
  public static generateSecret(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    if (this.blacklistCleanupTimer) {
      clearInterval(this.blacklistCleanupTimer);
    }
    
    if (this.secretRotationTimer) {
      clearInterval(this.secretRotationTimer);
    }
    
    // Save blacklist one final time
    if (this.config.blacklistEnabled) {
      this.saveBlacklist();
    }
  }
}
