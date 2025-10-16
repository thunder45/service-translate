import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { config } from 'dotenv';
import { SessionManager } from './session-manager';
import { MessageRouter } from './message-router';
import { AudioManager } from './audio-manager';
import { ServerErrorLogger } from './error-logger';
import { SecurityMiddleware, SecurityConfig } from './security-middleware';
import { PollyService } from './polly-service';
import { AdminIdentityStore } from './admin-identity-store';
import { AdminIdentityManager } from './admin-identity-manager';
import { AuthManager, AuthConfig } from './auth-manager';
import { CognitoAuthService } from './cognito-auth';
import { TokenStore } from './token-store';
import * as path from 'path';

// Load environment variables
config();

const app = express();
const server = createServer(app);

// Validate Cognito configuration on startup (fail fast if missing)
function validateCognitoConfig(): void {
  const requiredVars = [
    'COGNITO_REGION',
    'COGNITO_USER_POOL_ID',
    'COGNITO_CLIENT_ID'
  ];

  const missing: string[] = [];
  
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    console.error('');
    console.error('========================================');
    console.error('COGNITO CONFIGURATION ERROR');
    console.error('========================================');
    console.error('');
    console.error('Missing required Cognito environment variables:');
    missing.forEach(varName => console.error(`  - ${varName}`));
    console.error('');
    console.error('These values are obtained from the CDK deployment output.');
    console.error('');
    console.error('Setup Instructions:');
    console.error('  1. Deploy the backend CDK stack:');
    console.error('     cd src/backend && npm run deploy');
    console.error('');
    console.error('  2. Copy the Cognito values from CDK output to .env:');
    console.error('     COGNITO_REGION=us-east-1');
    console.error('     COGNITO_USER_POOL_ID=us-east-1_xxxxxx');
    console.error('     COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx');
    console.error('');
    console.error('  3. Ensure User Pool Client is configured as:');
    console.error('     - Client Type: Public client (no secret)');
    console.error('     - Auth Flows: ALLOW_USER_PASSWORD_AUTH, ALLOW_REFRESH_TOKEN_AUTH');
    console.error('');
    console.error('========================================');
    console.error('');
    process.exit(1);
  }

  console.log('✓ Cognito configuration validated');
  console.log(`  Region: ${process.env.COGNITO_REGION}`);
  console.log(`  User Pool ID: ${process.env.COGNITO_USER_POOL_ID}`);
  console.log(`  Client ID: ${process.env.COGNITO_CLIENT_ID}`);
  console.log('');
}

// Validate configuration before starting server
validateCognitoConfig();

// Check for deprecated environment variables and warn
function checkDeprecatedEnvVars(): void {
  const deprecatedVars = [
    'ADMIN_USERNAME',
    'ADMIN_PASSWORD',
    'JWT_SECRET',
    'JWT_ALGORITHM',
    'JWT_ISSUER',
    'JWT_AUDIENCE',
    'JWT_ACCESS_TOKEN_EXPIRY',
    'JWT_REFRESH_TOKEN_EXPIRY'
  ];

  const foundDeprecated: string[] = [];
  
  for (const varName of deprecatedVars) {
    if (process.env[varName]) {
      foundDeprecated.push(varName);
    }
  }

  if (foundDeprecated.length > 0) {
    console.warn('');
    console.warn('========================================');
    console.warn('DEPRECATED ENVIRONMENT VARIABLES');
    console.warn('========================================');
    console.warn('');
    console.warn('The following environment variables are deprecated and will be ignored:');
    foundDeprecated.forEach(varName => console.warn(`  - ${varName}`));
    console.warn('');
    console.warn('These variables are no longer used. Authentication is now handled by Cognito.');
    console.warn('Please remove them from your .env file.');
    console.warn('');
    console.warn('========================================');
    console.warn('');
  }
}

checkDeprecatedEnvVars();

// Initialize error logger
const errorLogger = new ServerErrorLogger();

// Initialize session manager and audio manager
const sessionManager = new SessionManager();
const audioManager = new AudioManager();

// Initialize Auth Manager
const authConfig: AuthConfig = {
  enabled: process.env.ENABLE_AUTH === 'true',
  username: process.env.AUTH_USERNAME,
  password: process.env.AUTH_PASSWORD,
  sessionTimeout: 24 * 60 * 60 * 1000 // 24 hours
};
const authManager = new AuthManager(authConfig);

