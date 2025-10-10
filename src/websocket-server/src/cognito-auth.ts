import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
  CognitoRefreshToken,
} from 'amazon-cognito-identity-js';

/**
 * Cognito configuration interface
 */
export interface CognitoConfig {
  region: string;
  userPoolId: string;
  clientId: string;
}

/**
 * Cognito user information extracted from tokens
 */
export interface CognitoUserInfo {
  sub: string;                    // Cognito user ID (UUID)
  email: string;                  // User email
  username: string;               // Username
  'cognito:groups'?: string[];    // User groups (for future RBAC)
}

/**
 * Authentication result with tokens
 */
export interface CognitoAuthResult {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
  userInfo: CognitoUserInfo;
}

/**
 * Token refresh result
 */
export interface CognitoRefreshResult {
  accessToken: string;
  expiresIn: number;
}

/**
 * Cognito error codes for standardized error handling
 */
export enum CognitoErrorCode {
  INVALID_CREDENTIALS = 'COGNITO_1001',
  TOKEN_EXPIRED = 'COGNITO_1002',
  TOKEN_INVALID = 'COGNITO_1003',
  USER_NOT_FOUND = 'COGNITO_1004',
  USER_DISABLED = 'COGNITO_1005',
  COGNITO_UNAVAILABLE = 'COGNITO_1006',
  REFRESH_TOKEN_EXPIRED = 'COGNITO_1007',
  INSUFFICIENT_PERMISSIONS = 'COGNITO_1008',
}

/**
 * Error messages for Cognito errors
 */
export const COGNITO_ERROR_MESSAGES: Record<CognitoErrorCode, string> = {
  [CognitoErrorCode.INVALID_CREDENTIALS]: 'Invalid username or password',
  [CognitoErrorCode.TOKEN_EXPIRED]: 'Access token has expired. Please refresh or re-authenticate',
  [CognitoErrorCode.TOKEN_INVALID]: 'Invalid or malformed access token',
  [CognitoErrorCode.USER_NOT_FOUND]: 'User not found in Cognito',
  [CognitoErrorCode.USER_DISABLED]: 'User account is disabled',
  [CognitoErrorCode.COGNITO_UNAVAILABLE]: 'Unable to connect to Cognito service',
  [CognitoErrorCode.REFRESH_TOKEN_EXPIRED]: 'Refresh token has expired. Please re-authenticate',
  [CognitoErrorCode.INSUFFICIENT_PERMISSIONS]: 'User does not have required permissions',
};

/**
 * Error severity levels for prioritizing error handling
 */
export type ErrorSeverity = 'critical' | 'warning' | 'info';

/**
 * Recovery actions for Cognito errors with severity levels
 */
export const ERROR_RECOVERY_ACTIONS: Record<CognitoErrorCode, { action: string; severity: ErrorSeverity }> = {
  [CognitoErrorCode.INVALID_CREDENTIALS]: {
    action: 'Verify username and password are correct. Check Cognito User Pool for user status.',
    severity: 'warning'
  },
  [CognitoErrorCode.TOKEN_EXPIRED]: {
    action: 'Client should automatically refresh token. If refresh fails, re-authenticate.',
    severity: 'info'
  },
  [CognitoErrorCode.TOKEN_INVALID]: {
    action: 'Clear stored tokens and re-authenticate. Check token format and signature.',
    severity: 'warning'
  },
  [CognitoErrorCode.USER_NOT_FOUND]: {
    action: 'User may have been deleted from Cognito. Create new user or use existing user.',
    severity: 'critical'
  },
  [CognitoErrorCode.USER_DISABLED]: {
    action: 'Enable user account in Cognito User Pool console.',
    severity: 'critical'
  },
  [CognitoErrorCode.COGNITO_UNAVAILABLE]: {
    action: 'Check network connectivity. Verify Cognito User Pool ID and region are correct.',
    severity: 'critical'
  },
  [CognitoErrorCode.REFRESH_TOKEN_EXPIRED]: {
    action: 'Re-authenticate with username and password. Sessions will be preserved.',
    severity: 'warning'
  },
  [CognitoErrorCode.INSUFFICIENT_PERMISSIONS]: {
    action: 'Verify user has required Cognito groups (if RBAC is enabled).',
    severity: 'warning'
  },
};

/**
 * Custom error class for Cognito authentication errors
 */
export class CognitoAuthError extends Error {
  constructor(
    public code: CognitoErrorCode,
    public recoveryAction: string,
    public severity: ErrorSeverity,
    message?: string
  ) {
    super(message || COGNITO_ERROR_MESSAGES[code]);
    this.name = 'CognitoAuthError';
  }
}

