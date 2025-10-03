import { EventEmitter } from 'events';
import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';

interface TranslationConfig {
  region: string;
  identityPoolId: string;
  userPoolId: string;
  jwtToken: string;
  sourceLanguage: string;
  targetLanguages: string[];
}

export class TranslationService extends EventEmitter {
  private client: TranslateClient;
  private config: TranslationConfig;

  constructor(config: TranslationConfig) {
    super();
    this.config = config;
    
    this.client = new TranslateClient({
      region: config.region,
      credentials: fromCognitoIdentityPool({
        clientConfig: { region: config.region },
        identityPoolId: config.identityPoolId,
        logins: {
          [`cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`]: config.jwtToken,
        },
      }),
    });
  }

  async translateText(text: string): Promise<any[]> {
    if (!text.trim()) return [];

    try {
      const translations = await Promise.all(
        this.config.targetLanguages.map(async (targetLang) => {
          const result = await this.client.send(new TranslateTextCommand({
            Text: text,
            SourceLanguageCode: this.config.sourceLanguage,
            TargetLanguageCode: targetLang,
          }));

          return {
            targetLanguage: targetLang,
            text: result.TranslatedText || text,
            confidence: 0.95,
          };
        })
      );

      return translations;
    } catch (error) {
      console.error('Translation error:', error);
      this.emit('error', error);
      return [];
    }
  }
}
