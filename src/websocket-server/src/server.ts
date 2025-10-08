import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { SessionManager } from './session-manager';
import { MessageRouter } from './message-router';
import { AudioManager } from './audio-manager';
import { ServerErrorLogger } from './error-logger';
import { SecurityMiddleware, SecurityConfig } from './security-middleware';
import { PollyService } from './polly-service';

const app = express();
const server = createServer(app);

// Initialize error logger
const errorLogger = new ServerErrorLogger();

// Initialize session manager and audio manager
const sessionManager = new SessionManager();
const audioManager = new AudioManager();

// Initialize Polly service (optional)
const pollyService = new PollyService({
  region: process.env.AWS_REGION || 'us-east-1',
  identityPoolId: process.env.AWS_IDENTITY_POOL_ID || '',
  userPoolId: process.env.AWS_USER_POOL_ID || '',
  jwtToken: process.env.AWS_JWT_TOKEN || '',
  enabled: process.env.ENABLE_TTS === 'true'
});

// Initialize security middleware
const securityConfig: SecurityConfig = {
  auth: {
    enabled: process.env.ENABLE_AUTH === 'true',
    username: process.env.AUTH_USERNAME,
    password: process.env.AUTH_PASSWORD,
    sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
  },
  rateLimit: {
    websocketRateLimit: parseInt(process.env.WEBSOCKET_RATE_LIMIT_PER_SECOND || '10'),
    pollyRateLimit: parseInt(process.env.POLLY_RATE_LIMIT_PER_MINUTE || '60'),
    maxClientsPerSession: parseInt(process.env.MAX_CLIENTS_PER_SESSION || '50'),
    windowSizeMs: 60 * 1000, // 1 minute
  },
  sessionSecurity: {
    secureIds: process.env.SECURE_SESSION_IDS === 'true',
    idPrefix: process.env.SESSION_ID_PREFIX || 'CHURCH',
    secretKey: process.env.SESSION_SECRET || 'default-secret-key',
    maxSessionAge: parseInt(process.env.SESSION_TIMEOUT_MINUTES || '480') * 60 * 1000,
  },
  enableLogging: true,
  autoGenerateSessionIds: process.env.AUTO_GENERATE_SESSION_IDS === 'true', // Default: false
};

const securityMiddleware = new SecurityMiddleware(securityConfig);

// Configure CORS for local development
app.use(cors({
  origin: ["http://localhost:3000", "http://localhost:8080", "http://127.0.0.1:3000"],
  credentials: true
}));

// Initialize Socket.IO with CORS configuration
const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:8080',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:8080'
      ];
      // Allow Electron (file:// protocol has no origin) and allowed origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn('CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Initialize message router with audio manager and error logger
const messageRouter = new MessageRouter(io, sessionManager, audioManager, errorLogger);

const PORT = process.env.PORT || 3001;

// Audio file serving endpoint
app.get('/audio/:filename', (req, res) => {
  const filename = req.params.filename;
  const audioId = filename.split('.')[0]; // Remove extension
  
  const audioBuffer = audioManager.getAudioBuffer(audioId);
  if (!audioBuffer) {
    return res.status(404).json({ error: 'Audio file not found' });
  }

  const audioInfo = audioManager.getAudioById(audioId);
  if (!audioInfo) {
    return res.status(404).json({ error: 'Audio info not found' });
  }

  // Set appropriate headers
  res.setHeader('Content-Type', `audio/${audioInfo.format}`);
  res.setHeader('Content-Length', audioBuffer.length);
  res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
  res.setHeader('Accept-Ranges', 'bytes');

  res.send(audioBuffer);
});

