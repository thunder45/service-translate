# Implementation Plan

- [x] 1. Create Cognito authentication service
  - Install amazon-cognito-identity-js dependency
  - Create `src/websocket-server/src/cognito-auth.ts` with CognitoAuthService class
  - Implement authenticateUser() using CognitoUser.authenticateUser() with USER_PASSWORD_AUTH flow
  - Implement validateToken() to decode and validate access tokens
  - Implement refreshAccessToken() using CognitoUser.refreshSession()
  - Add error handling for Cognito-specific errors with recovery actions
  - Add token decoding utility for extracting user info
  - _Requirements: 1.1, 2.1, 2.2, 6.1_

- [x] 2. Create token storage implementations
  - Create `src/websocket-server/src/token-store.ts` for in-memory token storage
  - Implement storeToken(), getToken(), removeToken() methods
  - Add automatic expiry checking when retrieving tokens
  - Create `src/capture/src/secure-token-storage.ts` for encrypted file storage
  - Implement storeTokens() using Electron safeStorage.encryptString()
  - Implement loadTokens() using Electron safeStorage.decryptString()
  - Implement clearTokens() for logout functionality
  - _Requirements: 6.2, 6.3_

- [x] 3. Update AdminIdentityManager for Cognito integration
  - Modify AdminIdentityManager to accept CognitoAuthService and TokenStore dependencies
  - Update authenticateWithCredentials to use Cognito validation and store tokens in memory
  - Update authenticateWithToken to validate Cognito tokens from memory
  - Change adminId to use Cognito sub (UUID) instead of custom UUID
  - Update admin identity storage to include Cognito user info (email, username, groups)
  - Remove local credential validation logic
  - Add support for multiple connections per admin (all sockets receive events)
  - _Requirements: 1.2, 1.3, 2.1, 4.1, 4.2, 5.1, 7.4_

- [x] 4. Update AdminIdentityStore for Cognito-based identities
  - Modify AdminIdentity interface to include cognitoUsername, email, and cognitoGroups fields
  - Update file naming to use Cognito sub as filename
  - Update admin index to map email and username to Cognito sub
  - Remove password-related fields and tokenVersion from stored identity
  - Remove refreshTokens set (tokens stored in memory only on server)
  - _Requirements: 1.3, 4.3, 5.1, 6.2_

- [x] 5. Update message router for Cognito authentication
  - Modify handleAdminAuth to pass credentials to Cognito validation
  - Update admin-auth-response to return Cognito tokens (access, ID, refresh) with expiry
  - Update token-refresh handler to use Cognito refresh tokens
  - Remove custom JWT generation logic
  - Add Cognito error code mapping to admin error responses with recovery actions
  - Add handler for user deleted from Cognito (terminate sessions)
  - _Requirements: 1.2, 2.2, 6.1, 6.2, 6.6_

- [x] 6. Update Capture app WebSocket manager
  - Integrate SecureTokenStorage for encrypted token persistence
  - Modify WebSocketManager to use Cognito credentials from app config
  - Update token storage to use encrypted file storage for Cognito tokens
  - Implement automatic token refresh check every 5 minutes
  - Refresh token if less than 10 minutes remaining before expiry
  - Update reconnection logic to use stored Cognito tokens
  - Remove custom JWT token handling
  - Add "Session expired, please login again" message for refresh token expiry
  - _Requirements: 1.1, 1.2, 4.4, 4.5, 6.2, 6.4, 6.5_

- [x] 7. Update environment configuration
  - Remove deprecated JWT and local admin credential variables from .env.example
  - Add required Cognito configuration variables: COGNITO_REGION, COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID
  - Add comments explaining where to get values (CDK output)
  - Add validation requirements (server checks on startup, fails fast if missing)
  - Update .env file with Cognito configuration
  - Remove setup-admin.sh script (no longer needed)
  - Document Cognito User Pool Client configuration requirements
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 5.2, 7.1, 7.2_

- [x] 8. Remove deprecated authentication code
  - Remove jwt-security.ts file (custom JWT implementation)
  - Remove local credential validation from admin-security-middleware.ts
  - Remove ADMIN_USERNAME, ADMIN_PASSWORD, JWT_* variables from environment loading
  - Update admin error codes to include Cognito errors with recovery actions
  - Clean up unused JWT-related dependencies from package.json
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 9. Update session management for Cognito IDs
  - Verify SessionData uses adminId field (already Cognito-compatible)
  - Update session creation to use Cognito sub as adminId
  - Update createdBy field to use Cognito username or email
  - Ensure session persistence works with Cognito-based IDs
  - Verify sessions are preserved when admin re-authenticates after token expiry
  - _Requirements: 4.1, 4.2, 4.3, 6.5_

- [x] 10. Create unified setup script
  - Create setup-unified-auth.sh with Cognito configuration parsing from CDK output
  - Add validation for Cognito stack deployment (check if User Pool exists)
  - Add automatic .env file generation with Cognito values
  - Add optional Cognito user creation step (prompt user)
  - Add directory creation for admin identities and sessions
  - Add instructions for obtaining CDK output if not available
  - _Requirements: 3.1, 3.2, 3.3, 7.1, 7.2, 7.3, 7.5_

- [x] 11. Update deployment and startup scripts
  - Update start-websocket-server.ts to validate Cognito configuration on startup
  - Add fail-fast behavior with clear error messages if Cognito config missing
  - Remove admin credential validation from startup
  - Add Cognito connectivity check on startup (test authentication)
  - Update error messages to reference Cognito setup and CDK deployment
  - _Requirements: 2.4, 3.3, 3.4_

- [x] 12. Update documentation
  - Create CHANGELOG.md entry marking this as BREAKING CHANGE v2.0.0
  - Document migration steps: backup, delete old data, run setup, re-authenticate
  - Update README.md with simplified Cognito-only authentication
  - Update ADMIN_AUTHENTICATION_GUIDE.md to reflect Cognito integration
  - Update MESSAGE_PROTOCOLS.md with Cognito token examples
  - Update SECURITY_IMPLEMENTATION.md with Cognito security details and token storage
  - Update WebSocket server README with Cognito setup instructions
  - Document User Pool Client configuration requirements
  - _Requirements: 3.3, 5.4, 7.3, 7.4_