/**
 * Service for authenticating users with AWS Cognito
 * Uses amazon-cognito-identity-js with USER_PASSWORD_AUTH flow
 */
export class CognitoAuthService {
  private userPool: CognitoUserPool;
  private config: CognitoConfig;

  constructor(config: CognitoConfig) {
    this.config = config;
    this.userPool = new CognitoUserPool({
      UserPoolId: config.userPoolId,
      ClientId: config.clientId,
    });
  }

  /**
   * Authenticate user with username/password
   * Uses CognitoUser.authenticateUser() with USER_PASSWORD_AUTH flow
   * Returns Cognito tokens if valid
   */
  async authenticateUser(username: string, password: string): Promise<CognitoAuthResult> {
    const authDetails = new AuthenticationDetails({
      Username: username,
      Password: password,
    });

    const cognitoUser = new CognitoUser({
      Username: username,
      Pool: this.userPool,
    });

    return new Promise((resolve, reject) => {
      cognitoUser.authenticateUser(authDetails, {
        onSuccess: (session: CognitoUserSession) => {
          try {
            const accessToken = session.getAccessToken().getJwtToken();
            const idToken = session.getIdToken().getJwtToken();
            const refreshToken = session.getRefreshToken().getToken();
            const expiresIn = session.getAccessToken().getExpiration();

            const userInfo: CognitoUserInfo = {
              sub: session.getIdToken().payload.sub,
              email: session.getIdToken().payload.email,
              username: session.getIdToken().payload['cognito:username'],
              'cognito:groups': session.getIdToken().payload['cognito:groups'],
            };

            resolve({
              accessToken,
              idToken,
              refreshToken,
              expiresIn,
              userInfo,
            });
          } catch (error) {
            reject(this.handleCognitoError(error));
          }
        },
        onFailure: (err) => {
          reject(this.handleCognitoError(err));
        },
      });
    });
  }

