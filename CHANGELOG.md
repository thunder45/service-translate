# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-10-10

### Fixed

- **Session Deletion Bug**: Fixed broken setTimeout mechanism in `endSession()` that prevented proper session cleanup after server restarts. Sessions are now immediately deleted when ended instead of using unreliable in-memory timeouts.

- **TTS Generation Missing**: Fixed WebSocket server not generating AWS Polly TTS audio when broadcasting translations. Added proper TTS generation logic to `handleTranslationBroadcast()` that:
  - Generates TTS for each unique language needed by connected clients
  - Checks audio cache first for efficiency
  - Calls AWS Polly via `ttsService.synthesizeSpeech()` if not cached
  - Stores generated audio files via audio manager
  - Broadcasts audio URLs to clients
  
- **Duplicate TTS Logic**: Removed conflicting TTS generation code in `server.ts` that was preventing proper TTS generation. All TTS logic now consolidated in `message-router.ts`.

### BREAKING CHANGES

#### Unified Admin Authentication with AWS Cognito

The admin authentication system has been completely redesigned to use AWS Cognito as the single source of truth for admin identities. This eliminates the previous dual-authentication system (local WebSocket credentials + Cognito AWS credentials) and provides a unified, secure authentication experience.

**What Changed:**
- **Single Authentication**: Admins now use one set of Cognito credentials for both AWS services and WebSocket server operations
- **Cognito Integration**: WebSocket server validates admin credentials against AWS Cognito User Pool using `amazon-cognito-identity-js`
- **Token Management**: Cognito tokens (access, ID, refresh) replace custom JWT tokens
- **Persistent Identity**: Admin identities are now based on Cognito sub (UUID) instead of custom UUIDs
- **Simplified Setup**: Only three environment variables needed: `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`

**Why This is Breaking:**
- Existing admin identities and sessions must be deleted (no automatic migration)
- Local admin credentials (username/password in `.env`) are no longer used
- Custom JWT tokens are replaced with Cognito tokens
- All admins must re-authenticate with Cognito credentials
- WebSocket server requires Cognito configuration to start

