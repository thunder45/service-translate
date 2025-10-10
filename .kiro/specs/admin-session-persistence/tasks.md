# Implementation Plan

- [x] 1. Update shared types and data models
  - Update `src/shared/types.ts` to include new admin authentication types
  - Add AdminIdentity, AdminPermissions, and enhanced SessionData interfaces
  - Add all admin message protocol types from design specification
  - Add AdminErrorCode enum and error message mappings
  - Add token management message types (refresh, expiry warnings)
  - Remove deprecated adminSocketId references from existing types
  - Update `src/shared/README.md` with comprehensive admin authentication type documentation
  - Update `src/websocket-server/MESSAGE_PROTOCOLS.md` with admin message examples and error codes
  - Update `IMPLEMENTATION_SUMMARY.md` to reflect admin session persistence implementation
  - _Requirements: 1.1, 1.4, 4.1, 4.2, 6.3_

- [x] 2. Implement AdminIdentityStore with file-based persistence
  - [x] 2.1 Create AdminIdentityStore with JSON file persistence
    - Implement file-based storage in `./admin-identities/` directory
    - Add atomic write operations with temporary files
    - Create username-to-adminId index file management
    - Implement admin identity CRUD operations with file locking
    - _Requirements: 1.1, 1.4, 2.1, 2.2_

  - [x] 2.2 Implement admin identity lifecycle management
    - Add cleanup methods for inactive admin identities (90-day retention)
    - Implement daily cleanup scheduling
    - Create orphaned session handling for deleted admins
    - Add refresh token management and cleanup
    - _Requirements: 2.1, 2.2, 6.4_

  - [ ]* 2.3 Write unit tests for AdminIdentityStore
    - Test file persistence operations and atomic writes
    - Test admin identity lifecycle and cleanup
    - Test concurrent access and file locking
    - _Requirements: 2.1, 2.2_

  - [x] 2.4 Update documentation for AdminIdentityStore
    - Update `src/websocket-server/README.md` with AdminIdentityStore architecture and file structure
    - Document admin identity persistence format and directory structure
    - Add troubleshooting guide for file-based admin identity issues
    - _Requirements: 2.1, 2.2_

- [x] 3. Implement AdminIdentityManager class
  - [x] 3.1 Create AdminIdentityManager with persistent admin identity tracking
    - Implement admin identity creation and retrieval using AdminIdentityStore
    - Add session ownership verification logic
    - Create admin-to-socket mapping management (in-memory)
    - Add JWT token generation and validation
    - _Requirements: 1.1, 1.4, 2.1, 2.2_

  - [x] 3.2 Implement admin session recovery and token management
    - Add methods to retrieve admin's owned sessions on reconnection
    - Implement admin socket ID updates for existing sessions
    - Create concurrent connection handling for same admin
    - Add token refresh and expiry warning functionality
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2_

  - [ ]* 3.3 Write unit tests for AdminIdentityManager
    - Test admin identity creation and retrieval
    - Test session ownership verification
    - Test concurrent connection handling
    - Test JWT token generation and validation
    - _Requirements: 2.1, 2.2, 3.1, 3.2_

  - [x] 3.4 Update documentation for AdminIdentityManager
    - Update `src/websocket-server/README.md` with AdminIdentityManager class documentation
    - Document JWT token management and security considerations
    - Add admin session recovery workflow documentation
    - _Requirements: 2.1, 2.2, 3.1, 3.2_

