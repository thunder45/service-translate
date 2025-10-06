import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface AudioConfig {
  sampleRate: number;
  encoding: string;
  channels: number;
  device?: string;
}

export class AudioCapture extends EventEmitter {
  private config: AudioConfig;
  private process: any = null;
  private buffer: Buffer[] = [];
  private totalBytesSent = 0;
  private chunksSent = 0;

  constructor(config: AudioConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    const { spawn } = require('child_process');
    const { platform } = require('os');
    
    const isWindows = platform() === 'win32';
    let soxArgs: string[] = [];
    
    if (isWindows) {
      // Windows: Use waveaudio driver
      if (this.config.device && this.config.device !== 'default') {
        soxArgs = [
          '-t', 'waveaudio',
          this.config.device,
          '-t', 'raw',
          '-r', this.config.sampleRate.toString(),
          '-e', 'signed-integer',
          '-b', '16',
          '-c', this.config.channels.toString(),
          '-'
        ];
      } else {
        soxArgs = [
          '-t', 'waveaudio',
          '-d',
          '-t', 'raw',
          '-r', this.config.sampleRate.toString(),
          '-e', 'signed-integer',
          '-b', '16',
          '-c', this.config.channels.toString(),
          '-'
        ];
      }
    } else {
      // macOS: Use CoreAudio driver
      if (this.config.device && this.config.device !== 'default') {
        soxArgs = [
          '-t', 'coreaudio',
          this.config.device,
          '-t', 'raw',
          '-r', this.config.sampleRate.toString(),
          '-e', 'signed-integer',
          '-b', '16',
          '-c', this.config.channels.toString(),
          '-'
        ];
      } else {
        soxArgs = [
          '-d',
          '-t', 'raw',
          '-r', this.config.sampleRate.toString(),
          '-e', 'signed-integer',
          '-b', '16',
          '-c', this.config.channels.toString(),
          '-'
        ];
      }
    }
    
    this.process = spawn('sox', soxArgs);

    this.process.stdout.on('data', (chunk: Buffer) => {
      this.buffer.push(chunk);
      
      // Calculate audio level (RMS)
      const level = this.calculateAudioLevel(chunk);
      this.emit('level', level);
      
      // Emit chunks of ~8KB to match Transcribe requirements
      const totalSize = this.buffer.reduce((sum, b) => sum + b.length, 0);
      if (totalSize >= 8192) {
        const data = Buffer.concat(this.buffer);
        this.buffer = [];
        this.totalBytesSent += data.length;
        this.chunksSent++;
        this.emit('data', data);
        this.emit('stats', {
          totalBytes: this.totalBytesSent,
          chunks: this.chunksSent,
          lastChunkSize: data.length,
        });
      }
    });

    this.process.on('error', (err: Error) => {
      console.error('Audio capture error:', err);
      this.emit('error', err);
    });
  }

  private calculateAudioLevel(buffer: Buffer): number {
    // Calculate RMS (Root Mean Square) for audio level
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 2) {
      const sample = buffer.readInt16LE(i);
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / (buffer.length / 2));
    // Normalize to 0-100 with increased sensitivity
    return Math.min(100, (rms / 32768) * 100 * 20);
  }

  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.buffer = [];
    this.totalBytesSent = 0;
    this.chunksSent = 0;
  }
}