// TTS capabilities endpoint
app.get('/tts/capabilities', async (req, res) => {
  try {
    const language = (req.query.language as string) || 'en';
    const capabilities = await messageRouter.testTTSCapabilities(language as any);
    res.json(capabilities);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to test TTS capabilities',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Health check endpoint with comprehensive monitoring
app.get('/health', (req, res) => {
  const sessions = sessionManager.getAllSessions();
  const cacheStats = audioManager.getCacheStats();
  const healthReport = errorLogger.generateHealthReport();
  const securityStats = securityMiddleware.getSecurityStatistics();
  
  res.json({ 
    status: healthReport.status,
    timestamp: new Date().toISOString(),
    connections: io.engine.clientsCount,
    activeSessions: sessions.length,
    audioCache: cacheStats,
    ttsService: 'available',
    uptime: healthReport.uptime,
    metrics: healthReport.metrics,
    issues: healthReport.issues,
    security: securityStats,
    sessions: sessions.map(s => ({
      sessionId: s.sessionId,
      status: s.status,
      clientCount: s.clients.size,
      createdAt: s.createdAt,
      ttsMode: s.config.ttsMode,
      enabledLanguages: s.config.enabledLanguages
    }))
  });
});

// Performance metrics endpoint
app.get('/metrics', (req, res) => {
  const metrics = errorLogger.getPerformanceMetrics();
  res.json({
    timestamp: new Date().toISOString(),
    ...metrics
  });
});

// Error logs endpoint
app.get('/logs', (req, res) => {
  const level = req.query.level as string;
  const count = parseInt(req.query.count as string) || 50;
  
  const logs = errorLogger.getRecentLogs(count, level as any);
  res.json({
    timestamp: new Date().toISOString(),
    count: logs.length,
    logs
  });
});

// Export monitoring data endpoint
app.get('/export', async (req, res) => {
  try {
    const exportPath = await errorLogger.exportData();
    res.download(exportPath);
  } catch (error) {
    errorLogger.error('system', 'Failed to export monitoring data', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`=== CLIENT CONNECTED: ${socket.id} ===`);
  console.log(`Remote address: ${socket.handshake.address}`);
  console.log(`User agent: ${socket.handshake.headers['user-agent']}`);
  
  let securityContext: any = null;
  
  try {
    // Authenticate connection
    securityContext = securityMiddleware.authenticateConnection(socket);
    
    // Log connection
    errorLogger.logConnection('connect', socket.id, {
      userAgent: socket.handshake.headers['user-agent'],
      remoteAddress: socket.handshake.address,
      authenticated: securityContext.isAuthenticated
    });
    
    // Send welcome message
    socket.emit('connected', {
      message: 'Connected to Service Translate WebSocket Server',
      socketId: socket.id,
      timestamp: new Date().toISOString(),
      authenticated: securityContext.isAuthenticated,
      securityEnabled: securityConfig.auth.enabled
    });
  } catch (error) {
    console.error(`Connection rejected for ${socket.id}:`, error);
    socket.emit('connection-rejected', {
      error: error instanceof Error ? error.message : 'Connection rejected',
      timestamp: new Date().toISOString()
    });
    socket.disconnect(true);
    return;
  }

  // Create secure message handler with rate limiting
  const secureMessageHandler = (messageType: string, handler: (data: any) => void) => {
    return (data: any) => {
      try {
        // Check rate limits
        if (!securityMiddleware.checkMessageRateLimit(securityContext)) {
          socket.emit('rate-limited', {
            message: 'Rate limit exceeded',
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Route message
        handler(data);
      } catch (error) {
        console.error(`Message handling error for ${messageType}:`, error);
        socket.emit('error', {
          message: 'Message processing failed',
          type: messageType,
          timestamp: new Date().toISOString()
        });
      }
    };
  };

  // Route all message types through the message router with security
  socket.on('start-session', secureMessageHandler('start-session', (data) => {
    console.log(`[${socket.id}] ← start-session:`, JSON.stringify(data, null, 2));
    // Optionally generate secure session ID
    if (data && typeof data === 'object') {
      const generatedId = securityMiddleware.generateSessionId(securityContext, data.sessionId);
      if (generatedId) {
        data.sessionId = generatedId;
      }
    }
    messageRouter.routeMessage(socket, 'start-session', data);
  }));
  
  socket.on('end-session', secureMessageHandler('end-session', (data) => {
    console.log(`[${socket.id}] ← end-session:`, JSON.stringify(data, null, 2));
    messageRouter.routeMessage(socket, 'end-session', data);
  }));
  
  socket.on('list-sessions', secureMessageHandler('list-sessions', () => {
    console.log(`[${socket.id}] ← list-sessions`);
    messageRouter.routeMessage(socket, 'list-sessions', {});
  }));
  
  socket.on('join-session', secureMessageHandler('join-session', (data) => {
    console.log(`[${socket.id}] ← join-session:`, JSON.stringify(data, null, 2));
    // Validate session join
    if (data && data.sessionId) {
      if (!securityMiddleware.validateSessionJoin(securityContext, data.sessionId)) {
        socket.emit('session-join-failed', {
          error: 'Session join validation failed',
          sessionId: data.sessionId,
          timestamp: new Date().toISOString()
        });
        return;
      }
    }
    messageRouter.routeMessage(socket, 'join-session', data);
  }));
  
  socket.on('leave-session', secureMessageHandler('leave-session', (data) => {
    console.log(`[${socket.id}] ← leave-session:`, JSON.stringify(data, null, 2));
    messageRouter.routeMessage(socket, 'leave-session', data);
  }));
  socket.on('change-language', secureMessageHandler('change-language', (data) => {
    console.log(`[${socket.id}] ← change-language:`, JSON.stringify(data, null, 2));
    messageRouter.routeMessage(socket, 'change-language', data);
  }));
  socket.on('config-update', secureMessageHandler('config-update', (data) => {
    console.log(`[${socket.id}] ← config-update:`, JSON.stringify(data, null, 2));
    messageRouter.routeMessage(socket, 'config-update', data);
  }));
  socket.on('tts-config-update', secureMessageHandler('tts-config-update', (data) => {
    console.log(`[${socket.id}] ← tts-config-update:`, JSON.stringify(data, null, 2));
    messageRouter.routeMessage(socket, 'tts-config-update', data);
  }));
  socket.on('language-update', secureMessageHandler('language-update', (data) => {
    console.log(`[${socket.id}] ← language-update:`, JSON.stringify(data, null, 2));
    messageRouter.routeMessage(socket, 'language-update', data);
  }));
  
  socket.on('generate-tts', secureMessageHandler('generate-tts', (data) => {
    console.log(`[${socket.id}] ← generate-tts:`, JSON.stringify(data, null, 2));
    // Check Polly rate limit for TTS requests
    if (!securityMiddleware.checkPollyRateLimit(securityContext)) {
      socket.emit('tts-rate-limited', {
        message: 'TTS rate limit exceeded',
        timestamp: new Date().toISOString()
      });
      return;
    }
    messageRouter.routeMessage(socket, 'generate-tts', data);
  }));
  
  socket.on('broadcast-translation', secureMessageHandler('broadcast-translation', async (data) => {
    console.log(`[${socket.id}] ← broadcast-translation:`, JSON.stringify(data, null, 2));
    
    // Generate TTS if enabled and requested
    if (data.generateTTS && pollyService.isEnabled() && data.translations) {
      const audioResults: any[] = [];
      
      for (const [language, text] of Object.entries(data.translations)) {
        try {
          const audioBuffer = await pollyService.generateAudio(
            text as string, 
            language, 
            data.voiceType || 'neural'
          );
          
          if (audioBuffer) {
            const audioInfo = await audioManager.storeAudioFile(
              audioBuffer,
              text as string,
              language as any,
              data.voiceType || 'neural',
              'mp3'
            );
            
            audioResults.push({
              language,
              text,
              audioUrl: audioInfo.url,
              audioMetadata: {
                audioId: audioInfo.id,
                url: audioInfo.url,
                duration: audioInfo.duration,
                format: audioInfo.format,
                voiceType: audioInfo.voiceType,
                size: audioInfo.size
              }
            });
          } else {
            // TTS failed, send text only
            audioResults.push({ language, text, audioUrl: null });
          }
        } catch (error) {
          console.error(`TTS generation failed for ${language}:`, error);
          audioResults.push({ language, text, audioUrl: null });
        }
      }
      
      // Broadcast with audio
      data.audioResults = audioResults;
    }
    
    messageRouter.routeMessage(socket, 'broadcast-translation', data);
  }));

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`=== CLIENT DISCONNECTED: ${socket.id} ===`);
    console.log(`Reason: ${reason}`);
    errorLogger.logConnection('disconnect', socket.id, { reason });
    
    // Handle security cleanup
    if (securityContext) {
      securityMiddleware.handleDisconnect(securityContext);
    }
    
    messageRouter.handleDisconnection(socket, reason);
  });
  
  // Basic ping/pong for connection health
  socket.on('ping', () => {
    console.log(`[${socket.id}] ← ping`);
    socket.emit('pong', { timestamp: new Date().toISOString() });
    console.log(`[${socket.id}] → pong`);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Service Translate WebSocket Server running on port ${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
});

// Cleanup inactive sessions every hour
setInterval(() => {
  sessionManager.cleanupInactiveSessions();
}, 60 * 60 * 1000);

// Security status endpoint
app.get('/security', (req, res) => {
  const stats = securityMiddleware.getSecurityStatistics();
  res.json({
    timestamp: new Date().toISOString(),
    ...stats,
    config: {
      authEnabled: securityConfig.auth.enabled,
      secureSessionIds: securityConfig.sessionSecurity.secureIds,
      rateLimiting: {
        websocket: securityConfig.rateLimit.websocketRateLimit,
        polly: securityConfig.rateLimit.pollyRateLimit,
        maxClients: securityConfig.rateLimit.maxClientsPerSession,
      },
    },
  });
});

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('Shutting down gracefully...');
  
  // Cleanup security middleware
  securityMiddleware.destroy();
  
  // Cleanup other services
  audioManager.shutdown();
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);