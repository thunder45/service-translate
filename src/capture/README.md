# Capture App

Cross-platform Electron application for real-time audio capture, transcription, and translation.

## Features

- **Audio Capture**: Real-time microphone input with device selection
- **AWS Transcribe**: Streaming speech-to-text (configurable source language)
- **AWS Translate**: Multi-language translation (configurable target languages)
- **Holyrics Integration**: Optional display on church screens
- **WebSocket Client**: Sends translations to TTS Server
- **Session Management**: Independent session lifecycle control
- **Cost Tracking**: Real-time monitoring of AWS service costs
- **Cross-Platform**: Windows 10/11 and macOS 10.15+

## Architecture

### Separation of Concerns

**Streaming** and **Session Management** are completely independent:

```
Streaming Layer (Audio Processing):
Microphone → Audio Capture → Transcribe → Translate → Local Display
                                                      ↓
                                                  [Holyrics]

Session Layer (Broadcasting):
WebSocket Manager → TTS Server → Connected Clients
```

**Valid State Combinations:**
- ❌ No Streaming + ❌ No Session: Initial state
- ❌ No Streaming + ✅ Session Active: Session ready, waiting to stream
- ✅ Streaming + ❌ No Session: Local-only transcription/translation
- ✅ Streaming + ✅ Session Active: Full operation with client broadcasting

See [SESSION_STREAMING_SEPARATION.md](../../SESSION_STREAMING_SEPARATION.md) for details.

## Quick Start

### macOS
```bash
./setup.sh
npm start
```

### Windows
```powershell
.\setup-windows.ps1
npm start
```

## Configuration

### Admin Authentication

The Capture app now uses **persistent admin authentication** to manage sessions across reconnections.

#### First-Time Setup
1. Start the Capture app
2. Connect to the WebSocket server (it will auto-start if not running)
3. Enter admin credentials:
   - **Username**: Your admin username (e.g., "admin")
   - **Password**: Your admin password
4. Click "Login"

#### Authentication Features
- **Persistent Sessions**: Your admin identity persists across reconnections
- **Token Management**: Automatic token refresh before expiry
- **Session Recovery**: Reconnect and regain control of your sessions
- **Secure Storage**: Tokens encrypted using Electron safeStorage
- **Expiry Warnings**: 5-minute warning before session expires

#### Admin Identity Display
After successful authentication:
- Admin username displayed in header
- Admin ID shown (first 8 characters)
- Logout button available in top-right corner