**Migration Required:**
This is a clean-break upgrade that requires manual migration. See [Migration Steps](#migration-steps-from-v1x-to-v20) below.

### Added

- **Cognito Authentication Service** (`src/websocket-server/src/cognito-auth.ts`)
  - Validates Cognito credentials using `amazon-cognito-identity-js`
  - Authenticates users with USER_PASSWORD_AUTH flow
  - Validates and refreshes Cognito tokens
  - Extracts user information from Cognito tokens

- **Secure Token Storage** (`src/capture/src/secure-token-storage.ts`)
  - Encrypted token storage using Electron's safeStorage API
  - Secure persistence of Cognito tokens across app restarts
  - Automatic token cleanup on logout

- **Unified Setup Script** (`setup-unified-auth.sh`)
  - Parses Cognito configuration from CDK output
  - Validates Cognito stack deployment
  - Generates `.env` file with Cognito values
  - Optional Cognito user creation

- **Startup Validation** (`scripts/test-startup-validation.ts`)
  - Validates Cognito configuration on server startup
  - Fail-fast behavior with clear error messages
  - Cognito connectivity check

### Changed

- **AdminIdentityManager** (`src/websocket-server/src/admin-identity-manager.ts`)
  - Now uses Cognito sub as adminId instead of custom UUID
  - Validates credentials against Cognito instead of local storage
  - Stores Cognito user info (email, username, groups)
  - Supports multiple connections per admin

- **AdminIdentityStore** (`src/websocket-server/src/admin-identity-store.ts`)
  - Admin identity files now use Cognito sub as filename
  - Stores Cognito username, email, and groups
  - Removed password-related fields
  - Removed custom refresh token management

- **Message Router** (`src/websocket-server/src/message-router.ts`)
  - Returns Cognito tokens in admin-auth-response
  - Uses Cognito refresh tokens for token refresh
  - Maps Cognito error codes to admin errors

- **WebSocket Manager** (`src/capture/src/websocket-manager.ts`)
  - Uses Cognito credentials from app config
  - Stores tokens in encrypted file storage
  - Automatic token refresh every 5 minutes
  - Refreshes token if less than 10 minutes remaining

- **Environment Configuration**
  - Removed: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `JWT_*` variables
  - Added: `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`
  - Simplified configuration with only 3 required variables

### Removed

- **Custom JWT Implementation** (`jwt-security.ts`)
  - Replaced with Cognito token validation
  - No longer needed for admin authentication

- **Local Credential Validation**
  - Removed from `admin-security-middleware.ts`
  - All authentication now goes through Cognito

- **Setup Admin Script** (`setup-admin.sh`)
  - No longer needed with Cognito-based authentication
  - Replaced by `setup-unified-auth.sh`

### Security Improvements

- **Centralized Authentication**: Cognito provides enterprise-grade security with MFA support, password policies, and account recovery
- **Token Management**: Cognito handles token lifecycle, rotation, and revocation
- **Audit Trail**: Cognito provides authentication logs and monitoring
- **Encrypted Storage**: Tokens stored using Electron's secure storage API
- **No Credential Duplication**: Single set of credentials eliminates synchronization issues

### Migration Steps from v1.x to v2.0

**IMPORTANT**: This is a breaking change that requires clean installation. There is no automatic migration path.

#### Prerequisites

1. **Backup existing data** (optional, for reference only):
   ```bash
   cp -r src/websocket-server/admin-identities src/websocket-server/admin-identities.backup
   cp -r src/websocket-server/sessions src/websocket-server/sessions.backup
   cp src/websocket-server/.env src/websocket-server/.env.backup
   ```

2. **Deploy AWS Cognito stack** (if not already deployed):
   ```bash
   cd src/backend
   npm install
   cdk bootstrap  # First time only
   npm run deploy
   ```
   
   Note the Cognito User Pool ID and Client ID from the CDK output.

#### Migration Steps

1. **Clean old data**:
   ```bash
   cd src/websocket-server
   rm -rf admin-identities
   rm -rf sessions
   ```

2. **Update code**:
   ```bash
   git pull origin main
   npm install
   ```

3. **Run unified setup**:
   ```bash
   ./setup-unified-auth.sh
   ```
   
   The script will:
   - Parse Cognito configuration from CDK output
   - Generate `.env` file with Cognito values
   - Create necessary directories
   - Optionally create a Cognito user

4. **Update Capture app**:
   ```bash
   cd src/capture
   npm install
   ```

5. **Start services**:
   ```bash
   # Start WebSocket server
   cd src/websocket-server
   npm start
   
   # Start Capture app (in another terminal)
   cd src/capture
   npm start
   ```

6. **Re-authenticate**:
   - All admins must login again with Cognito credentials
   - Sessions will be recreated on first use
   - Previous session data is not preserved

#### What You'll Need

- **Cognito User Pool ID**: From CDK deployment output
- **Cognito Client ID**: From CDK deployment output
- **AWS Region**: Where your Cognito User Pool is deployed
- **Cognito Credentials**: Username and password for admin users

#### Troubleshooting Migration

**Issue**: Setup script can't find Cognito configuration
- **Solution**: Manually add Cognito values to `.env` from CDK output

**Issue**: WebSocket server fails to start
- **Solution**: Verify all three Cognito environment variables are set correctly

**Issue**: Authentication fails
- **Solution**: Verify Cognito User Pool Client is configured as public client with USER_PASSWORD_AUTH enabled

**Issue**: Tokens not persisting
- **Solution**: Check Capture app has write permissions to app data directory

### Documentation Updates

- **README.md**: Updated with simplified Cognito-only authentication
- **ADMIN_AUTHENTICATION_GUIDE.md**: Complete rewrite for Cognito integration
- **MESSAGE_PROTOCOLS.md**: Updated with Cognito token examples
- **SECURITY_IMPLEMENTATION.md**: Updated with Cognito security details
- **WebSocket Server README**: Updated with Cognito setup instructions

### Known Issues

- None at this time

### Upgrade Notes

- **No Rollback**: Once migrated to v2.0, rolling back to v1.x requires restoring backups
- **Session Data**: Previous sessions are not preserved during migration
- **Admin Identities**: Previous admin identities are not migrated
- **Credentials**: All admins must use Cognito credentials after upgrade

### Future Enhancements

- **Role-Based Access Control (RBAC)**: Use Cognito groups for admin roles
- **Multi-Factor Authentication (MFA)**: Enable Cognito MFA for admin accounts
- **Federated Identity**: Support SAML/OAuth providers via Cognito
- **Admin Management UI**: Web-based admin user management

---

## [1.0.0] - 2025-10-09

### Added

- Initial release with local admin authentication
- JWT-based token management
- File-based admin identity persistence
- Session management with admin ownership
- WebSocket server with TTS support
- Progressive Web App client
- Electron Capture application
- AWS Transcribe and Translate integration
- Holyrics integration
