# PWA Server Port Configuration Proposal

## Current State Analysis

### Hardcoded Port Usage
Currently, port **8080** is hardcoded in the following locations:

1. **Client PWA Scripts** (`src/client-pwa/package.json`):
   ```json
   {
     "scripts": {
       "start": "npx --yes http-server -p 8080",
       "serve": "npx --yes http-server -p 8080", 
       "start-python": "python3 -m http.server 8080"
     }
   }
   ```

2. **Firewall Configuration**:
   - `src/capture/setup-macos.sh` - macOS Packet Filter rules for port 8080
   - `src/capture/setup-windows.ps1` - Windows Firewall rules for port 8080

3. **PWA Server Script** (`scripts/start-pwa-server.ts`):
   - Uses config from `config.server.http.port` but defaults to 8080

4. **Test Scripts** (`scripts/test-holyrics-api.js`):
   - Includes 8080 as one of common ports to test

### Impact Assessment
- **Low Risk**: Only 4 locations need updating
- **No Breaking Changes**: Most hardcoded references are in node_modules (AWS CDK) 
- **Configuration Already Exists**: PWA server script already supports configurable ports

## Proposed Solution

### 1. Environment-Based Configuration

Add PWA port configuration to main environment config:

**File: `config/environment.ts`**
```typescript
export interface EnvironmentConfig {
  // ... existing config
  server: {
    websocket: { port: number };
    http: { 
      port: number;     // ← Already exists, used by PWA server script
      host: string;
    };
  };
}

// Default configuration
const DEFAULT_CONFIG = {
  server: {
    websocket: { port: 3001 },
    http: { 
      port: 8080,      // ← Default PWA port
      host: '127.0.0.1' 
    }
  }
};
```

### 2. Update Client PWA Scripts

**File: `src/client-pwa/package.json`**
```json
{
  "scripts": {
    "start": "node ../scripts/start-client-pwa.js",
    "serve": "node ../scripts/start-client-pwa.js",
    "start-direct": "npx --yes http-server -p ${PWA_PORT:-8080}",
    "start-python": "python3 -m http.server ${PWA_PORT:-8080}"
  }
}
```

**New File: `scripts/start-client-pwa.js`**
```javascript
const { loadEnvironmentConfig } = require('../config/environment');
const { spawn } = require('child_process');

const config = loadEnvironmentConfig();
const port = config.server.http.port;

console.log(`Starting PWA client server on port ${port}...`);

const child = spawn('npx', ['--yes', 'http-server', '-p', port.toString()], {
  stdio: 'inherit',
  shell: true
});

child.on('error', (error) => {
  console.error('Failed to start PWA server:', error);
  process.exit(1);
});
```

### 3. Update Setup Scripts

**Dynamic Firewall Rules**:
```bash
# macOS setup-macos.sh
PWA_PORT=${PWA_PORT:-8080}
echo "Configuring firewall for PWA port ${PWA_PORT}..."

# Windows setup-windows.ps1  
$PWA_PORT = if ($env:PWA_PORT) { $env:PWA_PORT } else { 8080 }
Write-Host "Configuring firewall for PWA port ${PWA_PORT}..."
```

### 4. Configuration Methods

**Option A: Environment Variable**
```bash
export PWA_PORT=9090
npm start  # Uses port 9090
```

**Option B: Config File**
```json
// config/local.json
{
  "server": {
    "http": { "port": 9090 }
  }
}
```

**Option C: Command Line**
```bash
npm start -- --port 9090
```

## Implementation Benefits

### 1. **Flexibility**
- Support multiple PWA instances on different ports
- Avoid port conflicts in development environments
- Support different deployment configurations

### 2. **Consistency** 
- Aligns with existing configurable WebSocket port (3001)
- Uses same configuration system as other services
- Maintains environment-specific settings

### 3. **Deployment Support**
- Docker containers can override ports via environment
- Kubernetes deployments can set custom ports
- Development vs production port separation

## Migration Path

### Phase 1: Add Configuration Support
1. Update environment config to include PWA port
2. Create wrapper script for dynamic port selection
3. Update package.json to use wrapper script

### Phase 2: Update Setup Scripts  
1. Make firewall rules use configurable port
2. Add PWA_PORT environment variable support
3. Update documentation with configuration options

### Phase 3: Enhanced Features
1. Port conflict detection and auto-increment
2. Multiple PWA instance support
3. Network interface binding configuration

## Recommended Implementation

**Priority: Medium** - Current hardcoding works fine but configuration adds flexibility

**Effort: Low** - Only 4 files need updates, existing infrastructure supports it

**Timeline: 1-2 hours** - Straightforward changes using existing patterns

The proposal maintains backward compatibility (8080 default) while enabling flexible port configuration for advanced users and deployment scenarios.
