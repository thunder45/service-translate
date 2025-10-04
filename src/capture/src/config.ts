import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

const configPath = path.join(app.getPath('userData'), 'config.json');

export interface AppConfig {
  endpoint: string;
  userPoolId: string;
  clientId: string;
  identityPoolId: string;
  region: string;
  deviceId: string;
  // Audio settings
  inputDevice?: string;
  sampleRate?: number;
  encoding?: string;
  channels?: number;
  inputGain?: number;
  // Holyrics integration
  holyrics?: {
    enabled: boolean;
    host: string;
    port: number;
    token: string;
    language: string;
    maxLines: number;
  };
}

export function loadConfig(): AppConfig | null {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
  return null;
}

export function saveConfig(config: AppConfig): void {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Failed to save config:', error);
  }
}
