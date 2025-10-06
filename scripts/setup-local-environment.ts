#!/usr/bin/env node

/**
 * Local Environment Setup Script
 * Configures the local deployment environment for Service Translate TTS
 */

import * as fs from 'fs';
import * as path from 'path';
import { environmentManager, loadEnvironmentConfig } from '../config/environment';
import { networkConfigManager, getNetworkInfo } from '../config/network-config';
import { awsSetupManager, validateAwsSetup, getAwsProfiles } from '../config/aws-setup';

class LocalEnvironmentSetup {
  private config: any;

  async run(): Promise<void> {
    console.log('🚀 Service Translate - Local Environment Setup');
    console.log('================================================\n');

    try {
      // Step 1: Load and validate configuration
      await this.loadConfiguration();

      // Step 2: Check AWS credentials
      await this.checkAwsCredentials();

      // Step 3: Setup local directories and permissions
      await this.setupLocalDirectories();

      // Step 4: Configure network settings
      await this.configureNetwork();

      // Step 5: Validate setup
      await this.validateSetup();

      // Step 6: Generate connection instructions
      await this.generateInstructions();

      console.log('\n✅ Local environment setup completed successfully!');
      console.log('\nNext steps:');
      console.log('1. Start the WebSocket server: npm run start:server');
      console.log('2. Start the admin application: npm run start:admin');
      console.log('3. Share the connection URL with clients');

    } catch (error) {
      console.error('\n❌ Setup failed:', error);
      process.exit(1);
    }
  }

  private async loadConfiguration(): Promise<void> {
    console.log('📋 Loading configuration...');

    try {
      this.config = loadEnvironmentConfig();
      console.log('✅ Configuration loaded successfully');
      
      // Display key configuration values
      console.log(`   - Deployment mode: ${this.config.deployment.mode}`);
      console.log(`   - WebSocket port: ${this.config.server.websocket.port}`);
      console.log(`   - HTTP server port: ${this.config.server.http.port}`);
      console.log(`   - AWS region: ${this.config.aws.region}`);
      console.log(`   - TTS voice engine: ${this.config.aws.polly.voiceEngine}`);
      
    } catch (error) {
      console.error('❌ Configuration loading failed');
      
      if (!fs.existsSync('.env')) {
        console.log('\n💡 Creating .env file from template...');
        fs.copyFileSync('.env.example', '.env');
        console.log('✅ .env file created. Please edit it with your settings and run setup again.');
        process.exit(0);
      }
      
      throw error;
    }
  }

