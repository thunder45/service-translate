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
  // Language settings
  sourceLanguage: string;
  targetLanguages: string[];
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
  // TTS settings
  tts: {
    mode: 'neural' | 'standard' | 'local' | 'disabled';
    host: string;
    port: number;
  };
}

export function validateConfig(config: AppConfig): string[] {
  const errors: string[] = [];
  
  // Critical fields only
  if (!config.userPoolId) errors.push('userPoolId is required');
  if (!config.clientId) errors.push('clientId is required');
  if (!config.identityPoolId) errors.push('identityPoolId is required');
  if (!config.region) errors.push('region is required');
  
  // Optional fields with defaults - only warn if invalid values provided
  if (config.tts?.port && (config.tts.port < 1 || config.tts.port > 65535)) {
    errors.push('TTS port must be between 1 and 65535');
  }
  
  return errors;
}

export function loadConfig(): AppConfig | null {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(data);
      
      // Validate config
      const errors = validateConfig(config);
      if (errors.length > 0) {
        console.warn('Config validation warnings:', errors);
      }
      
      return config;
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
  return null;
}

export function saveConfig(config: AppConfig): void {
  try {
    // Validate before saving
    const errors = validateConfig(config);
    if (errors.length > 0) {
      throw new Error(`Invalid config: ${errors.join(', ')}`);
    }
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Failed to save config:', error);
    throw error;
  }
}
