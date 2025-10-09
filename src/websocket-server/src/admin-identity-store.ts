import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import lockfile from 'proper-lockfile';

/**
 * AdminIdentity represents a persistent admin user identity
 */
export interface AdminIdentity {
  adminId: string;           // UUID v4 persistent identifier
  username: string;          // Display name (unique)
  createdAt: Date;
  lastSeen: Date;
  activeSockets: Set<string>; // Current socket connections (not persisted)
  ownedSessions: Set<string>; // Sessions created by this admin
  tokenVersion: number;       // For token invalidation
  refreshTokens: Set<string>; // Active refresh tokens
}

/**
 * Serializable version of AdminIdentity for JSON storage
 */
interface SerializedAdminIdentity {
  adminId: string;
  username: string;
  createdAt: string;
  lastSeen: string;
  ownedSessions: string[];
  tokenVersion: number;
  refreshTokens: string[];
}

/**
 * Index mapping usernames to admin IDs
 */
interface AdminIndex {
  version: number;
  lastUpdated: string;
  usernameToAdminId: Record<string, string>;
}

/**
 * Cleanup log entry
 */
interface CleanupLogEntry {
  timestamp: string;
  cleanedCount: number;
  cleanedAdmins: Array<{
    adminId: string;
    username: string;
    lastSeen: string;
    reason: string;
  }>;
}

/**
 * AdminIdentityStore manages persistent admin identities with file-based storage
 */
export class AdminIdentityStore {
  private identitiesDir: string;
  private indexPath: string;
  private cleanupLogPath: string;
  private identities: Map<string, AdminIdentity>;
  private usernameIndex: Map<string, string>;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private lockOptions = {
    stale: 10000,        // 10 seconds - consider lock stale after this
    retries: 3,          // Retry 3 times before failing
    retryDelay: 100      // Wait 100ms between retries
  };

  constructor(baseDir: string = './admin-identities') {
    this.identitiesDir = path.resolve(baseDir);
    this.indexPath = path.join(this.identitiesDir, 'admin-index.json');
    this.cleanupLogPath = path.join(this.identitiesDir, 'cleanup-log.json');
    this.identities = new Map();
    this.usernameIndex = new Map();
    
    this.ensureDirectoryExists();
    this.loadAllIdentities();
    this.startCleanupScheduler();
  }