  private async checkAwsCredentials(): Promise<void> {
    console.log('\n🔐 Checking AWS credentials...');

    const isCliConfigured = await validateAwsSetup();
    
    if (isCliConfigured) {
      console.log('✅ AWS CLI is configured');
      
      const profiles = await getAwsProfiles();
      if (profiles.length > 0) {
        console.log(`   - Found ${profiles.length} AWS profile(s):`);
        profiles.forEach(profile => {
          console.log(`     • ${profile.name} (${profile.credentials.region})`);
        });

        // Test the default or first profile
        const testProfile = profiles.find(p => p.isDefault) || profiles[0];
        console.log(`\n🧪 Testing AWS Polly access with profile: ${testProfile.name}`);
        
        const isValid = await awsSetupManager.validateCredentials(testProfile.credentials);
        if (isValid) {
          console.log('✅ AWS Polly access confirmed');
          
          // Get available voices
          const voices = await awsSetupManager.getAvailableVoices(testProfile.credentials);
          console.log(`   - Found ${voices.length} available voices`);
          
          const voicesByLanguage = voices.reduce((acc, voice) => {
            acc[voice.languageCode] = (acc[voice.languageCode] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          
          Object.entries(voicesByLanguage).forEach(([lang, count]) => {
            console.log(`     • ${lang}: ${count} voices`);
          });
          
        } else {
          console.warn('⚠️  AWS Polly access test failed - check permissions');
        }
      }
    } else {
      console.warn('⚠️  AWS CLI not configured');
      console.log('\n💡 AWS Setup Instructions:');
      console.log(awsSetupManager.generateSetupInstructions());
    }
  }

  private async setupLocalDirectories(): Promise<void> {
    console.log('\n📁 Setting up local directories...');

    try {
      await environmentManager.setupLocalEnvironment();
      
      // Create additional directories
      const directories = [
        'logs',
        'config',
        'scripts',
        this.config.audio.storagePath,
        path.join(this.config.audio.storagePath, 'temp'),
        path.join(this.config.audio.storagePath, 'cache'),
      ];

      for (const dir of directories) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          console.log(`✅ Created directory: ${dir}`);
        }
      }

      // Set up audio storage structure
      const audioSubdirs = ['EN', 'ES', 'FR', 'DE', 'IT'];
      for (const lang of audioSubdirs) {
        const langDir = path.join(this.config.audio.storagePath, lang);
        if (!fs.existsSync(langDir)) {
          fs.mkdirSync(langDir, { recursive: true });
        }
      }

      console.log('✅ Local directories configured');
      
    } catch (error) {
      console.error('❌ Directory setup failed:', error);
      throw error;
    }
  }

  private async configureNetwork(): Promise<void> {
    console.log('\n🌐 Configuring network settings...');

    try {
      const networkInfo = await getNetworkInfo(
        this.config.server.websocket.port,
        this.config.server.http.port
      );

      console.log('✅ Network configuration completed');
      console.log(`   - Local IP: ${networkInfo.localIp}`);
      console.log(`   - Hostname: ${networkInfo.hostname}`);
      console.log(`   - WebSocket URL: ${networkInfo.websocketUrl}`);
      console.log(`   - HTTP URL: ${networkInfo.httpUrl}`);

      // Check port availability
      const websocketAvailable = await networkConfigManager.checkPortAvailability(
        this.config.server.websocket.port
      );
      const httpAvailable = await networkConfigManager.checkPortAvailability(
        this.config.server.http.port
      );

      if (!websocketAvailable) {
        console.warn(`⚠️  WebSocket port ${this.config.server.websocket.port} is not available`);
      }
      if (!httpAvailable) {
        console.warn(`⚠️  HTTP port ${this.config.server.http.port} is not available`);
      }

      if (!websocketAvailable || !httpAvailable) {
        console.log('\n💡 Finding alternative ports...');
        const availablePorts = await networkConfigManager.findAvailablePorts(3000, 2);
        console.log(`   - Alternative ports: ${availablePorts.join(', ')}`);
      }

      // Setup mDNS if enabled
      if (this.config.deployment.enableMdns) {
        await networkConfigManager.setupServiceDiscovery(
          this.config.deployment.serviceName,
          this.config.server.http.port
        );
      }

    } catch (error) {
      console.error('❌ Network configuration failed:', error);
      throw error;
    }
  }

  private async validateSetup(): Promise<void> {
    console.log('\n🔍 Validating setup...');

    const validations = [
      {
        name: 'Configuration file',
        test: () => fs.existsSync('.env'),
      },
      {
        name: 'Audio storage directory',
        test: () => fs.existsSync(this.config.audio.storagePath),
      },
      {
        name: 'Logs directory',
        test: () => fs.existsSync('logs'),
      },
      {
        name: 'WebSocket port availability',
        test: () => networkConfigManager.checkPortAvailability(this.config.server.websocket.port),
      },
      {
        name: 'HTTP port availability',
        test: () => networkConfigManager.checkPortAvailability(this.config.server.http.port),
      },
    ];

    let allValid = true;

    for (const validation of validations) {
      try {
        const result = await validation.test();
        if (result) {
          console.log(`✅ ${validation.name}`);
        } else {
          console.log(`❌ ${validation.name}`);
          allValid = false;
        }
      } catch (error) {
        console.log(`❌ ${validation.name}: ${error}`);
        allValid = false;
      }
    }

    if (!allValid) {
      throw new Error('Setup validation failed');
    }

    console.log('✅ All validations passed');
  }

  private async generateInstructions(): Promise<void> {
    console.log('\n📖 Generating setup instructions...');

    const networkInfo = await getNetworkInfo(
      this.config.server.websocket.port,
      this.config.server.http.port
    );

    // Generate connection instructions
    const connectionInstructions = networkConfigManager.generateConnectionInstructions(networkInfo);
    fs.writeFileSync('CONNECTION_INSTRUCTIONS.md', connectionInstructions);

    // Generate firewall instructions
    const firewallInstructions = networkConfigManager.generateFirewallInstructions(
      this.config.server.websocket.port,
      this.config.server.http.port
    );
    fs.writeFileSync('FIREWALL_SETUP.md', firewallInstructions);

    // Generate startup script
    const startupScript = this.generateStartupScript();
    fs.writeFileSync('start-service-translate.sh', startupScript);
    fs.chmodSync('start-service-translate.sh', '755');

    // Generate Windows batch file
    const windowsScript = this.generateWindowsStartupScript();
    fs.writeFileSync('start-service-translate.bat', windowsScript);

    console.log('✅ Instructions generated:');
    console.log('   - CONNECTION_INSTRUCTIONS.md');
    console.log('   - FIREWALL_SETUP.md');
    console.log('   - start-service-translate.sh (Linux/macOS)');
    console.log('   - start-service-translate.bat (Windows)');
  }

  private generateStartupScript(): string {
    return `#!/bin/bash

# Service Translate - Local Startup Script
# This script starts all required services for local deployment

echo "🚀 Starting Service Translate Local Services..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Navigate to project directory
cd "$(dirname "$0")"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build TypeScript if needed
echo "🔨 Building TypeScript..."
npm run build

# Start WebSocket server in background
echo "🌐 Starting WebSocket server..."
cd src/websocket-server
npm run start &
WEBSOCKET_PID=$!
cd ../..

# Wait a moment for server to start
sleep 2

# Start admin application
echo "🖥️  Starting admin application..."
cd src/capture
npm run start &
ADMIN_PID=$!
cd ../..

echo "✅ Services started successfully!"
echo "   - WebSocket Server PID: $WEBSOCKET_PID"
echo "   - Admin Application PID: $ADMIN_PID"
echo ""
echo "📱 Client connection URL: http://localhost:${this.config.server.http.port}"
echo "🌐 WebSocket URL: ws://localhost:${this.config.server.websocket.port}"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for interrupt signal
trap 'echo "🛑 Stopping services..."; kill $WEBSOCKET_PID $ADMIN_PID; exit 0' INT
wait
`;
  }

  private generateWindowsStartupScript(): string {
    return `@echo off
REM Service Translate - Windows Startup Script

echo 🚀 Starting Service Translate Local Services...

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed. Please install Node.js first.
    pause
    exit /b 1
)

REM Navigate to project directory
cd /d "%~dp0"

REM Install dependencies if needed
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    npm install
)

REM Build TypeScript
echo 🔨 Building TypeScript...
npm run build

REM Start WebSocket server
echo 🌐 Starting WebSocket server...
start "WebSocket Server" cmd /k "cd src\\websocket-server && npm run start"

REM Wait for server to start
timeout /t 3 /nobreak >nul

REM Start admin application
echo 🖥️  Starting admin application...
start "Admin Application" cmd /k "cd src\\capture && npm run start"

echo ✅ Services started successfully!
echo.
echo 📱 Client connection URL: http://localhost:${this.config.server.http.port}
echo 🌐 WebSocket URL: ws://localhost:${this.config.server.websocket.port}
echo.
echo Press any key to exit...
pause >nul
`;
  }
}

// Run setup if called directly
if (require.main === module) {
  const setup = new LocalEnvironmentSetup();
  setup.run().catch(console.error);
}

export { LocalEnvironmentSetup };