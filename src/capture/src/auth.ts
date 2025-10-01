import { CognitoIdentityProviderClient, InitiateAuthCommand, RespondToAuthChallengeCommand } from '@aws-sdk/client-cognito-identity-provider';

interface AuthConfig {
  userPoolId: string;
  clientId: string;
  region: string;
}

export class CognitoAuth {
  private client: CognitoIdentityProviderClient;
  private config: AuthConfig;

  constructor(config: AuthConfig) {
    this.config = config;
    this.client = new CognitoIdentityProviderClient({ region: config.region });
  }

  async login(username: string, password: string): Promise<string> {
    try {
      const response = await this.client.send(new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: this.config.clientId,
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password,
        },
      }));

      // Handle password change required
      if (response.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
        throw new Error('Password change required. Please contact administrator.');
      }

      return response.AuthenticationResult!.AccessToken!;
    } catch (error: any) {
      if (error.name === 'NotAuthorizedException') {
        throw new Error('Invalid username or password');
      }
      throw error;
    }
  }

  async changePassword(username: string, oldPassword: string, newPassword: string): Promise<string> {
    const response = await this.client.send(new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: this.config.clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: oldPassword,
      },
    }));

    if (response.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
      const challengeResponse = await this.client.send(new RespondToAuthChallengeCommand({
        ClientId: this.config.clientId,
        ChallengeName: 'NEW_PASSWORD_REQUIRED',
        Session: response.Session,
        ChallengeResponses: {
          USERNAME: username,
          NEW_PASSWORD: newPassword,
        },
      }));

      return challengeResponse.AuthenticationResult!.AccessToken!;
    }

    return response.AuthenticationResult!.AccessToken!;
  }
}