- [x] 4. Update SessionManager for admin identity integration
  - [x] 4.1 Modify SessionData structure and persistence
    - Replace adminSocketId with adminId and currentAdminSocketId
    - Update session creation to use admin identity
    - Modify session persistence to save admin identity
    - Clean up existing session files with old format
    - _Requirements: 2.1, 2.2, 4.1, 4.2_

  - [x] 4.2 Implement admin access verification methods
    - Add verifyAdminAccess method for read/write operations
    - Implement getSessionsByAdmin for admin-specific session queries
    - Add updateCurrentAdminSocket for reconnection handling
    - _Requirements: 2.2, 4.4, 5.1, 5.2, 5.3_

  - [ ]* 4.3 Write unit tests for enhanced SessionManager
    - Test session creation with admin identity
    - Test admin access verification (read/write permissions)
    - Test session ownership queries
    - _Requirements: 2.1, 2.2, 4.4, 5.1_

  - [x] 4.4 Update documentation for enhanced SessionManager
    - Update `src/websocket-server/README.md` with enhanced SessionManager capabilities
    - Document session ownership model and admin access verification
    - Add session data migration guide from old adminSocketId format
    - _Requirements: 2.1, 2.2, 4.1, 4.2_

- [x] 5. Implement admin authentication message handlers
  - [x] 5.1 Create admin authentication handler in MessageRouter
    - Implement handleAdminAuth method supporting both credential and token authentication
    - Add JWT token generation and validation logic
    - Add admin identity registration on successful authentication
    - Create admin session recovery logic for reconnections
    - Return owned and all sessions in authentication response with tokens
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2_

  - [x] 5.2 Implement token management message handlers
    - Add handleTokenRefresh for refresh token processing
    - Implement token expiry warning system with 5-minute alerts
    - Create session expiry notification handling
    - Add automatic token cleanup for expired tokens
    - _Requirements: 1.2, 1.3, 6.4_

  - [x] 5.3 Implement session management message handlers with admin verification
    - Update handleStartSession to use admin identity instead of socket ID
    - Modify handleEndSession to verify admin ownership
    - Add handleListSessions with admin-specific filtering
    - Implement handleUpdateSessionConfig with ownership verification
    - _Requirements: 2.2, 2.3, 4.3, 4.4, 5.2, 5.3_

  - [x] 5.4 Create admin session access handlers
    - Implement handleAdminSessionAccess for read-only access to other admin sessions
    - Add session access verification logic
    - Create read-only session data responses
    - _Requirements: 5.1, 5.2, 5.4_

  - [x] 5.5 Update documentation for admin message handlers
    - Update `src/websocket-server/MESSAGE_PROTOCOLS.md` with complete admin authentication flow examples
    - Document all admin message handlers and their security requirements
    - Add troubleshooting guide for admin authentication issues
    - _Requirements: 1.1, 1.2, 2.1, 4.3, 5.1_

- [x] 6. Implement comprehensive error handling system
  - [x] 6.1 Create AdminErrorManager with error code mapping
    - Implement AdminErrorCode enum and error message mappings
    - Add user-friendly error message generation
    - Create retryable error classification system
    - Add error logging and audit trail functionality
    - _Requirements: 6.3, 6.4_

  - [x] 6.2 Implement error handling middleware for admin operations
    - Add error catching and standardized error response generation
    - Implement retry-after header support for rate-limited operations
    - Create validation error aggregation and reporting
    - Add security event logging for authentication failures
    - _Requirements: 1.3, 2.4, 6.1, 6.3_

  - [x] 6.3 Update documentation for error handling system
    - Update `src/websocket-server/MESSAGE_PROTOCOLS.md` with complete error code reference
    - Document retry strategies and client-side error handling best practices
    - Add security event logging documentation and audit trail format
    - _Requirements: 6.1, 6.3, 6.4_

- [x] 7. Update WebSocket server connection handling
  - [x] 7.1 Modify server.ts to support admin authentication flow
    - Update connection handler to process admin credentials and tokens
    - Integrate AdminIdentityManager with connection lifecycle
    - Add admin authentication message routing
    - Update disconnect handler to clean up admin connections and tokens
    - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.3_

  - [x] 7.2 Implement admin message protocol routing
    - Add all admin message types to secure message handler
    - Route admin authentication, token management, and session management messages
    - Implement admin status update broadcasting
    - Add comprehensive error handling for admin-specific operations
    - _Requirements: 1.2, 1.4, 4.3, 6.3_

  - [x] 7.3 Update documentation for WebSocket server admin integration
    - Update `src/websocket-server/README.md` with admin authentication architecture
    - Document WebSocket connection lifecycle with admin authentication
    - Add deployment guide for admin authentication configuration
    - _Requirements: 1.1, 1.2, 3.1, 7.1_

