import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface AudioConfig {
  sampleRate: number;
  encoding: string;
  channels: number;
}

export class AudioCapture extends EventEmitter {
  private config: AudioConfig;
  private process: any = null;
  private buffer: Buffer[] = [];

  constructor(config: AudioConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    // Use sox to capture audio on macOS
    const { spawn } = require('child_process');
    
    this.process = spawn('sox', [
      '-d',                                    // Default audio device
      '-t', 'raw',                            // Raw output
      '-r', this.config.sampleRate.toString(), // Sample rate
      '-e', 'signed-integer',                 // Encoding
      '-b', '16',                             // Bit depth
      '-c', this.config.channels.toString(),  // Channels
      '-',                                    // Output to stdout
    ]);

    this.process.stdout.on('data', (chunk: Buffer) => {
      this.buffer.push(chunk);
      
      // Emit chunks of ~32KB
      const totalSize = this.buffer.reduce((sum, b) => sum + b.length, 0);
      if (totalSize >= 32000) {
        const data = Buffer.concat(this.buffer);
        this.buffer = [];
        this.emit('data', data);
      }
    });

    this.process.on('error', (err: Error) => {
      console.error('Audio capture error:', err);
    });
  }

  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.buffer = [];
  }
}