  /**
   * Ensure the admin identities directory exists
   */
  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.identitiesDir)) {
      fs.mkdirSync(this.identitiesDir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Load all admin identities from disk on startup
   */
  private loadAllIdentities(): void {
    try {
      // Load index first
      this.loadIndex();
      
      // Load all identity files
      const files = fs.readdirSync(this.identitiesDir);
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'admin-index.json' && file !== 'cleanup-log.json') {
          const adminId = file.replace('.json', '');
          try {
            this.loadIdentity(adminId);
          } catch (error) {
            console.error(`Failed to load admin identity ${adminId}:`, error);
          }
        }
      }
      
      // Rebuild index if corrupted
      if (this.usernameIndex.size !== this.identities.size) {
        console.warn('Username index corrupted, rebuilding...');
        this.rebuildIndex();
      }
    } catch (error) {
      console.error('Failed to load admin identities:', error);
      // Initialize empty index if loading fails
      this.usernameIndex.clear();
    }
  }

  /**
   * Load the username index from disk
   */
  private loadIndex(): void {
    try {
      if (fs.existsSync(this.indexPath)) {
        const data = fs.readFileSync(this.indexPath, 'utf-8');
        const index: AdminIndex = JSON.parse(data);
        this.usernameIndex = new Map(Object.entries(index.usernameToAdminId));
      }
    } catch (error) {
      console.error('Failed to load admin index:', error);
      this.usernameIndex.clear();
    }
  }

  /**
   * Save the username index to disk
   */
  private saveIndex(): void {
    const index: AdminIndex = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      usernameToAdminId: Object.fromEntries(this.usernameIndex)
    };
    
    this.writeFileAtomic(this.indexPath, JSON.stringify(index, null, 2));
  }

  /**
   * Rebuild the username index from loaded identities
   */
  private rebuildIndex(): void {
    this.usernameIndex.clear();
    for (const [adminId, identity] of this.identities) {
      this.usernameIndex.set(identity.username, adminId);
    }
    this.saveIndex();
  }

  /**
   * Load a single admin identity from disk
   */
  private loadIdentity(adminId: string): AdminIdentity | null {
    const filePath = this.getIdentityFilePath(adminId);
    
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      
      const data = fs.readFileSync(filePath, 'utf-8');
      const serialized: SerializedAdminIdentity = JSON.parse(data);
      
      const identity: AdminIdentity = {
        adminId: serialized.adminId,
        username: serialized.username,
        createdAt: new Date(serialized.createdAt),
        lastSeen: new Date(serialized.lastSeen),
        activeSockets: new Set(),
        ownedSessions: new Set(serialized.ownedSessions),
        tokenVersion: serialized.tokenVersion,
        refreshTokens: new Set(serialized.refreshTokens)
      };
      
      this.identities.set(adminId, identity);
      this.usernameIndex.set(identity.username, adminId);
      
      return identity;
    } catch (error) {
      console.error(`Failed to load identity ${adminId}:`, error);
      return null;
    }
  }

  /**
   * Save a single admin identity to disk with atomic write
   */
  private saveIdentity(identity: AdminIdentity): void {
    const filePath = this.getIdentityFilePath(identity.adminId);
    
    const serialized: SerializedAdminIdentity = {
      adminId: identity.adminId,
      username: identity.username,
      createdAt: identity.createdAt.toISOString(),
      lastSeen: identity.lastSeen.toISOString(),
      ownedSessions: Array.from(identity.ownedSessions),
      tokenVersion: identity.tokenVersion,
      refreshTokens: Array.from(identity.refreshTokens)
    };
    
    this.writeFileAtomic(filePath, JSON.stringify(serialized, null, 2));
  }

  /**
   * Write file atomically using temporary file and rename
   */
  private writeFileAtomic(filePath: string, content: string): void {
    const tempPath = `${filePath}.tmp`;
    const backupPath = `${filePath}.backup`;
    
    try {
      // Create backup if file exists
      if (fs.existsSync(filePath)) {
        fs.copyFileSync(filePath, backupPath);
      }
      
      // Write to temporary file
      fs.writeFileSync(tempPath, content, { mode: 0o600 });
      
      // Atomic rename
      fs.renameSync(tempPath, filePath);
      
      // Remove backup on success
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
    } catch (error) {
      // Restore from backup on failure
      if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, filePath);
        fs.unlinkSync(backupPath);
      }
      
      // Clean up temp file
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      
      throw error;
    }
  }

  /**
   * Get the file path for an admin identity
   */
  private getIdentityFilePath(adminId: string): string {
    return path.join(this.identitiesDir, `${adminId}.json`);
  }

  /**
   * Acquire a lock on an identity file
   */
  private async lockIdentityFile(adminId: string): Promise<() => Promise<void>> {
    const filePath = this.getIdentityFilePath(adminId);
    
    // Ensure file exists for locking
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '{}', { mode: 0o600 });
    }
    
    return await lockfile.lock(filePath, this.lockOptions);
  }

  /**
   * Create a new admin identity
   */
  public createAdminIdentity(username: string): AdminIdentity {
    // Check if username already exists
    if (this.usernameIndex.has(username)) {
      throw new Error(`Admin with username '${username}' already exists`);
    }
    
    const adminId = uuidv4();
    const now = new Date();
    
    const identity: AdminIdentity = {
      adminId,
      username,
      createdAt: now,
      lastSeen: now,
      activeSockets: new Set(),
      ownedSessions: new Set(),
      tokenVersion: 1,
      refreshTokens: new Set()
    };
    
    // Save to memory and disk
    this.identities.set(adminId, identity);
    this.usernameIndex.set(username, adminId);
    this.saveIdentity(identity);
    this.saveIndex();
    
    return identity;
  }

  /**
   * Get an admin identity by ID
   */
  public getAdminIdentity(adminId: string): AdminIdentity | null {
    return this.identities.get(adminId) || null;
  }

  /**
   * Get an admin identity by username
   */
  public getAdminByUsername(username: string): AdminIdentity | null {
    const adminId = this.usernameIndex.get(username);
    if (!adminId) {
      return null;
    }
    return this.getAdminIdentity(adminId);
  }

  /**
   * Update last seen timestamp for an admin
   */
  public updateLastSeen(adminId: string): void {
    const identity = this.identities.get(adminId);
    if (!identity) {
      throw new Error(`Admin identity ${adminId} not found`);
    }
    
    identity.lastSeen = new Date();
    this.saveIdentity(identity);
  }

  /**
   * Delete an admin identity
   */
  public deleteAdminIdentity(adminId: string): boolean {
    const identity = this.identities.get(adminId);
    if (!identity) {
      return false;
    }
    
    // Remove from memory
    this.identities.delete(adminId);
    this.usernameIndex.delete(identity.username);
    
    // Remove from disk
    const filePath = this.getIdentityFilePath(adminId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Update index
    this.saveIndex();
    
    return true;
  }

  /**
   * Add an active socket to an admin identity (in-memory only)
   */
  public addActiveSocket(adminId: string, socketId: string): void {
    const identity = this.identities.get(adminId);
    if (!identity) {
      throw new Error(`Admin identity ${adminId} not found`);
    }
    
    identity.activeSockets.add(socketId);
    this.updateLastSeen(adminId);
  }

  /**
   * Remove an active socket from an admin identity (in-memory only)
   */
  public removeActiveSocket(adminId: string, socketId: string): void {
    const identity = this.identities.get(adminId);
    if (!identity) {
      return;
    }
    
    identity.activeSockets.delete(socketId);
  }

  /**
   * Add an owned session to an admin identity
   */
  public addOwnedSession(adminId: string, sessionId: string): void {
    const identity = this.identities.get(adminId);
    if (!identity) {
      throw new Error(`Admin identity ${adminId} not found`);
    }
    
    identity.ownedSessions.add(sessionId);
    this.saveIdentity(identity);
  }

  /**
   * Remove an owned session from an admin identity
   */
  public removeOwnedSession(adminId: string, sessionId: string): void {
    const identity = this.identities.get(adminId);
    if (!identity) {
      return;
    }
    
    identity.ownedSessions.delete(sessionId);
    this.saveIdentity(identity);
  }

  /**
   * Add a refresh token to an admin identity
   */
  public addRefreshToken(adminId: string, refreshToken: string): void {
    const identity = this.identities.get(adminId);
    if (!identity) {
      throw new Error(`Admin identity ${adminId} not found`);
    }
    
    identity.refreshTokens.add(refreshToken);
    this.saveIdentity(identity);
  }

  /**
   * Remove a refresh token from an admin identity
   */
  public removeRefreshToken(adminId: string, refreshToken: string): void {
    const identity = this.identities.get(adminId);
    if (!identity) {
      return;
    }
    
    identity.refreshTokens.delete(refreshToken);
    this.saveIdentity(identity);
  }

  /**
   * Invalidate all tokens for an admin identity
   */
  public invalidateAllTokens(adminId: string): void {
    const identity = this.identities.get(adminId);
    if (!identity) {
      throw new Error(`Admin identity ${adminId} not found`);
    }
    
    identity.tokenVersion++;
    identity.refreshTokens.clear();
    this.saveIdentity(identity);
  }

  /**
   * Get all admin identities
   */
  public getAllAdminIdentities(): AdminIdentity[] {
    return Array.from(this.identities.values());
  }

  /**
   * Clean up inactive admin identities (90-day retention)
   */
  public cleanupInactiveIdentities(): number {
    const now = new Date();
    const retentionDays = 90;
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
    let cleanedCount = 0;
    const cleanedAdmins: Array<{ adminId: string; username: string; lastSeen: string; reason: string }> = [];
    
    for (const [adminId, identity] of this.identities) {
      const inactiveDuration = now.getTime() - identity.lastSeen.getTime();
      
      // Only cleanup if no owned sessions and inactive for 90 days
      if (identity.ownedSessions.size === 0 && inactiveDuration > retentionMs) {
        console.log(`Cleaning up inactive admin identity: ${identity.username} (${adminId})`);
        cleanedAdmins.push({
          adminId: identity.adminId,
          username: identity.username,
          lastSeen: identity.lastSeen.toISOString(),
          reason: 'Inactive for 90+ days with no owned sessions'
        });
        this.deleteAdminIdentity(adminId);
        cleanedCount++;
      }
    }
    
    // Log cleanup operation
    if (cleanedCount > 0) {
      this.logCleanup(cleanedCount, cleanedAdmins);
    }
    
    return cleanedCount;
  }

  /**
   * Clean up expired refresh tokens for all admin identities
   */
  public cleanupExpiredTokens(tokenExpiryMs: number = 30 * 24 * 60 * 60 * 1000): number {
    // Note: This is a placeholder for token cleanup
    // Actual token expiry validation would require storing token creation timestamps
    // For now, we'll just clear tokens for inactive admins
    let cleanedCount = 0;
    
    for (const [adminId, identity] of this.identities) {
      if (identity.refreshTokens.size > 0) {
        // Clear tokens for admins inactive for more than token expiry period
        const inactiveDuration = Date.now() - identity.lastSeen.getTime();
        if (inactiveDuration > tokenExpiryMs) {
          const tokenCount = identity.refreshTokens.size;
          identity.refreshTokens.clear();
          this.saveIdentity(identity);
          cleanedCount += tokenCount;
          console.log(`Cleaned ${tokenCount} expired tokens for admin ${identity.username}`);
        }
      }
    }
    
    return cleanedCount;
  }

  /**
   * Handle orphaned sessions for deleted admins
   * Returns list of session IDs that need to be reassigned
   */
  public getOrphanedSessions(existingSessionIds: Set<string>): string[] {
    const orphanedSessions: string[] = [];
    
    for (const [adminId, identity] of this.identities) {
      for (const sessionId of identity.ownedSessions) {
        if (!existingSessionIds.has(sessionId)) {
          // Session no longer exists, remove from admin's owned sessions
          identity.ownedSessions.delete(sessionId);
          this.saveIdentity(identity);
        }
      }
    }
    
    // Check for sessions that exist but have no owner
    for (const sessionId of existingSessionIds) {
      let hasOwner = false;
      for (const identity of this.identities.values()) {
        if (identity.ownedSessions.has(sessionId)) {
          hasOwner = true;
          break;
        }
      }
      if (!hasOwner) {
        orphanedSessions.push(sessionId);
      }
    }
    
    return orphanedSessions;
  }

  /**
   * Reassign orphaned sessions to system admin
   */
  public reassignOrphanedSessions(sessionIds: string[], systemAdminId: string): void {
    const systemAdmin = this.identities.get(systemAdminId);
    if (!systemAdmin) {
      console.error(`System admin ${systemAdminId} not found, cannot reassign orphaned sessions`);
      return;
    }
    
    for (const sessionId of sessionIds) {
      systemAdmin.ownedSessions.add(sessionId);
      console.log(`Reassigned orphaned session ${sessionId} to system admin`);
    }
    
    this.saveIdentity(systemAdmin);
  }

  /**
   * Start the daily cleanup scheduler
   */
  private startCleanupScheduler(): void {
    // Run cleanup immediately on startup
    this.runScheduledCleanup();
    
    // Schedule cleanup to run every 24 hours
    const twentyFourHours = 24 * 60 * 60 * 1000;
    this.cleanupInterval = setInterval(() => {
      this.runScheduledCleanup();
    }, twentyFourHours);
  }

  /**
   * Run scheduled cleanup operations
   */
  private runScheduledCleanup(): void {
    console.log('Running scheduled admin identity cleanup...');
    
    const inactiveCount = this.cleanupInactiveIdentities();
    const tokenCount = this.cleanupExpiredTokens();
    
    console.log(`Cleanup complete: ${inactiveCount} inactive admins, ${tokenCount} expired tokens`);
  }

  /**
   * Stop the cleanup scheduler
   */
  public stopCleanupScheduler(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Log cleanup operation to file
   */
  private logCleanup(cleanedCount: number, cleanedAdmins: Array<{ adminId: string; username: string; lastSeen: string; reason: string }>): void {
    try {
      let logs: CleanupLogEntry[] = [];
      
      // Load existing logs
      if (fs.existsSync(this.cleanupLogPath)) {
        const data = fs.readFileSync(this.cleanupLogPath, 'utf-8');
        logs = JSON.parse(data);
      }
      
      // Add new log entry
      logs.push({
        timestamp: new Date().toISOString(),
        cleanedCount,
        cleanedAdmins
      });
      
      // Keep only last 100 entries
      if (logs.length > 100) {
        logs = logs.slice(-100);
      }
      
      // Save logs
      this.writeFileAtomic(this.cleanupLogPath, JSON.stringify(logs, null, 2));
    } catch (error) {
      console.error('Failed to log cleanup operation:', error);
    }
  }

  /**
   * Get cleanup logs
   */
  public getCleanupLogs(limit: number = 10): CleanupLogEntry[] {
    try {
      if (fs.existsSync(this.cleanupLogPath)) {
        const data = fs.readFileSync(this.cleanupLogPath, 'utf-8');
        const logs: CleanupLogEntry[] = JSON.parse(data);
        return logs.slice(-limit);
      }
    } catch (error) {
      console.error('Failed to read cleanup logs:', error);
    }
    return [];
  }
}