// Initialize Cognito Authentication Service
const cognitoAuth = new CognitoAuthService({
  region: process.env.COGNITO_REGION!,
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  clientId: process.env.COGNITO_CLIENT_ID!
});

// Initialize Token Store (in-memory)
const tokenStore = new TokenStore();

// Initialize Admin Identity Store and Manager
const adminIdentityStore = new AdminIdentityStore(
  path.join(__dirname, '..', 'admin-identities')
);
const adminIdentityManager = new AdminIdentityManager(
  adminIdentityStore,
  cognitoAuth,
  tokenStore
);

// Initialize Polly service (optional)
const pollyService = new PollyService({
  region: process.env.AWS_REGION || 'us-east-1',
  identityPoolId: process.env.AWS_IDENTITY_POOL_ID || '',
  userPoolId: process.env.AWS_USER_POOL_ID || '',
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
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      callback(null, true);
      return;
    }

    try {
      const url = new URL(origin);
      const hostname = url.hostname;
      
      // Allow localhost, 127.0.0.1, and all local network IPs
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
      const isLocalNetwork = 
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||     // 192.168.x.x
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||  // 10.x.x.x
        /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname); // 172.16-31.x.x
      
      if (isLocalhost || isLocalNetwork) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    } catch (e) {
      callback(new Error('Invalid origin format'));
    }
  },
  credentials: true
}));

