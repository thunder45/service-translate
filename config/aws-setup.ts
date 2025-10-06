/**
 * AWS Setup and Credentials Manager
 * Handles AWS credentials configuration and validation for local deployment
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  sessionToken?: string;
}

export interface AwsProfile {
  name: string;
  credentials: AwsCredentials;
  isDefault: boolean;
}

export interface PollyVoiceInfo {
  id: string;
  name: string;
  languageCode: string;
  languageName: string;
  gender: string;
  engine: 'neural' | 'standard';
  supportedEngines: string[];
}

class AwsSetupManager {
  private readonly awsConfigDir = path.join(os.homedir(), '.aws');
  private readonly credentialsFile = path.join(this.awsConfigDir, 'credentials');
  private readonly configFile = path.join(this.awsConfigDir, 'config');

  /**
   * Check if AWS CLI is configured
   */
  public async isAwsCliConfigured(): Promise<boolean> {
    try {
      await fs.promises.access(this.credentialsFile, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get available AWS profiles
   */
  public async getAwsProfiles(): Promise<AwsProfile[]> {
    if (!await this.isAwsCliConfigured()) {
      return [];
    }

    try {
      const credentialsContent = await fs.promises.readFile(this.credentialsFile, 'utf8');
      const profiles: AwsProfile[] = [];
      
      const sections = this.parseIniFile(credentialsContent);
      
      for (const [sectionName, sectionData] of Object.entries(sections)) {
        const profileName = sectionName === 'default' ? 'default' : sectionName.replace('profile ', '');
        
        if (sectionData.aws_access_key_id && sectionData.aws_secret_access_key) {
          profiles.push({
            name: profileName,
            credentials: {
              accessKeyId: sectionData.aws_access_key_id,
              secretAccessKey: sectionData.aws_secret_access_key,
              region: sectionData.region || 'us-east-1',
              sessionToken: sectionData.aws_session_token,
            },
            isDefault: profileName === 'default',
          });
        }
      }

      return profiles;
    } catch (error) {
      console.error('Error reading AWS profiles:', error);
      return [];
    }
  }

  /**
   * Validate AWS credentials by testing Polly access
   */
  public async validateCredentials(credentials: AwsCredentials): Promise<boolean> {
    try {
      const { PollyClient, DescribeVoicesCommand } = await import('@aws-sdk/client-polly');
      
      const client = new PollyClient({
        region: credentials.region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          ...(credentials.sessionToken && { sessionToken: credentials.sessionToken }),
        },
      });

      await client.send(new DescribeVoicesCommand({ LanguageCode: 'en-US' }));
      return true;
    } catch (error) {
      console.error('AWS credentials validation failed:', error);
      return false;
    }
  }

  /**
   * Get available Polly voices for supported languages
   */
  public async getAvailableVoices(credentials: AwsCredentials): Promise<PollyVoiceInfo[]> {
    try {
      const { PollyClient, DescribeVoicesCommand } = await import('@aws-sdk/client-polly');
      
      const client = new PollyClient({
        region: credentials.region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          ...(credentials.sessionToken && { sessionToken: credentials.sessionToken }),
        },
      });

      const supportedLanguages = ['en-US', 'es-ES', 'fr-FR', 'de-DE', 'it-IT'];
      const allVoices: PollyVoiceInfo[] = [];

      for (const languageCode of supportedLanguages) {
        try {
          const response = await client.send(new DescribeVoicesCommand({ 
            LanguageCode: languageCode 
          }));

          if (response.Voices) {
            for (const voice of response.Voices) {
              allVoices.push({
                id: voice.Id || '',
                name: voice.Name || '',
                languageCode: voice.LanguageCode || '',
                languageName: voice.LanguageName || '',
                gender: voice.Gender || '',
                engine: voice.SupportedEngines?.includes('neural') ? 'neural' : 'standard',
                supportedEngines: voice.SupportedEngines || [],
              });
            }
          }
        } catch (error) {
          console.warn(`Could not fetch voices for ${languageCode}:`, error);
        }
      }

      return allVoices;
    } catch (error) {
      console.error('Error fetching Polly voices:', error);
      return [];
    }
  }

  /**
   * Create AWS credentials setup instructions
   */
  public generateSetupInstructions(): string {
    return `
# AWS Credentials Setup Instructions

## Option 1: AWS CLI (Recommended)

1. Install AWS CLI:
   - Windows: Download from https://aws.amazon.com/cli/
   - macOS: brew install awscli
   - Linux: sudo apt install awscli (Ubuntu) or sudo yum install awscli (RHEL)

2. Configure AWS CLI:
   aws configure
   
   Enter your credentials:
   - AWS Access Key ID: [Your access key]
   - AWS Secret Access Key: [Your secret key]
   - Default region name: us-east-1
   - Default output format: json

3. Test configuration:
   aws sts get-caller-identity

## Option 2: Environment Variables

Set the following environment variables:
- AWS_ACCESS_KEY_ID=your_access_key_here
- AWS_SECRET_ACCESS_KEY=your_secret_key_here
- AWS_REGION=us-east-1

## Option 3: Manual .env Configuration

Create a .env file in the project root with:
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=us-east-1

## Getting AWS Credentials

1. Sign in to AWS Console: https://console.aws.amazon.com/
2. Go to IAM → Users → [Your Username] → Security credentials
3. Create access key → Command Line Interface (CLI)
4. Download or copy the credentials

## Required Permissions

Your AWS user needs the following permissions:
- polly:SynthesizeSpeech
- polly:DescribeVoices
- transcribe:StartStreamTranscription
- translate:TranslateText

## Cost Considerations

- AWS Polly: $4/1M characters (Standard), $16/1M characters (Neural)
- AWS Transcribe: $0.024/minute
- AWS Translate: $15/1M characters
- Free tier available for new accounts

## Security Best Practices

1. Use IAM users with minimal required permissions
2. Enable MFA on your AWS account
3. Rotate access keys regularly
4. Never commit credentials to version control
5. Use AWS CLI profiles for multiple environments
`;
  }

  /**
   * Test Polly TTS functionality
   */
  public async testPollyTts(credentials: AwsCredentials, text: string = 'Hello, this is a test.'): Promise<boolean> {
    try {
      const { PollyClient, SynthesizeSpeechCommand } = await import('@aws-sdk/client-polly');
      
      const client = new PollyClient({
        region: credentials.region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          ...(credentials.sessionToken && { sessionToken: credentials.sessionToken }),
        },
      });

      const command = new SynthesizeSpeechCommand({
        Text: text,
        OutputFormat: 'mp3',
        VoiceId: 'Joanna',
        Engine: 'standard',
      });

      const response = await client.send(command);
      
      // Check if we got audio data
      if (response.AudioStream) {
        console.log('Polly TTS test successful - audio generated');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Polly TTS test failed:', error);
      return false;
    }
  }

  /**
   * Generate voice configuration for different languages
   */
  public generateVoiceConfiguration(voices: PollyVoiceInfo[]): Record<string, any> {
    const config: Record<string, any> = {};
    
    const languageMap = {
      'en-US': 'EN',
      'es-ES': 'ES', 
      'fr-FR': 'FR',
      'de-DE': 'DE',
      'it-IT': 'IT',
    };

    for (const [pollyLang, appLang] of Object.entries(languageMap)) {
      const languageVoices = voices.filter(v => v.languageCode === pollyLang);
      
      if (languageVoices.length > 0) {
        // Prefer neural voices, then standard
        const neuralVoices = languageVoices.filter(v => v.engine === 'neural');
        const standardVoices = languageVoices.filter(v => v.engine === 'standard');
        
        config[appLang] = {
          neural: neuralVoices.length > 0 ? neuralVoices[0].id : null,
          standard: standardVoices.length > 0 ? standardVoices[0].id : null,
          available: languageVoices.map(v => ({
            id: v.id,
            name: v.name,
            gender: v.gender,
            engine: v.engine,
          })),
        };
      }
    }

    return config;
  }

  private parseIniFile(content: string): Record<string, Record<string, string>> {
    const sections: Record<string, Record<string, string>> = {};
    let currentSection = '';

    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith(';')) {
        continue;
      }

      // Section header
      if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
        currentSection = trimmedLine.slice(1, -1);
        sections[currentSection] = {};
        continue;
      }

      // Key-value pair
      const equalIndex = trimmedLine.indexOf('=');
      if (equalIndex > 0 && currentSection) {
        const key = trimmedLine.slice(0, equalIndex).trim();
        const value = trimmedLine.slice(equalIndex + 1).trim();
        sections[currentSection][key] = value;
      }
    }

    return sections;
  }
}

// Export singleton instance
export const awsSetupManager = new AwsSetupManager();

// Export convenience functions
export async function validateAwsSetup(): Promise<boolean> {
  return await awsSetupManager.isAwsCliConfigured();
}

export async function getAwsProfiles(): Promise<AwsProfile[]> {
  return await awsSetupManager.getAwsProfiles();
}

export async function testPollyAccess(credentials: AwsCredentials): Promise<boolean> {
  return await awsSetupManager.validateCredentials(credentials);
}