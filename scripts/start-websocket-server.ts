#!/usr/bin/env node

/**
 * WebSocket Server Startup Script
 * Starts the local WebSocket server with proper configuration
 */

import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { loadEnvironmentConfig } from '../config/environment';
import { getNetworkInfo } from '../config/network-config';

class WebSocketServerStarter {
  private serverProcess: ChildProcess | null = null;
  private config: any;

  async start(): Promise<void> {
    console.log('🌐 Starting WebSocket Server...');

    try {
      // Load configuration
      this.config = loadEnvironmentConfig();
      
      // Get network information
      const networkInfo = await getNetworkInfo(
        this.config.server.websocket.port,
        this.config.server.http.port
      );

      console.log('📋 Server Configuration:');
      console.log(`   - WebSocket Port: ${this.config.server.websocket.port}`);
      console.log(`   - HTTP Port: ${this.config.server.http.port}`);
      console.log(`   - Local IP: ${networkInfo.localIp}`);
      console.log(`   - WebSocket URL: ${networkInfo.websocketUrl}`);
      console.log(`   - HTTP URL: ${networkInfo.httpUrl}`);
      
      // Check server directory
      const serverDir = path.join(process.cwd(), 'src', 'websocket-server');
      
      // Validate Cognito configuration (fail-fast)
      await this.validateCognitoConfiguration(serverDir);

      // Verify Cognito connectivity
      await this.verifyCognitoConnectivity(serverDir);
      
      // Check directory setup
      this.checkDirectorySetup(serverDir);

      const serverScript = path.join(serverDir, 'dist', 'websocket-server', 'src', 'server.js');

      // Build if needed
      await this.buildServer(serverDir);

      // Start the server
      await this.startServer(serverDir, serverScript);

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      console.log('✅ WebSocket server started successfully!');
      console.log('\n📱 Client Connection Instructions:');
      console.log(`   1. Connect devices to the same WiFi network`);
      console.log(`   2. Open browser and go to: ${networkInfo.httpUrl}`);
      console.log(`   3. Enter session ID when prompted`);

    } catch (error) {
      console.error('❌ Failed to start WebSocket server:', error);
      process.exit(1);
    }
  }

  private async buildServer(serverDir: string): Promise<void> {
    console.log('🔨 Building WebSocket server...');

    return new Promise((resolve, reject) => {
      const buildProcess = spawn('npm', ['run', 'build'], {
        cwd: serverDir,
        stdio: 'inherit',
      });

      buildProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Server build completed');
          resolve();
        } else {
          reject(new Error(`Build failed with code ${code}`));
        }
      });

      buildProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async startServer(serverDir: string, serverScript: string): Promise<void> {
    console.log('🚀 Starting server process...');

    // Read .env file and extract Cognito configuration to pass to server
    const fs = require('fs');
    const envPath = path.join(serverDir, '.env');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    
    // Parse all environment variables from .env file
    const envVars: Record<string, string> = {};
    envContent.split('\n').forEach((line: string) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].split('#')[0].trim(); // Remove inline comments
          if (value) {
            envVars[key] = value;
          }
        }
      }
    });

    return new Promise((resolve, reject) => {
      this.serverProcess = spawn('node', [serverScript], {
        cwd: serverDir,
        stdio: 'inherit',
        env: {
          ...process.env,
          ...envVars, // Include all variables from .env file
          NODE_ENV: this.config.development.nodeEnv,
          DEBUG: this.config.development.debugMode ? '*' : '',
        },
      });

      // Give the server a moment to start
      setTimeout(() => {
        if (this.serverProcess && !this.serverProcess.killed) {
          resolve();
        } else {
          reject(new Error('Server process failed to start'));
        }
      }, 2000);

      this.serverProcess.on('error', (error) => {
        console.error('Server process error:', error);
        reject(error);
      });

      this.serverProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`Server process exited with code ${code}`);
        }
      });
    });
  }

  /**
   * Validate Cognito configuration (fail-fast)
   * Requirements: 2.4, 3.3, 3.4
   */
  private async validateCognitoConfiguration(serverDir: string): Promise<void> {
    console.log('\n🔐 Validating Cognito configuration...');
    
    const fs = require('fs');
    const envPath = path.join(serverDir, '.env');
    
    if (!fs.existsSync(envPath)) {
      console.error('\n❌ ERROR: .env file not found!');
      console.error('\n📋 Setup Instructions:');
      console.error('   1. Deploy the backend CDK stack:');
      console.error('      cd src/backend && npm run deploy');
      console.error('   2. Run the unified authentication setup:');
      console.error('      ./setup-unified-auth.sh');
      console.error('   3. Or manually create .env with Cognito configuration');
      console.error('\n   See: src/websocket-server/.env.example for required variables');
      throw new Error('Missing .env file');
    }
    
    const envContent = fs.readFileSync(envPath, 'utf-8');
    
    // Extract Cognito configuration
    const cognitoRegion = this.extractEnvVar(envContent, 'COGNITO_REGION');
    const cognitoUserPoolId = this.extractEnvVar(envContent, 'COGNITO_USER_POOL_ID');
    const cognitoClientId = this.extractEnvVar(envContent, 'COGNITO_CLIENT_ID');
    
    // Validate required Cognito variables
    const missingVars: string[] = [];
    
    if (!cognitoRegion || cognitoRegion.trim() === '') {
      missingVars.push('COGNITO_REGION');
    }
    
    if (!cognitoUserPoolId || cognitoUserPoolId.trim() === '') {
      missingVars.push('COGNITO_USER_POOL_ID');
    }
    
    if (!cognitoClientId || cognitoClientId.trim() === '') {
      missingVars.push('COGNITO_CLIENT_ID');
    }
    
    if (missingVars.length > 0) {
      console.error('\n❌ ERROR: Missing required Cognito configuration!');
      console.error(`\n   Missing variables: ${missingVars.join(', ')}`);
      console.error('\n📋 Setup Instructions:');
      console.error('   1. Deploy the backend CDK stack to create Cognito User Pool:');
      console.error('      cd src/backend && npm run deploy');
      console.error('   2. Copy the Cognito configuration from CDK output');
      console.error('   3. Run the unified authentication setup script:');
      console.error('      ./setup-unified-auth.sh');
      console.error('   4. Or manually add these variables to src/websocket-server/.env:');
      console.error('      COGNITO_REGION=<your-region>');
      console.error('      COGNITO_USER_POOL_ID=<your-user-pool-id>');
      console.error('      COGNITO_CLIENT_ID=<your-client-id>');
      console.error('\n   See: COGNITO_SETUP.md for detailed instructions');
      throw new Error(`Missing Cognito configuration: ${missingVars.join(', ')}`);
    }
    
    // Validate format of Cognito variables
    if (cognitoUserPoolId && !cognitoUserPoolId.match(/^[a-z]+-[a-z]+-\d+_[a-zA-Z0-9]+$/)) {
      console.error('\n❌ ERROR: Invalid COGNITO_USER_POOL_ID format!');
      console.error(`   Expected format: <region>_<id> (e.g., us-east-1_aBcDeFgHi)`);
      console.error(`   Got: ${cognitoUserPoolId}`);
      console.error('\n   Verify the User Pool ID from AWS Cognito console or CDK output');
      throw new Error('Invalid COGNITO_USER_POOL_ID format');
    }
    
    console.log('   ✓ COGNITO_REGION: ' + cognitoRegion);
    console.log('   ✓ COGNITO_USER_POOL_ID: ' + cognitoUserPoolId);
    console.log('   ✓ COGNITO_CLIENT_ID: ' + (cognitoClientId?.substring(0, 8) || '') + '...');
    console.log('✅ Cognito configuration validated');
  }
  
  /**
   * Verify Cognito connectivity by testing authentication
   * Requirements: 2.4, 3.4
   */
  private async verifyCognitoConnectivity(serverDir: string): Promise<void> {
    console.log('\n🔗 Verifying Cognito connectivity...');
    
    try {
      const fs = require('fs');
      const envPath = path.join(serverDir, '.env');
      const envContent = fs.readFileSync(envPath, 'utf-8');
      
      const cognitoRegion = this.extractEnvVar(envContent, 'COGNITO_REGION');
      const cognitoUserPoolId = this.extractEnvVar(envContent, 'COGNITO_USER_POOL_ID');
      const cognitoClientId = this.extractEnvVar(envContent, 'COGNITO_CLIENT_ID');
      
      // Import Cognito SDK
      const { CognitoIdentityProviderClient, DescribeUserPoolCommand } = 
        await import('@aws-sdk/client-cognito-identity-provider');
      
      // Type guard to ensure values are not null
      if (!cognitoRegion || !cognitoUserPoolId) {
        throw new Error('Invalid Cognito configuration');
      }
      
      const client = new CognitoIdentityProviderClient({ region: cognitoRegion });
      
      // Test connectivity by describing the User Pool
      await client.send(new DescribeUserPoolCommand({
        UserPoolId: cognitoUserPoolId
      }));
      
      console.log('✅ Cognito connectivity verified');
    } catch (error: any) {
      console.error('\n❌ ERROR: Failed to connect to Cognito!');
      
      if (error.name === 'ResourceNotFoundException') {
        console.error('\n   The Cognito User Pool does not exist or is not accessible.');
        console.error('   Verify the COGNITO_USER_POOL_ID in .env matches your deployed User Pool.');
      } else if (error.name === 'InvalidParameterException') {
        console.error('\n   Invalid Cognito configuration parameters.');
        console.error('   Check that COGNITO_REGION and COGNITO_USER_POOL_ID are correct.');
      } else if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
        console.error('\n   Network connectivity issue. Check your internet connection.');
      } else {
        console.error(`\n   Error: ${error.message}`);
      }
      
      console.error('\n📋 Troubleshooting:');
      console.error('   1. Verify the backend CDK stack is deployed:');
      console.error('      cd src/backend && npm run deploy');
      console.error('   2. Check AWS credentials are configured:');
      console.error('      aws sts get-caller-identity');
      console.error('   3. Verify Cognito User Pool exists in AWS Console');
      console.error('   4. Ensure COGNITO_REGION matches the User Pool region');
      console.error('\n   See: COGNITO_SETUP.md for detailed troubleshooting');
      
      throw new Error('Cognito connectivity check failed');
    }
  }
  
  /**
   * Check and create necessary directories
   */
  private checkDirectorySetup(serverDir: string): void {
    console.log('\n📁 Checking directory setup...');
    
    const fs = require('fs');
    const envPath = path.join(serverDir, '.env');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    
    // Check if admin identities directory exists
    const adminDir = this.extractEnvVar(envContent, 'ADMIN_IDENTITIES_DIR') || './admin-identities';
    const adminDirPath = path.join(serverDir, adminDir);
    if (!fs.existsSync(adminDirPath)) {
      console.log(`   Creating admin identities directory: ${adminDir}`);
      fs.mkdirSync(adminDirPath, { recursive: true });
    } else {
      console.log(`   ✓ Admin identities directory exists: ${adminDir}`);
    }
    
    // Check if sessions directory exists
    const sessionDir = this.extractEnvVar(envContent, 'SESSION_PERSISTENCE_DIR') || './sessions';
    const sessionDirPath = path.join(serverDir, sessionDir);
    if (!fs.existsSync(sessionDirPath)) {
      console.log(`   Creating sessions directory: ${sessionDir}`);
      fs.mkdirSync(sessionDirPath, { recursive: true });
    } else {
      console.log(`   ✓ Sessions directory exists: ${sessionDir}`);
    }
    
    console.log('✅ Directory setup complete');
  }
  
  /**
   * Extract environment variable from .env file content
   * Handles inline comments (e.g., VAR=value # comment)
   */
  private extractEnvVar(envContent: string, varName: string): string | null {
    const match = envContent.match(new RegExp(`^${varName}=(.*)$`, 'm'));
    if (!match) return null;
    
    // Remove inline comments and trim
    const value = match[1].split('#')[0].trim();
    return value || null;
  }

  private setupGracefulShutdown(): void {
    const shutdown = () => {
      console.log('\n🛑 Shutting down WebSocket server...');
      
      if (this.serverProcess) {
        this.serverProcess.kill('SIGTERM');
        
        // Force kill after 5 seconds
        setTimeout(() => {
          if (this.serverProcess && !this.serverProcess.killed) {
            console.log('Force killing server process...');
            this.serverProcess.kill('SIGKILL');
          }
        }, 5000);
      }
      
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGUSR2', shutdown); // nodemon restart
  }
}

// Run if called directly
if (require.main === module) {
  const starter = new WebSocketServerStarter();
  starter.start().catch(console.error);
}

export { WebSocketServerStarter };
