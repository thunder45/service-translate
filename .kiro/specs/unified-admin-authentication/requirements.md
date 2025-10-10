# Requirements Document

## Introduction

The current system has three separate admin authentication mechanisms that should be unified into a single, coherent authentication system. Currently:

1. **Cognito Admin**: Used by Capture app to access AWS services (Transcribe, Translate, Polly)
2. **WebSocket Admin**: Used by Capture app to authenticate with local WebSocket server for session management
3. **Super Admin**: Implicit concept for system-level operations

This creates unnecessary complexity, multiple credential sets, and confusion about which credentials to use where. We need to simplify this to a single admin identity that works across all components.

## Requirements

### Requirement 1: Single Admin Identity

**User Story:** As a system administrator, I want to use one set of credentials for all admin operations, so that I don't have to manage multiple usernames and passwords.

#### Acceptance Criteria

1. WHEN an admin is created in Cognito THEN that same identity SHALL be used for WebSocket server authentication
2. WHEN an admin logs into the Capture app THEN they SHALL be authenticated for both AWS services and WebSocket server operations
3. WHEN an admin's credentials are updated THEN the change SHALL apply to all authentication contexts
4. IF an admin exists in Cognito THEN they SHALL automatically have admin privileges on the WebSocket server

### Requirement 2: Cognito as Single Source of Truth

**User Story:** As a system administrator, I want Cognito to be the authoritative source for admin identities, so that I have centralized user management.

#### Acceptance Criteria

1. WHEN the WebSocket server starts THEN it SHALL use Cognito for admin authentication
2. WHEN an admin authenticates with the WebSocket server THEN the server SHALL validate credentials against Cognito
3. WHEN a new admin is created in Cognito THEN they SHALL automatically have access to the WebSocket server
4. IF Cognito is unavailable THEN the WebSocket server SHALL provide clear error messages about authentication being unavailable

### Requirement 3: Simplified Configuration

**User Story:** As a system administrator, I want minimal configuration for authentication, so that setup is straightforward and error-free.

#### Acceptance Criteria

1. WHEN setting up the system THEN only three Cognito environment variables SHALL need to be configured: COGNITO_REGION, COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID
2. WHEN the WebSocket server starts THEN it SHALL validate Cognito configuration and fail fast with clear error messages if missing
3. WHEN the setup script runs THEN it SHALL parse CDK output and automatically write Cognito configuration to .env
4. IF Cognito configuration is missing THEN the system SHALL provide clear setup instructions with exact steps to obtain values

### Requirement 4: Persistent Admin Identity Across Components

**User Story:** As an admin user, I want my identity to be consistent across the Capture app and WebSocket server, so that my sessions are always associated with me.

#### Acceptance Criteria

1. WHEN an admin creates a session THEN it SHALL be linked to their Cognito user ID
2. WHEN an admin reconnects to the WebSocket server THEN they SHALL regain control of their sessions using their Cognito identity
3. WHEN an admin uses the Capture app THEN their Cognito identity SHALL be used for both AWS services and WebSocket operations
4. IF an admin's Cognito account is disabled THEN they SHALL lose access to both AWS services and WebSocket server

### Requirement 5: Remove Local Admin Credentials (Breaking Change)

**User Story:** As a system administrator, I want to eliminate local admin credentials from the WebSocket server, so that there's no credential duplication or synchronization issues.

#### Acceptance Criteria

1. WHEN the system is upgraded THEN this SHALL be a breaking change requiring clean installation
2. WHEN upgrading THEN existing admin-identities/ and sessions/ directories SHALL be deleted
3. WHEN the WebSocket server authenticates admins THEN it SHALL only use Cognito validation via amazon-cognito-identity-js
4. WHEN documentation is updated THEN it SHALL clearly mark this as a breaking change in CHANGELOG.md
5. IF local credentials exist in .env THEN they SHALL be ignored and a deprecation warning SHALL be logged

### Requirement 6: Cognito Token Management

**User Story:** As a developer, I want Cognito tokens to be managed properly across client and server, so that authentication is reliable and secure.

#### Acceptance Criteria

1. WHEN an admin authenticates THEN the WebSocket server SHALL store access tokens in memory only (no persistence)
2. WHEN the Capture app receives tokens THEN it SHALL store them in encrypted file storage using Electron safeStorage
3. WHEN the WebSocket server restarts THEN all admins SHALL be required to re-authenticate
4. WHEN an access token expires THEN the client SHALL automatically refresh using the refresh token
5. WHEN a refresh token expires THEN the admin SHALL be required to re-authenticate but sessions SHALL be preserved
6. WHEN a Cognito user is deleted THEN the server SHALL detect this on next operation and terminate their sessions
7. WHEN the client checks token expiry THEN it SHALL do so every 5 minutes and refresh if less than 10 minutes remaining

### Requirement 7: Simplified Setup Process

**User Story:** As a system administrator, I want a simple setup process that works with existing Cognito users, so that I don't need to create new admin accounts.

#### Acceptance Criteria

1. WHEN the WebSocket server is configured THEN it SHALL work with any existing Cognito user in the User Pool (all users are admins)
2. WHEN an existing Cognito user authenticates THEN they SHALL automatically become an admin on the WebSocket server
3. WHEN the Capture app starts THEN it SHALL use existing Cognito credentials for both AWS and WebSocket authentication
4. WHEN multiple connections from the same admin exist THEN all sockets SHALL receive events and any can send commands
5. IF no Cognito users exist THEN the setup script SHALL optionally create one