#### Session Ownership
- **My Sessions**: View and manage sessions you created
- **All Sessions**: View all active sessions (read-only for others' sessions)
- **Ownership Indicators**: 
  - 👤 OWNER badge for your sessions
  - 👁️ READ-ONLY badge for other admins' sessions

### AWS Credentials (Legacy)
For backward compatibility with Cognito authentication:
1. Click "Settings"
2. Configure tabs:
   - **Languages**: Select source language and target languages
   - **Audio**: Configure input device and audio settings
   - **TTS**: Set TTS mode and WebSocket server URL
   - **Holyrics**: Optional church display integration
   - **Advanced**: AWS credentials (Region, User Pool ID, Identity Pool ID)
3. Click "Save"
4. Login with Username/Password

### TTS Server
```typescript
{
  tts: {
    mode: 'neural',              // 'neural' | 'standard' | 'local' | 'disabled'
    host: 'localhost',           // TTS server host
    port: 3001                   // TTS server port
  }
}
```

### Language Configuration
```typescript
{
  sourceLanguage: 'pt',          // Source language code
  targetLanguages: ['en', 'es', 'fr', 'de', 'it']  // Target language codes
}
```

### Holyrics (Optional)
```typescript
{
  holyrics: {
    enabled: true,
    host: 'localhost',
    port: 8080,
    language: 'en'
  }
}
```

## Usage

### 1. Start Capture App
```bash
npm start
```

### 2. Admin Authentication
- Enter admin username and password
- Click "Login"
- Your admin identity will be displayed in the header
- Tokens are stored securely for automatic reconnection

### 3. Start TTS Server (Auto-starts)
The WebSocket server will automatically start when you connect.
Manual start:
```bash
cd ../websocket-server
npm start
```

### 4. Session Management
**Create a New Session:**
- Enter session ID (e.g., "CHURCH-2025-001")
- Click "Create Session"
- Session will be owned by your admin identity

**View Sessions:**
- Click "My Sessions" to see sessions you created
- Click "All Sessions" to see all active sessions
- Owner sessions show 👤 OWNER badge
- Other sessions show 👁️ READ-ONLY badge

**Manage Sessions:**
- Reconnect to your sessions after disconnection
- End sessions you own
- View (read-only) sessions created by other admins

### 5. Start Streaming
- Select microphone
- Click "Start"
- Speak in configured source language
- Translations sent to TTS Server and connected clients

### 6. Token Management
- Tokens automatically refresh 2 minutes before expiry
- Warning shown 5 minutes before expiry
- Click "Refresh" to manually extend session
- Logout to clear tokens and disconnect

## Features

### Audio Capture
- Device selection
- VU meter
- Automatic gain control
- Cross-platform support (sox on macOS, native on Windows)

### Transcription
- Real-time streaming
- Configurable source language
- Partial and final results
- Automatic timeout handling

### Translation
- 5 target languages (EN, ES, FR, DE, IT)
- Batch translation
- Cost tracking
- Error handling

### Cost Tracking
- Real-time cost calculation
- Per-service breakdown
- Configurable limits
- Warning notifications

### Holyrics Integration
- Automatic text display
- Language selection
- Error recovery
- Optional feature

## Development

### Run in Development Mode
```bash
npm run dev
```

### Build for Production
```bash
# macOS
npm run build:mac

# Windows
npm run build:win
```

### Run Tests
```bash
npm test
```

## Troubleshooting

### Admin Authentication Issues

**Cannot Login:**
1. Verify WebSocket server is running
2. Check admin credentials are correct
3. Ensure server is accessible (default: localhost:3001)
4. Check server logs for authentication errors

**Session Expired:**
1. Click "Refresh" when warning appears
2. If refresh fails, logout and login again
3. Check token expiry settings on server
4. Verify system clock is accurate

**Lost Session Control:**
1. Logout and login again to re-authenticate
2. Check "My Sessions" tab to see your sessions
3. Verify admin identity matches session owner
4. Contact administrator if session ownership is incorrect

**Token Refresh Failed:**
1. Logout and login with credentials
2. Check network connectivity
3. Verify refresh token hasn't expired
4. Check server logs for token validation errors

### Audio Not Capturing
**macOS:**
1. Install sox: `brew install sox`
2. Grant microphone permissions
3. Check device selection

**Windows:**
1. Grant microphone permissions
2. Check device selection
3. Verify audio drivers

### Transcription Not Working
1. Verify AWS credentials
2. Check internet connection
3. Confirm Transcribe service access
4. Review IAM permissions

### Translation Not Working
1. Verify AWS credentials
2. Check Translate service access
3. Review IAM permissions
4. Check cost limits

### TTS Server Connection Failed
1. Verify server is running
2. Check WebSocket URL
3. Confirm network connectivity
4. Review firewall settings

### Holyrics Not Displaying
1. Verify Holyrics is running
2. Check host and port
3. Confirm API is enabled
4. Test connection manually

### Session Management Issues

**Cannot Create Session:**
1. Verify you are authenticated as admin
2. Check session ID is unique
3. Ensure WebSocket connection is active
4. Review server logs for errors

**Cannot End Session:**
1. Verify you own the session (👤 OWNER badge)
2. Check WebSocket connection is active
3. Try refreshing session list
4. Contact administrator if session is stuck

**Sessions Not Appearing:**
1. Click "Refresh" button
2. Check WebSocket connection status
3. Switch between "My Sessions" and "All Sessions" tabs
4. Verify admin authentication is active

## Cost Management

### Typical Service Costs (2-hour service, 60 min speaking)
- **Transcribe**: $1.44 (60 min × $0.024/min)
- **Translate**: $3.38 (45K chars × 5 langs × $15/1M)
- **Total**: ~$4.82 (without TTS)

### Cost Controls
1. Set cost limits in app
2. Monitor real-time usage
3. Disable unused languages
4. Use local TTS mode

## Security

### Admin Token Storage
- **Encryption**: Tokens encrypted using Electron safeStorage
- **Storage Location**: OS-specific secure storage (Keychain on macOS, Credential Manager on Windows)
- **Auto-Expiration**: Tokens expire after configured time (default: 1 hour)
- **Refresh Tokens**: Longer-lived tokens for automatic renewal (default: 30 days)
- **Secure Transmission**: Tokens never logged or transmitted in plain text

### Admin Authentication Security
- **JWT Tokens**: Industry-standard JSON Web Tokens for authentication
- **Token Rotation**: Automatic token refresh before expiry
- **Session Isolation**: Each admin has isolated session ownership
- **Audit Trail**: All admin actions logged on server
- **Rate Limiting**: Protection against brute-force attacks

### Credential Storage (Legacy AWS)
- Encrypted using Electron safeStorage
- Stored in OS keychain
- Auto-expiration after 24 hours
- Never logged or transmitted

### Best Practices
1. **Admin Credentials**:
   - Use strong, unique passwords
   - Never share admin credentials
   - Logout when not in use
   - Monitor session activity
   
2. **AWS Credentials** (if using):
   - Use dedicated AWS user
   - Rotate credentials regularly
   - Set IAM permissions to minimum
   - Monitor AWS CloudTrail logs

3. **Network Security**:
   - Use secure WebSocket connections (WSS) in production
   - Restrict server access to trusted networks
   - Enable firewall rules
   - Monitor connection logs

## Performance

### System Requirements
- **CPU**: 2+ cores recommended
- **RAM**: 4GB minimum, 8GB recommended
- **Network**: Stable internet for AWS services
- **Audio**: USB microphone recommended

### Optimization
- Close unnecessary applications
- Use wired network connection
- Position microphone properly
- Monitor CPU/memory usage

## Known Issues

### macOS
- Requires sox installation
- Microphone permissions prompt
- First launch may be slow

### Windows
- Audio device enumeration delay
- Firewall prompts on first run
- Antivirus may flag unsigned build

## Support

For issues:
1. Check application logs
2. Verify AWS credentials
3. Test network connectivity
4. Review error messages
5. Check AWS service status
