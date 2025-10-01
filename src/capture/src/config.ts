import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

const configPath = path.join(app.getPath('userData'), 'config.json');

export interface AppConfig {
  endpoint: string;
  userPoolId: string;
  clientId: string;
  region: string;
  deviceId: string;
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
