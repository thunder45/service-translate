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

      // Check if server directory exists
      const serverDir = path.join(process.cwd(), 'src', 'websocket-server');
      const serverScript = path.join(serverDir, 'dist', 'server.js');

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

    return new Promise((resolve, reject) => {
      this.serverProcess = spawn('node', [serverScript], {
        cwd: serverDir,
        stdio: 'inherit',
        env: {
          ...process.env,
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