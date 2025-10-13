import { PollyClient, SynthesizeSpeechCommand, VoiceId, Engine, OutputFormat } from '@aws-sdk/client-polly';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';

export interface PollyConfig {
  region: string;
  identityPoolId: string;
  userPoolId: string;
  jwtToken?: string; // Optional - can be provided by capture app
  enabled: boolean;
}

interface VoiceMapping {
  standard: VoiceId;
  neural: VoiceId;
}

export interface PollyCostStats {
  characters: number;
  standardCharacters: number;
  neuralCharacters: number;
  standardCost: number;
  neuralCost: number;
  totalCost: number;
  requestCount: number;
  sessionStartTime: Date;
  lastUpdated: Date;
}

// AWS Polly Pricing (per character)
const POLLY_PRICING = {
  standard: 4 / 1000000, // $4 per 1M characters
  neural: 16 / 1000000   // $16 per 1M characters
};

export class PollyService {
  private pollyClient?: PollyClient;
  private config: PollyConfig;
  private costStats: PollyCostStats = {
    characters: 0,
    standardCharacters: 0,
    neuralCharacters: 0,
    standardCost: 0,
    neuralCost: 0,
    totalCost: 0,
    requestCount: 0,
    sessionStartTime: new Date(),
    lastUpdated: new Date()
  };
  
  private readonly voiceMappings: Record<string, VoiceMapping> = {
    'en': { standard: VoiceId.Joanna, neural: VoiceId.Joanna },
    'es': { standard: VoiceId.Conchita, neural: VoiceId.Lucia },
    'fr': { standard: VoiceId.Celine, neural: VoiceId.Lea },
    'de': { standard: VoiceId.Marlene, neural: VoiceId.Vicki },
    'it': { standard: VoiceId.Carla, neural: VoiceId.Bianca }
  };

  constructor(config: PollyConfig) {
    this.config = config;
    this.resetCostStats();
    
    if (config.enabled && config.jwtToken) {
      this.initializeClient();
    }
  }

  private resetCostStats(): void {
    this.costStats = {
      characters: 0,
      standardCharacters: 0,
      neuralCharacters: 0,
      standardCost: 0,
      neuralCost: 0,
      totalCost: 0,
      requestCount: 0,
      sessionStartTime: new Date(),
      lastUpdated: new Date()
    };
  }

  private initializeClient(): void {
    if (!this.config.jwtToken) {
      console.warn('PollyService: jwtToken not provided, TTS will not be available');
      return;
    }

    this.pollyClient = new PollyClient({
      region: this.config.region,
      credentials: fromCognitoIdentityPool({
        clientConfig: { region: this.config.region },
        identityPoolId: this.config.identityPoolId,
        logins: {
          [`cognito-idp.${this.config.region}.amazonaws.com/${this.config.userPoolId}`]: this.config.jwtToken,
        },
      }),
    });
  }

  isEnabled(): boolean {
    return this.config.enabled && !!this.pollyClient;
  }

  async generateAudio(
    text: string, 
    language: string, 
    voiceType: 'neural' | 'standard' = 'neural'
  ): Promise<Buffer | null> {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const voiceMapping = this.voiceMappings[language];
      if (!voiceMapping) {
        console.warn(`No voice mapping for language: ${language}`);
        return null;
      }

      const voiceId = voiceType === 'neural' ? voiceMapping.neural : voiceMapping.standard;
      const engine = voiceType === 'neural' ? Engine.NEURAL : Engine.STANDARD;

      const command = new SynthesizeSpeechCommand({
        Text: text,
        OutputFormat: OutputFormat.MP3,
        VoiceId: voiceId,
        Engine: engine,
        SampleRate: '22050',
        TextType: 'text'
      });

      const response = await this.pollyClient!.send(command);
      
      if (!response.AudioStream) {
        throw new Error('No audio stream received from Polly');
      }

      // Track cost for this request
      const characterCount = text.length;
      this.trackCost(characterCount, voiceType);

      return await this.streamToBuffer(response.AudioStream);
    } catch (error) {
      console.error('Polly generation failed:', error);
      return null;
    }
  }

  private trackCost(characters: number, voiceType: 'neural' | 'standard'): void {
    const cost = characters * (voiceType === 'neural' ? POLLY_PRICING.neural : POLLY_PRICING.standard);
    
    this.costStats.characters += characters;
    this.costStats.requestCount += 1;
    this.costStats.lastUpdated = new Date();
    
    if (voiceType === 'neural') {
      this.costStats.neuralCharacters += characters;
      this.costStats.neuralCost += cost;
    } else {
      this.costStats.standardCharacters += characters;
      this.costStats.standardCost += cost;
    }
    
    this.costStats.totalCost = this.costStats.standardCost + this.costStats.neuralCost;
  }

  getCostStats(): PollyCostStats {
    return { ...this.costStats };
  }

  resetCosts(): void {
    this.resetCostStats();
  }

  private async streamToBuffer(stream: any): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  updateCredentials(jwtToken: string): void {
    this.config.jwtToken = jwtToken;
    if (this.config.enabled) {
      this.initializeClient();
    }
  }
}
