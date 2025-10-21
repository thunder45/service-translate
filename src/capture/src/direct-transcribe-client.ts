import { EventEmitter } from 'events';
import { TranscribeStreamingClient, StartStreamTranscriptionCommand } from '@aws-sdk/client-transcribe-streaming';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';

interface TranscribeConfig {
  region: string;
  identityPoolId: string;
  userPoolId: string;
  sampleRate: number;
  languageCode: string;
  jwtToken: string;
}

export class DirectTranscribeClient extends EventEmitter {
  private client: TranscribeStreamingClient;
  private config: TranscribeConfig;
  private audioStream: any = null;
  private isStreaming = false;

  constructor(config: TranscribeConfig) {
    super();
    this.config = config;
    
    this.client = new TranscribeStreamingClient({
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

  async startStreaming(): Promise<void> {
    if (this.isStreaming) return;

    this.isStreaming = true;
    this.audioStream = this.createAudioStream();

    const command = new StartStreamTranscriptionCommand({
      LanguageCode: this.config.languageCode as any,
      MediaSampleRateHertz: this.config.sampleRate,
      MediaEncoding: 'pcm',
      AudioStream: this.audioStream,
      EnablePartialResultsStabilization: true,
      PartialResultsStability: 'medium',
    });

    try {
      const response = await this.client.send(command);
      this.processTranscriptionResults(response);
      this.emit('streaming-started');
    } catch (error) {
      console.error('AWS Transcribe authentication error:', error);
      console.error('This is likely a Cognito User Pool App Client configuration issue.');
      console.error('The ID token is missing the "aud" (audience) claim required by Identity Pool.');
      this.emit('error', error);
      this.isStreaming = false;
    }
  }

  private createAudioStream() {
    const audioQueue: Buffer[] = [];
    let streamEnded = false;

    const stream = {
      async *[Symbol.asyncIterator]() {
        while (!streamEnded || audioQueue.length > 0) {
          if (audioQueue.length > 0) {
            const chunk = audioQueue.shift()!;
            yield { AudioEvent: { AudioChunk: chunk } };
          } else {
            // Wait for more audio data
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }
      },
      addAudio: (audioChunk: Buffer) => {
        if (!streamEnded) {
          audioQueue.push(audioChunk);
        }
      },
      endStream: () => {
        streamEnded = true;
      }
    };

    return stream;
  }

  sendAudio(audioChunk: Buffer): void {
    if (this.isStreaming && this.audioStream) {
      this.audioStream.addAudio(audioChunk);
    }
  }

  private async processTranscriptionResults(response: any): Promise<void> {
    console.log('[DirectTranscribe] Processing transcription results...');
    
    if (!response.TranscriptResultStream) {
      console.error('[DirectTranscribe] No TranscriptResultStream in response');
      return;
    }

    try {
      console.log('[DirectTranscribe] Starting to process stream events...');
      for await (const event of response.TranscriptResultStream) {
        console.log('[DirectTranscribe] Received event:', event.constructor.name);
        
        if (event.TranscriptEvent?.Transcript?.Results) {
          console.log('[DirectTranscribe] Processing results, count:', event.TranscriptEvent.Transcript.Results.length);
          
          for (const result of event.TranscriptEvent.Transcript.Results) {
            const transcript = result.Alternatives?.[0]?.Transcript || '';
            const confidence = result.Alternatives?.[0]?.Confidence || 0;
            
            console.log('[DirectTranscribe] Transcription result:', {
              text: transcript,
              isPartial: result.IsPartial,
              confidence,
              alternatives: result.Alternatives?.length || 0
            });
            
            if (transcript.trim()) {
              this.emit('transcription', {
                text: transcript,
                isPartial: result.IsPartial,
                confidence,
                timestamp: new Date().toISOString(),
              });
            }
          }
        } else {
          console.log('[DirectTranscribe] Event has no transcript results');
        }
      }
    } catch (error: any) {
      if (error.name === 'BadRequestException' && error.message?.includes('timed out')) {
        console.log('[DirectTranscribe] Stream timed out - this is normal when no audio is detected');
        this.emit('timeout');
      } else {
        console.error('[DirectTranscribe] Transcription processing error:', error);
        this.emit('error', error);
      }
    }
  }

  stopStreaming(): void {
    if (!this.isStreaming) return;

    this.isStreaming = false;
    if (this.audioStream) {
      this.audioStream.endStream();
      this.audioStream = null;
    }
    this.emit('streaming-stopped');
  }
}
