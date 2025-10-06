/**
 * Environment Configuration Manager
 * Handles loading and validation of environment variables for local deployment
 */

import * as fs from 'fs';
import * as path from 'path';

export interface EnvironmentConfig {
  // AWS Configuration
  aws: {
    region: string;
    profile?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    polly: {
      region: string;
      voiceEngine: 'neural' | 'standard';
      outputFormat: 'mp3' | 'ogg_vorbis' | 'pcm';
    };
  };

  // Server Configuration
  server: {
    websocket: {
      host: string;
      port: number;
      corsOrigin: string;
    };
    http: {
      host: string;
      port: number;
    };
  };

  // Session Configuration
  session: {
    idPrefix: string;
    timeoutMinutes: number;
    maxConcurrentSessions: number;
    secret: string;
    secureIds: boolean;
  };

  // Audio Configuration
  audio: {
    storagePath: string;
    cacheSizeMB: number;
    cleanupIntervalHours: number;
    maxAgeHours: number;
    bitrate: number;
    sampleRate: number;
    channels: number;
  };

  // Security Configuration
  security: {
    enableAuth: boolean;
    authUsername?: string;
    authPassword?: string;
    pollyRateLimitPerMinute: number;
    websocketRateLimitPerSecond: number;
    maxClientsPerSession: number;
  };

  // Deployment Configuration
  deployment: {
    mode: 'local' | 'network' | 'cloud';
    enableMdns: boolean;
    serviceName: string;
  };

  // Monitoring Configuration
  monitoring: {
    logLevel: 'error' | 'warn' | 'info' | 'debug';
    logFilePath: string;
    enableFileLogging: boolean;
    enableConsoleLogging: boolean;
    enableCostTracking: boolean;
    costWarningThresholdUSD: number;
    costAlertIntervalMinutes: number;
    enablePerformanceMonitoring: boolean;
    audioLatencyThresholdMs: number;
    websocketPingIntervalMs: number;
  };

  // Development Configuration
  development: {
    nodeEnv: 'development' | 'production';
    debugMode: boolean;
    enableHotReload: boolean;
    enableTestEndpoints: boolean;
    mockAwsServices: boolean;
  };
}

class EnvironmentManager {
  private config: EnvironmentConfig | null = null;

