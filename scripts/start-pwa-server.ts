#!/usr/bin/env node

/**
 * PWA HTTP Server Startup Script
 * Serves the Progressive Web Application for client devices
 */

import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as cors from 'cors';
import { loadEnvironmentConfig } from '../config/environment';
import { getNetworkInfo } from '../config/network-config';

class PWAServerStarter {
  private app: express.Application;
  private config: any;
  private server: any;

  constructor() {
    this.app = express();
  }

  async start(): Promise<void> {
    console.log('📱 Starting PWA HTTP Server...');

    try {
      // Load configuration
      this.config = loadEnvironmentConfig();

      // Setup middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Start server
      await this.startServer();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      console.log('✅ PWA HTTP server started successfully!');

    } catch (error) {
      console.error('❌ Failed to start PWA server:', error);
      process.exit(1);
    }
  }

  private setupMiddleware(): void {
    // Enable CORS for all origins (local network access)
    this.app.use(cors({
      origin: '*',
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));

    // Parse JSON bodies
    this.app.use(express.json());

    // Serve static files with proper headers
    this.app.use(express.static(path.join(process.cwd(), 'src', 'client-pwa'), {
      setHeaders: (res, filePath) => {
        // Set PWA-specific headers
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
        if (filePath.endsWith('manifest.json')) {
          res.setHeader('Content-Type', 'application/manifest+json');
        }
        if (filePath.endsWith('sw.js')) {
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Service-Worker-Allowed', '/');
        }
      },
    }));

    // Serve audio files from cache
    this.app.use('/audio', express.static(this.config.audio.storagePath, {
      setHeaders: (res, filePath) => {
        res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour cache
        res.setHeader('Access-Control-Allow-Origin', '*');
      },
    }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        services: {
          pwa: 'running',
          websocket: `ws://localhost:${this.config.server.websocket.port}`,
        },
      });
    });

    // Configuration endpoint for PWA
    this.app.get('/api/config', async (req, res) => {
      try {
        const networkInfo = await getNetworkInfo(
          this.config.server.websocket.port,
          this.config.server.http.port
        );

        res.json({
          websocketUrl: networkInfo.websocketUrl,
          httpUrl: networkInfo.httpUrl,
          supportedLanguages: ['EN', 'ES', 'FR', 'DE', 'IT'],
          audioFormats: ['mp3', 'ogg'],
          maxClients: this.config.security.maxClientsPerSession,
          version: '1.0.0',
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to get configuration' });
      }
    });

    // Session validation endpoint
    this.app.post('/api/validate-session', (req, res) => {
      const { sessionId } = req.body;
      
      if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ error: 'Invalid session ID' });
      }

      // Basic session ID validation (format: PREFIX-YYYY-NNN)
      const sessionPattern = new RegExp(`^${this.config.session.idPrefix}-\\d{4}-\\d{3}$`);
      const isValid = sessionPattern.test(sessionId);

      res.json({
        valid: isValid,
        sessionId: isValid ? sessionId : null,
        message: isValid ? 'Session ID format is valid' : 'Invalid session ID format',
      });
    });

    // Network information endpoint
    this.app.get('/api/network-info', async (req, res) => {
      try {
        const networkInfo = await getNetworkInfo(
          this.config.server.websocket.port,
          this.config.server.http.port
        );

        res.json({
          localIp: networkInfo.localIp,
          hostname: networkInfo.hostname,
          websocketUrl: networkInfo.websocketUrl,
          httpUrl: networkInfo.httpUrl,
          networkInterfaces: networkInfo.networkInterfaces.filter(iface => !iface.internal),
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to get network information' });
      }
    });

    // Audio file listing endpoint
    this.app.get('/api/audio/:language', (req, res) => {
      const { language } = req.params;
      const audioDir = path.join(this.config.audio.storagePath, language.toUpperCase());

      if (!fs.existsSync(audioDir)) {
        return res.json({ files: [] });
      }

      try {
        const files = fs.readdirSync(audioDir)
          .filter(file => file.endsWith('.mp3'))
          .map(file => ({
            name: file,
            url: `/audio/${language.toUpperCase()}/${file}`,
            size: fs.statSync(path.join(audioDir, file)).size,
            modified: fs.statSync(path.join(audioDir, file)).mtime,
          }));

        res.json({ files });
      } catch (error) {
        res.status(500).json({ error: 'Failed to list audio files' });
      }
    });

    // Catch-all route for PWA (SPA routing)
    this.app.get('*', (req, res) => {
      const indexPath = path.join(process.cwd(), 'src', 'client-pwa', 'index.html');
      
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send(`
          <html>
            <head><title>Service Translate - PWA Not Found</title></head>
            <body>
              <h1>PWA Client Not Found</h1>
              <p>The PWA client files are not available at: ${indexPath}</p>
              <p>Please ensure the client-pwa directory exists and contains the necessary files.</p>
            </body>
          </html>
        `);
      }
    });

    // Error handling middleware
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('Server error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: this.config.development.debugMode ? error.message : 'Something went wrong',
      });
    });
  }

  private async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.server.http.port, this.config.server.http.host, async () => {
        const networkInfo = await getNetworkInfo(
          this.config.server.websocket.port,
          this.config.server.http.port
        );

        console.log('📋 PWA Server Configuration:');
        console.log(`   - HTTP Port: ${this.config.server.http.port}`);
        console.log(`   - Host: ${this.config.server.http.host}`);
        console.log(`   - Local URL: ${networkInfo.httpUrl}`);
        console.log(`   - PWA Directory: ${path.join(process.cwd(), 'src', 'client-pwa')}`);
        console.log(`   - Audio Directory: ${this.config.audio.storagePath}`);

        resolve();
      });

      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`❌ Port ${this.config.server.http.port} is already in use`);
        } else {
          console.error('❌ Server error:', error);
        }
        reject(error);
      });
    });
  }

  private setupGracefulShutdown(): void {
    const shutdown = () => {
      console.log('\n🛑 Shutting down PWA HTTP server...');
      
      if (this.server) {
        this.server.close(() => {
          console.log('✅ PWA HTTP server stopped');
          process.exit(0);
        });

        // Force close after 5 seconds
        setTimeout(() => {
          console.log('Force closing PWA HTTP server...');
          process.exit(1);
        }, 5000);
      } else {
        process.exit(0);
      }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGUSR2', shutdown); // nodemon restart
  }
}

// Run if called directly
if (require.main === module) {
  const starter = new PWAServerStarter();
  starter.start().catch(console.error);
}

export { PWAServerStarter };