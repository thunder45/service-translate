#!/usr/bin/env node

/**
 * Deployment Manager
 * Manages different deployment scenarios and configurations
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { loadEnvironmentConfig } from '../config/environment';
import { getNetworkInfo, findAvailablePorts } from '../config/network-config';
import { WebSocketServerStarter } from './start-websocket-server';
import { PWAServerStarter } from './start-pwa-server';

export type DeploymentMode = 'local' | 'network' | 'cloud';

export interface DeploymentConfig {
  mode: DeploymentMode;
  websocketPort: number;
  httpPort: number;
  enableAuth: boolean;
  enableMdns: boolean;
  autoStart: boolean;
}

class DeploymentManager {
  private config: any;
  private processes: ChildProcess[] = [];
  private websocketStarter: WebSocketServerStarter;
  private pwaStarter: PWAServerStarter;

  constructor() {
    this.websocketStarter = new WebSocketServerStarter();
    this.pwaStarter = new PWAServerStarter();
  }

  async deploy(mode: DeploymentMode = 'local'): Promise<void> {
    console.log(`🚀 Starting Service Translate deployment in ${mode} mode...`);

    try {
      // Load configuration
      this.config = loadEnvironmentConfig();

      // Validate deployment requirements
      await this.validateDeploymentRequirements(mode);

      // Configure deployment
      const deploymentConfig = await this.configureDeployment(mode);

      // Start services based on mode
      await this.startServices(deploymentConfig);

      // Generate deployment documentation
      await this.generateDeploymentDocs(deploymentConfig);

      console.log(`✅ Deployment completed successfully in ${mode} mode!`);
      
      // Keep process alive
      await this.keepAlive();

    } catch (error) {
      console.error('❌ Deployment failed:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  private async validateDeploymentRequirements(mode: DeploymentMode): Promise<void> {
    console.log('🔍 Validating deployment requirements...');

    const requirements = [
      {
        name: 'Node.js version',
        test: () => this.checkNodeVersion(),
      },
      {
        name: 'Required directories',
        test: () => this.checkDirectories(),
      },
      {
        name: 'Configuration files',
        test: () => this.checkConfigFiles(),
      },
      {
        name: 'Port availability',
        test: () => this.checkPortAvailability(),
      },
    ];

    if (mode === 'network' || mode === 'cloud') {
      requirements.push({
        name: 'Network connectivity',
        test: () => this.checkNetworkConnectivity(),
      });
    }

    for (const requirement of requirements) {
      try {
        const result = await requirement.test();
        if (result) {
          console.log(`✅ ${requirement.name}`);
        } else {
          throw new Error(`${requirement.name} validation failed`);
        }
      } catch (error) {
        console.error(`❌ ${requirement.name}: ${error}`);
        throw error;
      }
    }
  }

  private async configureDeployment(mode: DeploymentMode): Promise<DeploymentConfig> {
    console.log(`⚙️  Configuring ${mode} deployment...`);

    let websocketPort = this.config.server.websocket.port;
    let httpPort = this.config.server.http.port;

    // Find available ports if needed
    const portsAvailable = await Promise.all([
      this.checkSinglePortAvailability(websocketPort),
      this.checkSinglePortAvailability(httpPort),
    ]);

    if (!portsAvailable[0] || !portsAvailable[1]) {
      console.log('🔍 Finding alternative ports...');
      const availablePorts = await findAvailablePorts(3000, 2);
      [httpPort, websocketPort] = availablePorts;
      console.log(`   - Using HTTP port: ${httpPort}`);
      console.log(`   - Using WebSocket port: ${websocketPort}`);
    }

    const deploymentConfig: DeploymentConfig = {
      mode,
      websocketPort,
      httpPort,
      enableAuth: mode !== 'local' ? true : this.config.security.enableAuth,
      enableMdns: mode === 'network' ? true : this.config.deployment.enableMdns,
      autoStart: true,
    };

    // Update environment with actual ports
    process.env.WEBSOCKET_PORT = websocketPort.toString();
    process.env.HTTP_SERVER_PORT = httpPort.toString();

    if (mode === 'network') {
      process.env.HTTP_SERVER_HOST = '0.0.0.0';
      process.env.WEBSOCKET_HOST = '0.0.0.0';
    }

    return deploymentConfig;
  }

  private async startServices(config: DeploymentConfig): Promise<void> {
    console.log('🚀 Starting services...');

    try {
      // Start PWA HTTP server first
      console.log('📱 Starting PWA HTTP server...');
      await this.pwaStarter.start();

      // Wait a moment
      await this.delay(1000);

      // Start WebSocket server
      console.log('🌐 Starting WebSocket server...');
      await this.websocketStarter.start();

      console.log('✅ All services started successfully');

    } catch (error) {
      console.error('❌ Failed to start services:', error);
      throw error;
    }
  }

  private async generateDeploymentDocs(config: DeploymentConfig): Promise<void> {
    console.log('📖 Generating deployment documentation...');

    const networkInfo = await getNetworkInfo(config.websocketPort, config.httpPort);

    // Generate deployment summary
    const deploymentSummary = `# Service Translate - Deployment Summary

## Deployment Configuration
- **Mode**: ${config.mode}
- **WebSocket Port**: ${config.websocketPort}
- **HTTP Port**: ${config.httpPort}
- **Authentication**: ${config.enableAuth ? 'Enabled' : 'Disabled'}
- **mDNS Discovery**: ${config.enableMdns ? 'Enabled' : 'Disabled'}

## Network Information
- **Local IP**: ${networkInfo.localIp}
- **Hostname**: ${networkInfo.hostname}
- **WebSocket URL**: ${networkInfo.websocketUrl}
- **PWA Client URL**: ${networkInfo.httpUrl}

## Client Connection Instructions
1. Ensure client devices are connected to the same network
2. Open a web browser on the client device
3. Navigate to: ${networkInfo.httpUrl}
4. Enter the session ID provided by the admin

## Available Endpoints
- **PWA Client**: ${networkInfo.httpUrl}
- **Health Check**: ${networkInfo.httpUrl}/health
- **Configuration**: ${networkInfo.httpUrl}/api/config
- **Network Info**: ${networkInfo.httpUrl}/api/network-info

## Troubleshooting
- Check firewall settings for ports ${config.websocketPort} and ${config.httpPort}
- Ensure all devices are on the same WiFi network
- Verify the admin application is running and connected
- Check the logs for any error messages

## Stopping Services
- Press Ctrl+C in the terminal to stop all services
- Or run: npm run stop

Generated on: ${new Date().toISOString()}
`;

    fs.writeFileSync('DEPLOYMENT_SUMMARY.md', deploymentSummary);

    // Generate QR code data for easy client connection
    const qrData = {
      url: networkInfo.httpUrl,
      websocket: networkInfo.websocketUrl,
      service: 'Service Translate',
      mode: config.mode,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync('client-connection.json', JSON.stringify(qrData, null, 2));

    console.log('✅ Documentation generated:');
    console.log('   - DEPLOYMENT_SUMMARY.md');
    console.log('   - client-connection.json');
  }

  private async keepAlive(): Promise<void> {
    console.log('\n🔄 Services are running. Press Ctrl+C to stop...');
    
    // Setup graceful shutdown
    const shutdown = async () => {
      console.log('\n🛑 Shutting down services...');
      await this.cleanup();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGUSR2', shutdown);

    // Keep the process alive
    return new Promise(() => {
      // This promise never resolves, keeping the process alive
    });
  }

  private async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up processes...');

    for (const process of this.processes) {
      if (process && !process.killed) {
        process.kill('SIGTERM');
      }
    }

    // Wait for processes to terminate
    await this.delay(2000);

    // Force kill if necessary
    for (const process of this.processes) {
      if (process && !process.killed) {
        process.kill('SIGKILL');
      }
    }
  }

  private async checkNodeVersion(): Promise<boolean> {
    const version = process.version;
    const majorVersion = parseInt(version.slice(1).split('.')[0]);
    return majorVersion >= 18;
  }

  private async checkDirectories(): Promise<boolean> {
    const requiredDirs = [
      'src/websocket-server',
      'src/client-pwa',
      'src/capture',
      this.config.audio.storagePath,
    ];

    return requiredDirs.every(dir => fs.existsSync(dir));
  }

  private async checkConfigFiles(): Promise<boolean> {
    const requiredFiles = [
      '.env',
      'src/websocket-server/package.json',
      'src/client-pwa/index.html',
    ];

    return requiredFiles.every(file => fs.existsSync(file));
  }

  private async checkPortAvailability(): Promise<boolean> {
    const websocketAvailable = await this.checkSinglePortAvailability(this.config.server.websocket.port);
    const httpAvailable = await this.checkSinglePortAvailability(this.config.server.http.port);
    
    return websocketAvailable && httpAvailable;
  }

  private async checkSinglePortAvailability(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const net = require('net');
      const server = net.createServer();

      server.listen(port, () => {
        server.once('close', () => resolve(true));
        server.close();
      });

      server.on('error', () => resolve(false));
    });
  }

  private async checkNetworkConnectivity(): Promise<boolean> {
    try {
      const networkInfo = await getNetworkInfo(
        this.config.server.websocket.port,
        this.config.server.http.port
      );
      return networkInfo.localIp !== '127.0.0.1';
    } catch {
      return false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI interface
if (require.main === module) {
  const mode = (process.argv[2] as DeploymentMode) || 'local';
  
  if (!['local', 'network', 'cloud'].includes(mode)) {
    console.error('❌ Invalid deployment mode. Use: local, network, or cloud');
    process.exit(1);
  }

  const manager = new DeploymentManager();
  manager.deploy(mode).catch(console.error);
}

export { DeploymentManager };