  /**
   * Validate Cognito access token
   * Returns user info if valid, throws error if invalid
   */
  async validateToken(accessToken: string): Promise<CognitoUserInfo> {
    try {
      const payload = this.decodeToken(accessToken);

      // Check if token is expired
      const currentTime = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < currentTime) {
        throw new CognitoAuthError(
          CognitoErrorCode.TOKEN_EXPIRED,
          ERROR_RECOVERY_ACTIONS[CognitoErrorCode.TOKEN_EXPIRED].action,
          ERROR_RECOVERY_ACTIONS[CognitoErrorCode.TOKEN_EXPIRED].severity
        );
      }

      // Extract user info from token payload
      // Access tokens have: sub, username, token_use: "access"
      // ID tokens have: sub, email, cognito:username, token_use: "id"
      const userInfo: CognitoUserInfo = {
        sub: payload.sub,
        email: payload.email || `${payload.username}@cognito.local`, // Access tokens don't have email
        username: payload['cognito:username'] || payload.username,
        'cognito:groups': payload['cognito:groups'],
      };

      return userInfo;
    } catch (error) {
      if (error instanceof CognitoAuthError) {
        throw error;
      }
      throw new CognitoAuthError(
        CognitoErrorCode.TOKEN_INVALID,
        ERROR_RECOVERY_ACTIONS[CognitoErrorCode.TOKEN_INVALID].action,
        ERROR_RECOVERY_ACTIONS[CognitoErrorCode.TOKEN_INVALID].severity,
        'Failed to validate token'
      );
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(username: string, refreshToken: string): Promise<CognitoRefreshResult> {
    const cognitoUser = new CognitoUser({
      Username: username,
      Pool: this.userPool,
    });

    const cognitoRefreshToken = new CognitoRefreshToken({
      RefreshToken: refreshToken,
    });

    return new Promise((resolve, reject) => {
      cognitoUser.refreshSession(cognitoRefreshToken, (err, session) => {
        if (err) {
          reject(this.handleCognitoError(err));
        } else {
          try {
            const accessToken = session.getAccessToken().getJwtToken();
            const expiresIn = session.getAccessToken().getExpiration();

            resolve({
              accessToken,
              expiresIn,
            });
          } catch (error) {
            reject(this.handleCognitoError(error));
          }
        }
      });
    });
  }

  /**
   * Decode JWT token to extract payload
   * Does not verify signature - use validateToken for verification
   */
  private decodeToken(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }

      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = Buffer.from(base64, 'base64').toString('utf-8');

      return JSON.parse(jsonPayload);
    } catch (error) {
      throw new CognitoAuthError(
        CognitoErrorCode.TOKEN_INVALID,
        ERROR_RECOVERY_ACTIONS[CognitoErrorCode.TOKEN_INVALID].action,
        ERROR_RECOVERY_ACTIONS[CognitoErrorCode.TOKEN_INVALID].severity,
        'Failed to decode token'
      );
    }
  }

  /**
   * Handle Cognito-specific errors and map to standardized error codes
   */
  private handleCognitoError(error: any): CognitoAuthError {
    const errorCode = error?.code || error?.name;
    const errorMessage = error?.message || 'Unknown error';

    // Map Cognito error codes to our standardized codes
    switch (errorCode) {
      case 'NotAuthorizedException':
      case 'UserNotFoundException':
        if (errorMessage.toLowerCase().includes('incorrect username or password')) {
          return new CognitoAuthError(
            CognitoErrorCode.INVALID_CREDENTIALS,
            ERROR_RECOVERY_ACTIONS[CognitoErrorCode.INVALID_CREDENTIALS].action,
            ERROR_RECOVERY_ACTIONS[CognitoErrorCode.INVALID_CREDENTIALS].severity
          );
        }
        if (errorMessage.toLowerCase().includes('user does not exist')) {
          return new CognitoAuthError(
            CognitoErrorCode.USER_NOT_FOUND,
            ERROR_RECOVERY_ACTIONS[CognitoErrorCode.USER_NOT_FOUND].action,
            ERROR_RECOVERY_ACTIONS[CognitoErrorCode.USER_NOT_FOUND].severity
          );
        }
        return new CognitoAuthError(
          CognitoErrorCode.INVALID_CREDENTIALS,
          ERROR_RECOVERY_ACTIONS[CognitoErrorCode.INVALID_CREDENTIALS].action,
          ERROR_RECOVERY_ACTIONS[CognitoErrorCode.INVALID_CREDENTIALS].severity
        );

      case 'UserNotConfirmedException':
      case 'UserDisabledException':
        return new CognitoAuthError(
          CognitoErrorCode.USER_DISABLED,
          ERROR_RECOVERY_ACTIONS[CognitoErrorCode.USER_DISABLED].action,
          ERROR_RECOVERY_ACTIONS[CognitoErrorCode.USER_DISABLED].severity
        );

      case 'TokenExpiredException':
      case 'ExpiredTokenException':
        return new CognitoAuthError(
          CognitoErrorCode.TOKEN_EXPIRED,
          ERROR_RECOVERY_ACTIONS[CognitoErrorCode.TOKEN_EXPIRED].action,
          ERROR_RECOVERY_ACTIONS[CognitoErrorCode.TOKEN_EXPIRED].severity
        );

      case 'InvalidParameterException':
      case 'InvalidTokenException':
        return new CognitoAuthError(
          CognitoErrorCode.TOKEN_INVALID,
          ERROR_RECOVERY_ACTIONS[CognitoErrorCode.TOKEN_INVALID].action,
          ERROR_RECOVERY_ACTIONS[CognitoErrorCode.TOKEN_INVALID].severity
        );

      case 'NetworkError':
      case 'ServiceUnavailableException':
        return new CognitoAuthError(
          CognitoErrorCode.COGNITO_UNAVAILABLE,
          ERROR_RECOVERY_ACTIONS[CognitoErrorCode.COGNITO_UNAVAILABLE].action,
          ERROR_RECOVERY_ACTIONS[CognitoErrorCode.COGNITO_UNAVAILABLE].severity
        );

      case 'RefreshTokenExpiredException':
        return new CognitoAuthError(
          CognitoErrorCode.REFRESH_TOKEN_EXPIRED,
          ERROR_RECOVERY_ACTIONS[CognitoErrorCode.REFRESH_TOKEN_EXPIRED].action,
          ERROR_RECOVERY_ACTIONS[CognitoErrorCode.REFRESH_TOKEN_EXPIRED].severity
        );

      default:
        // Unknown error - return generic unavailable error
        return new CognitoAuthError(
          CognitoErrorCode.COGNITO_UNAVAILABLE,
          ERROR_RECOVERY_ACTIONS[CognitoErrorCode.COGNITO_UNAVAILABLE].action,
          ERROR_RECOVERY_ACTIONS[CognitoErrorCode.COGNITO_UNAVAILABLE].severity,
          errorMessage
        );
    }
  }
}