- [x] 8. Update Capture Electron App for admin authentication
  - [x] 8.1 Create admin authentication UI components
    - Add login form with username/password fields
    - Implement authentication state management with token storage
    - Create admin identity display in header/status bar
    - Add logout functionality with token cleanup
    - Add token expiry warning notifications
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 8.2 Update WebSocket manager for admin protocol
    - Modify websocket-manager.ts to handle admin authentication messages
    - Implement admin authentication handshake with both credential and token methods
    - Add automatic token refresh logic
    - Add session recovery logic after reconnection
    - Update session management to use admin identity
    - Implement retry strategies for failed operations
    - _Requirements: 1.4, 2.1, 2.2, 3.1, 3.2_

  - [x] 8.3 Update session management UI for admin features
    - Add session ownership indicators in session list
    - Implement "My Sessions" vs "All Sessions" views
    - Add read-only indicators for other admin sessions
    - Update session creation to work with admin authentication
    - Add error handling UI with retry options
    - _Requirements: 4.1, 4.2, 5.1, 5.2, 5.4_

  - [x] 8.4 Update documentation for Capture app admin features
    - Update `src/capture/README.md` with admin authentication setup guide
    - Document new admin UI components and session management features
    - Add troubleshooting guide for admin authentication in Electron app
    - _Requirements: 1.1, 1.2, 4.1, 8.1_

- [x] 9. Implement admin operation security and validation
  - [x] 9.1 Add JWT token security implementation
    - Implement secure JWT token generation with configurable expiry
    - Add token signature validation and claims verification
    - Create refresh token rotation and secure storage
    - Add token revocation and blacklist functionality
    - _Requirements: 6.1, 6.2, 6.4_

  - [x] 9.2 Implement admin operation security middleware
    - Add admin identity validation for all admin operations
    - Implement session ownership verification middleware
    - Add rate limiting for admin authentication attempts
    - Create audit logging for admin actions with security events
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 9.3 Update documentation for admin security implementation
    - Update `src/websocket-server/README.md` with security architecture and JWT implementation
    - Document rate limiting policies and security event logging
    - Add security best practices guide for admin authentication
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ]* 10. Write integration tests for admin authentication system
  - Test complete admin authentication flow with both credential and token methods
  - Test admin reconnection and session recovery
  - Test multi-admin scenarios with session isolation
  - Test read-only access to other admin sessions
  - Test token refresh and expiry scenarios
  - Test error handling and retry mechanisms
  - _Requirements: 1.1, 2.1, 3.1, 5.1_

- [x] 11. Update configuration and deployment
  - [x] 11.1 Update environment configuration for admin authentication
    - Add admin authentication configuration options (JWT secret, token expiry)
    - Update default admin credentials setup
    - Add admin session timeout and cleanup configuration
    - Add file persistence directory configuration
    - Update deployment scripts for new admin system
    - _Requirements: 6.1, 6.4_

  - [x] 11.2 Clean up deprecated code and data
    - Remove old adminSocketId references from codebase
    - Clean up existing session files with old format
    - Update documentation for new admin authentication
    - Remove backward compatibility code
    - _Requirements: All requirements - cleanup_

  - [x] 11.3 Create data migration script
    - Create migrate-admin-sessions.sh script for existing session migration
    - Backup existing session files before migration
    - Generate system admin identity for orphaned sessions
    - Update session files with adminId field replacing adminSocketId
    - Verify migration success and create rollback point
    - _Requirements: All requirements - data migration_

  - [x] 11.4 Update final project documentation
    - Update `IMPLEMENTATION_SUMMARY.md` with complete admin session persistence implementation
    - Update `README.md` with admin authentication setup and usage instructions
    - Create `ADMIN_AUTHENTICATION_GUIDE.md` with comprehensive admin system documentation
    - Update deployment and configuration documentation for production use
    - _Requirements: All requirements - final documentation_