  /**
   * Load environment configuration from .env file and environment variables
   */
  public loadConfig(): EnvironmentConfig {
    if (this.config) {
      return this.config;
    }

    // Load .env file if it exists
    this.loadDotEnvFile();

    // Build configuration object
    this.config = {
      aws: {
        region: this.getEnvVar('AWS_REGION', 'us-east-1'),
        profile: this.getEnvVar('AWS_PROFILE'),
        accessKeyId: this.getEnvVar('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.getEnvVar('AWS_SECRET_ACCESS_KEY'),
        polly: {
          region: this.getEnvVar('AWS_POLLY_REGION', 'us-east-1'),
          voiceEngine: this.getEnvVar('AWS_POLLY_VOICE_ENGINE', 'neural') as 'neural' | 'standard',
          outputFormat: this.getEnvVar('AWS_POLLY_OUTPUT_FORMAT', 'mp3') as 'mp3' | 'ogg_vorbis' | 'pcm',
        },
      },

      server: {
        websocket: {
          host: this.getEnvVar('WEBSOCKET_HOST', 'localhost'),
          port: parseInt(this.getEnvVar('WEBSOCKET_PORT', '3001')),
          corsOrigin: this.getEnvVar('WEBSOCKET_CORS_ORIGIN', '*'),
        },
        http: {
          host: this.getEnvVar('HTTP_SERVER_HOST', '0.0.0.0'),
          port: parseInt(this.getEnvVar('HTTP_SERVER_PORT', '3000')),
        },
      },

      session: {
        idPrefix: this.getEnvVar('SESSION_ID_PREFIX', 'CHURCH'),
        timeoutMinutes: parseInt(this.getEnvVar('SESSION_TIMEOUT_MINUTES', '480')),
        maxConcurrentSessions: parseInt(this.getEnvVar('MAX_CONCURRENT_SESSIONS', '5')),
        secret: this.getEnvVar('SESSION_SECRET', this.generateDefaultSecret()),
        secureIds: this.getBooleanEnvVar('SECURE_SESSION_IDS', true),
      },

      audio: {
        storagePath: this.getEnvVar('AUDIO_STORAGE_PATH', './audio-cache'),
        cacheSizeMB: parseInt(this.getEnvVar('AUDIO_CACHE_SIZE_MB', '500')),
        cleanupIntervalHours: parseInt(this.getEnvVar('AUDIO_CLEANUP_INTERVAL_HOURS', '24')),
        maxAgeHours: parseInt(this.getEnvVar('AUDIO_MAX_AGE_HOURS', '48')),
        bitrate: parseInt(this.getEnvVar('AUDIO_BITRATE', '128')),
        sampleRate: parseInt(this.getEnvVar('AUDIO_SAMPLE_RATE', '22050')),
        channels: parseInt(this.getEnvVar('AUDIO_CHANNELS', '1')),
      },

      security: {
        enableAuth: this.getBooleanEnvVar('ENABLE_AUTH', false),
        authUsername: this.getEnvVar('AUTH_USERNAME'),
        authPassword: this.getEnvVar('AUTH_PASSWORD'),
        pollyRateLimitPerMinute: parseInt(this.getEnvVar('POLLY_RATE_LIMIT_PER_MINUTE', '60')),
        websocketRateLimitPerSecond: parseInt(this.getEnvVar('WEBSOCKET_RATE_LIMIT_PER_SECOND', '10')),
        maxClientsPerSession: parseInt(this.getEnvVar('MAX_CLIENTS_PER_SESSION', '50')),
      },

      deployment: {
        mode: this.getEnvVar('DEPLOYMENT_MODE', 'local') as 'local' | 'network' | 'cloud',
        enableMdns: this.getBooleanEnvVar('ENABLE_MDNS', true),
        serviceName: this.getEnvVar('SERVICE_NAME', 'service-translate'),
      },

      monitoring: {
        logLevel: this.getEnvVar('LOG_LEVEL', 'info') as 'error' | 'warn' | 'info' | 'debug',
        logFilePath: this.getEnvVar('LOG_FILE_PATH', './logs/service-translate.log'),
        enableFileLogging: this.getBooleanEnvVar('ENABLE_FILE_LOGGING', true),
        enableConsoleLogging: this.getBooleanEnvVar('ENABLE_CONSOLE_LOGGING', true),
        enableCostTracking: this.getBooleanEnvVar('ENABLE_COST_TRACKING', true),
        costWarningThresholdUSD: parseFloat(this.getEnvVar('COST_WARNING_THRESHOLD_USD', '3.00')),
        costAlertIntervalMinutes: parseInt(this.getEnvVar('COST_ALERT_INTERVAL_MINUTES', '15')),
        enablePerformanceMonitoring: this.getBooleanEnvVar('ENABLE_PERFORMANCE_MONITORING', true),
        audioLatencyThresholdMs: parseInt(this.getEnvVar('AUDIO_LATENCY_THRESHOLD_MS', '2000')),
        websocketPingIntervalMs: parseInt(this.getEnvVar('WEBSOCKET_PING_INTERVAL_MS', '30000')),
      },

      development: {
        nodeEnv: this.getEnvVar('NODE_ENV', 'production') as 'development' | 'production',
        debugMode: this.getBooleanEnvVar('DEBUG_MODE', false),
        enableHotReload: this.getBooleanEnvVar('ENABLE_HOT_RELOAD', false),
        enableTestEndpoints: this.getBooleanEnvVar('ENABLE_TEST_ENDPOINTS', false),
        mockAwsServices: this.getBooleanEnvVar('MOCK_AWS_SERVICES', false),
      },
    };

    // Validate configuration
    this.validateConfig(this.config);

    return this.config;
  }

  /**
   * Get current configuration (must call loadConfig first)
   */
  public getConfig(): EnvironmentConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    return this.config;
  }