// Initialize Socket.IO with CORS configuration
const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow Electron (file:// protocol has no origin)
      if (!origin) {
        callback(null, true);
        return;
      }

      // Parse the origin to extract hostname
      try {
        const url = new URL(origin);
        const hostname = url.hostname;
        
        // Allow localhost, 127.0.0.1, and all local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        const isLocalNetwork = 
          /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||     // 192.168.x.x
          /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||  // 10.x.x.x
          /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname); // 172.16-31.x.x
        
        if (isLocalhost || isLocalNetwork) {
          console.log(`CORS allowed origin: ${origin}`);
          callback(null, true);
        } else {
          console.warn('CORS blocked origin:', origin);
          callback(new Error('Not allowed by CORS'));
        }
      } catch (e) {
        console.warn('CORS - invalid origin format:', origin);
        callback(new Error('Invalid origin format'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Initialize message router with all dependencies
const messageRouter = new MessageRouter(
  io,
  sessionManager,
  authManager,
  adminIdentityManager,
  cognitoAuth,
  audioManager,
  errorLogger,
  pollyService
);

const PORT = parseInt(process.env.PORT || '3001', 10);

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
  const ttsCosts = messageRouter.getTTSCostStats();
  
  res.json({ 
    status: healthReport.status,
    timestamp: new Date().toISOString(),
    connections: io.engine.clientsCount,
    activeSessions: sessions.length,
    audioCache: cacheStats,
    ttsService: 'available',
    ttsCosts: {
      totalCost: ttsCosts.totalCost,
      characters: ttsCosts.characters,
      standardCharacters: ttsCosts.standardCharacters,
      neuralCharacters: ttsCosts.neuralCharacters,
      standardCost: ttsCosts.standardCost,
      neuralCost: ttsCosts.neuralCost,
      requestCount: ttsCosts.requestCount,
      sessionStartTime: ttsCosts.sessionStartTime,
      lastUpdated: ttsCosts.lastUpdated
    },
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
io.on('connection', async (socket) => {
  console.log(`=== CLIENT CONNECTED: ${socket.id} ===`);
  console.log(`Remote address: ${socket.handshake.address}`);
  console.log(`User agent: ${socket.handshake.headers['user-agent']}`);
  
  let securityContext: any = null;
  let adminIdentity: any = null;
  let isAdminConnection = false;
  
  try {
    // Authenticate connection
    securityContext = securityMiddleware.authenticateConnection(socket);
    
    // Check if this is an admin connection with token
    const authHeader = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        // Attempt to authenticate admin connection with token
        const authResult = await adminIdentityManager.authenticateWithToken(token, socket.id);
        adminIdentity = adminIdentityManager.getAdminIdentity(authResult.adminId);
        isAdminConnection = true;
        console.log(`Admin authenticated with token: ${adminIdentity?.cognitoUsername} (${authResult.adminId})`);
      } catch (tokenError) {
        console.log(`Token authentication failed: ${tokenError instanceof Error ? tokenError.message : 'Unknown error'}`);
        // Token authentication failed, but connection can continue for credential-based auth
      }
    }
    
    // Log connection
    errorLogger.logConnection('connect', socket.id, {
      userAgent: socket.handshake.headers['user-agent'],
      remoteAddress: socket.handshake.address,
      authenticated: securityContext.isAuthenticated,
      isAdmin: isAdminConnection,
      adminId: adminIdentity?.adminId
    });
    
    // Send welcome message
    socket.emit('connected', {
      message: 'Connected to Service Translate WebSocket Server',
      socketId: socket.id,
      timestamp: new Date().toISOString(),
      authenticated: securityContext.isAuthenticated,
      securityEnabled: securityConfig.auth.enabled,
      isAdmin: isAdminConnection,
      adminId: adminIdentity?.adminId,
      username: adminIdentity?.cognitoUsername
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

  // Admin authentication message handler
  socket.on('admin-auth', secureMessageHandler('admin-auth', (data) => {
    console.log(`[${socket.id}] ← admin-auth:`, JSON.stringify({ ...data, password: data.password ? '***' : undefined }, null, 2));
    messageRouter.routeMessage(socket, 'admin-auth', data);
  }));

  // Token refresh message handler
  socket.on('token-refresh', secureMessageHandler('token-refresh', (data) => {
    console.log(`[${socket.id}] ← token-refresh`);
    messageRouter.routeMessage(socket, 'token-refresh', data);
  }));

  // Admin session access message handler
  socket.on('admin-session-access', secureMessageHandler('admin-session-access', (data) => {
    console.log(`[${socket.id}] ← admin-session-access:`, JSON.stringify(data, null, 2));
    messageRouter.routeMessage(socket, 'admin-session-access', data);
  }));

  // Update session config message handler (admin operation)
  socket.on('update-session-config', secureMessageHandler('update-session-config', (data) => {
    console.log(`[${socket.id}] ← update-session-config:`, JSON.stringify(data, null, 2));
    messageRouter.routeMessage(socket, 'update-session-config', data);
  }));

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
  
  socket.on('broadcast-translation', secureMessageHandler('broadcast-translation', (data) => {
    console.log(`[${socket.id}] ← broadcast-translation:`, JSON.stringify(data, null, 2));
    // TTS generation is now handled in message-router.ts
    messageRouter.routeMessage(socket, 'broadcast-translation', data);
  }));

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`=== CLIENT DISCONNECTED: ${socket.id} ===`);
    console.log(`Reason: ${reason}`);
    
    // Get admin identity before cleanup
    const disconnectingAdmin = adminIdentityManager.getAdminBySocketId(socket.id);
    
    errorLogger.logConnection('disconnect', socket.id, { 
      reason,
      isAdmin: !!disconnectingAdmin,
      adminId: disconnectingAdmin?.adminId
    });
    
    // Handle security cleanup
    if (securityContext) {
      securityMiddleware.handleDisconnect(securityContext);
    }
    
    // Clean up admin connection
    if (disconnectingAdmin) {
      console.log(`Cleaning up admin connection: ${disconnectingAdmin.cognitoUsername} (${disconnectingAdmin.adminId})`);
      adminIdentityManager.removeAdminConnection(socket.id);
      
      // Check if admin has other active connections
      const hasOtherConnections = adminIdentityManager.hasActiveConnections(disconnectingAdmin.adminId);
      if (!hasOtherConnections) {
        console.log(`Admin ${disconnectingAdmin.cognitoUsername} has no more active connections`);
      }
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
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Service Translate WebSocket Server running on port ${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
  console.log(`Network access available at http://0.0.0.0:${PORT}/health`);
  
  // Broadcast server restart notification to all connected clients
  // This forces clients to re-authenticate since all tokens were cleared on restart
  setTimeout(() => {
    io.emit('server-restarted', {
      message: 'Server has restarted. Please re-authenticate.',
      timestamp: new Date().toISOString(),
      requiresReauth: true
    });
    console.log('Server restart notification sent to all connected clients');
  }, 1000); // Delay to ensure clients are connected
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
  
  // Cleanup admin identity manager
  adminIdentityManager.cleanup();
  
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
