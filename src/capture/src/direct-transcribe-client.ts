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
      console.error('Transcribe streaming error:', error);
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
    if (!response.TranscriptResultStream) return;

    try {
      for await (const event of response.TranscriptResultStream) {
        if (event.TranscriptEvent?.Transcript?.Results) {
          for (const result of event.TranscriptEvent.Transcript.Results) {
            const transcript = result.Alternatives?.[0]?.Transcript || '';
            const confidence = result.Alternatives?.[0]?.Confidence || 0;
            
            this.emit('transcription', {
              text: transcript,
              isPartial: result.IsPartial,
              confidence,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    } catch (error: any) {
      if (error.name === 'BadRequestException' && error.message?.includes('timed out')) {
        console.log('Transcription stream timed out - this is normal when no audio is detected');
        this.emit('timeout');
      } else {
        console.error('Transcription processing error:', error);
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
