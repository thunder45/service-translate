import { EventEmitter } from 'events';
import { exec, spawnSync } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

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
    
    const isWindows = os.platform() === 'win32';
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
      // Always use default device (-d) as device enumeration IDs don't match SoX device numbers
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
    
    console.log('[AudioCapture] Starting SoX with args:', soxArgs);
    this.process = spawn('sox', soxArgs);

    // Log when SoX process starts
    console.log('[AudioCapture] SoX process spawned, PID:', this.process.pid);

    this.process.stdout.on('data', (chunk: Buffer) => {
      console.log(`[AudioCapture] Captured ${chunk.length} bytes from microphone`);
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

    // Log stderr output from SoX (warnings, errors only - skip progress updates)
    this.process.stderr.on('data', (data: Buffer) => {
      const message = data.toString().trim();
      // Skip progress updates (In:X.XX% ...) but log errors, warnings, and initial info
      if (!message.match(/^In:\d+\.\d+%/)) {
        console.log('[AudioCapture] SoX stderr:', message);
      }
    });

    this.process.on('error', (err: Error) => {
      console.error('[AudioCapture] Process error:', err);
      this.emit('error', err);
    });

    this.process.on('close', (code: number, signal: string) => {
      console.log('[AudioCapture] SoX process closed, code:', code, 'signal:', signal);
    });

    this.process.on('exit', (code: number, signal: string) => {
      console.log('[AudioCapture] SoX process exited, code:', code, 'signal:', signal);
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

/**
 * Enumerate Windows recording devices using PowerShell's Get-CimInstance.
 * Uses spawnSync (tries 'powershell' then 'pwsh') to avoid quoting issues when using exec.
 */
export async function getWindowsRecordingDevices(): Promise<string[]> {
  const psScript = `
    Get-CimInstance Win32_SoundDevice |
    Where-Object { $_.ConfigManagerErrorCode -eq 0 -and $_.StatusInfo -eq 3 } |
    Select-Object -ExpandProperty Name
  `.trim();

  const shells = ['powershell', 'pwsh'];
  for (const shell of shells) {
    try {
      const res = spawnSync(shell, ['-NoProfile', '-Command', psScript], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10000
      });

      if (res.error) {
        // executable not found or spawn error
        console.warn(`[AudioCapture] ${shell} spawn error:`, res.error);
        continue;
      }

      if (res.status !== 0) {
        console.warn(`[AudioCapture] ${shell} exited with status ${res.status}:`, (res.stderr || '').toString().trim());
        continue;
      }

      const stdout = (res.stdout || '').toString();
      const devices = stdout
        .split(/\r?\n/)
        .map(d => d.trim())
        .filter(Boolean);

      if (devices.length > 0) {
        console.log('[AudioCapture] Found audio devices:', devices);
        return devices;
      }
    } catch (err) {
      console.warn(`[AudioCapture] Error running ${shell}:`, err);
      continue;
    }
  }

  console.warn('[AudioCapture] Falling back to default device only');
  return ['Default'];
}

/**
 * Cross-platform device enumeration
 */
export async function enumerateInputDevices(): Promise<string[]> {
  if (os.platform() === 'win32') {
    return getWindowsRecordingDevices();
  }

  // Generic fallback for non-Windows platforms
  console.warn('No native audio enumeration available; returning default device only');
  return ['Default'];
}