  /**
   * Create necessary directories and files for local deployment
   */
  public async setupLocalEnvironment(): Promise<void> {
    const config = this.getConfig();

    // Create audio storage directory
    await this.ensureDirectoryExists(config.audio.storagePath);

    // Create logs directory
    const logDir = path.dirname(config.monitoring.logFilePath);
    await this.ensureDirectoryExists(logDir);

    // Set up audio storage permissions
    await this.setupAudioStoragePermissions(config.audio.storagePath);

    console.log('Local environment setup completed successfully');
  }

  /**
   * Validate AWS credentials and connectivity
   */
  public async validateAwsCredentials(): Promise<boolean> {
    try {
      const { PollyClient, DescribeVoicesCommand } = await import('@aws-sdk/client-polly');
      const config = this.getConfig();

      const pollyClient = new PollyClient({
        region: config.aws.polly.region,
        ...(config.aws.accessKeyId && config.aws.secretAccessKey ? {
          credentials: {
            accessKeyId: config.aws.accessKeyId,
            secretAccessKey: config.aws.secretAccessKey,
          },
        } : {}),
      });

      // Test connection by listing voices
      await pollyClient.send(new DescribeVoicesCommand({}));
      console.log('AWS Polly credentials validated successfully');
      return true;
    } catch (error) {
      console.error('AWS credentials validation failed:', error);
      return false;
    }
  }

  private loadDotEnvFile(): void {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const lines = envContent.split('\n');

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const [key, ...valueParts] = trimmedLine.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').trim();
            if (!process.env[key]) {
              process.env[key] = value;
            }
          }
        }
      }
    }
  }

  private getEnvVar(key: string, defaultValue?: string): string {
    const value = process.env[key];
    if (value !== undefined) {
      return value;
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Required environment variable ${key} is not set`);
  }

  private getBooleanEnvVar(key: string, defaultValue: boolean): boolean {
    const value = process.env[key];
    if (value === undefined) {
      return defaultValue;
    }
    return value.toLowerCase() === 'true' || value === '1';
  }

  private generateDefaultSecret(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  private validateConfig(config: EnvironmentConfig): void {
    // Validate required AWS configuration
    if (!config.aws.region) {
      throw new Error('AWS region is required');
    }

    // Validate ports
    if (config.server.websocket.port < 1 || config.server.websocket.port > 65535) {
      throw new Error('WebSocket port must be between 1 and 65535');
    }

    if (config.server.http.port < 1 || config.server.http.port > 65535) {
      throw new Error('HTTP server port must be between 1 and 65535');
    }

    // Validate session configuration
    if (config.session.timeoutMinutes < 1) {
      throw new Error('Session timeout must be at least 1 minute');
    }

    // Validate audio configuration
    if (config.audio.cacheSizeMB < 10) {
      throw new Error('Audio cache size must be at least 10MB');
    }

    // Validate security configuration
    if (config.security.enableAuth && (!config.security.authUsername || !config.security.authPassword)) {
      throw new Error('Authentication username and password are required when auth is enabled');
    }

    console.log('Environment configuration validated successfully');
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.promises.access(dirPath);
    } catch {
      await fs.promises.mkdir(dirPath, { recursive: true });
      console.log(`Created directory: ${dirPath}`);
    }
  }

  private async setupAudioStoragePermissions(audioPath: string): Promise<void> {
    try {
      // Ensure the directory has proper read/write permissions
      await fs.promises.access(audioPath, fs.constants.R_OK | fs.constants.W_OK);
      console.log(`Audio storage permissions verified: ${audioPath}`);
    } catch (error) {
      console.warn(`Warning: Could not verify audio storage permissions for ${audioPath}:`, error);
    }
  }
}

// Export singleton instance
export const environmentManager = new EnvironmentManager();

// Export configuration loading function for easy use
export function loadEnvironmentConfig(): EnvironmentConfig {
  return environmentManager.loadConfig();
}

// Export setup function for local deployment
export async function setupLocalEnvironment(): Promise<void> {
  await environmentManager.setupLocalEnvironment();
}

// Export AWS validation function
export async function validateAwsCredentials(): Promise<boolean> {
  return await environmentManager.validateAwsCredentials();
}