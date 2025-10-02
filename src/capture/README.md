# Service Translate - macOS Audio Capture Application

**Production-ready Electron app with real audio capture and AWS integration.**

## Features ✅

- **Real macOS audio capture** via `sox` command-line tool
- **Cognito authentication** with secure token storage
- **WebSocket communication** with automatic reconnection
- **Audio level monitoring** and statistics
- **Configuration management** with encrypted storage
- **Simple username/password login** - no JWT tokens to manage manually!

## Quick Setup

```bash
cd src/capture
./setup.sh      # Installs dependencies and sox
npm run dev     # Launches the app
```

## First Time Configuration

### 1. Get Backend Information
After deploying the backend, you'll have:
- **WebSocket Endpoint**: `https://abc123.execute-api.us-east-1.amazonaws.com/prod`
- **User Pool ID**: `us-east-1_ABC123DEF`
- **Client ID**: `1a2b3c4d5e6f7g8h9i0j`
- **Region**: `us-east-1`

### 2. Create Admin User (One-time)
```bash
cd ../backend
./create-admin.sh admin@church.com <UserPoolId>
```

### 3. Configure the App
1. **Launch app**: `npm run dev`
2. **Click "⚙️ Configuration"** button
3. **Enter the values** from step 1
4. **Save configuration**

### 4. Login and Use
1. **Login** with your username and password
2. **First login**: You'll be prompted to change the temporary password
3. **Start Session**: Enter an optional session name (e.g., "Sunday Service")
4. **Share QR code** with congregation members

## For Church Administrators

### Simple Login Process
- **Username**: Your email address (e.g., `admin@church.com`)
- **Password**: Your password (set during first login)
- **That's it!** The app handles all the technical authentication automatically

### Session Management
- **Start Session**: Creates a new translation session
- **Session Name**: Optional human-readable name (e.g., "Sunday Service", "Bible Study")
- **QR Code**: Automatically generated for easy congregation access
- **Audio Capture**: Real-time microphone input with level monitoring

### Audio Settings
- **Sample Rate**: 16kHz (recommended for speech)
- **Encoding**: PCM (best quality)
- **Channels**: 1 (mono, sufficient for speech)
- **Chunk Size**: ~8KB (optimized for real-time processing)

## Technical Details

### Audio Capture Implementation
- Uses **sox** (Sound eXchange) command-line tool for professional audio capture
- Real-time audio level calculation (RMS)
- Configurable audio parameters (sample rate, encoding, channels)
- Automatic chunking for WebSocket transmission

### Authentication Flow
1. **Cognito authentication** with username/password
2. **Secure token storage** using Electron's safeStorage API
3. **Automatic token refresh** (6-hour expiration)
4. **Encrypted configuration** storage

### WebSocket Communication
- **Automatic connection** to backend WebSocket API
- **Real-time audio streaming** with sequence numbers
- **Connection monitoring** and automatic reconnection
- **Error handling** with user-friendly messages

### File Structure
```
src/capture/
├── src/
│   ├── main.ts              # Electron main process
│   ├── audio-capture.ts     # Real audio capture via sox
│   ├── websocket-client.ts  # WebSocket communication
│   ├── auth.ts             # Cognito authentication
│   └── config.ts           # Configuration management
├── index.html              # Electron UI
├── dist/                   # Compiled JavaScript
└── package.json
```

## Requirements

- **macOS** (tested on macOS 10.15+)
- **Node.js 20+**
- **sox** (installed automatically by setup.sh)
- **Microphone access** (granted on first use)

## Troubleshooting

### Audio Issues
- **No audio capture**: Check microphone permissions in System Preferences
- **Poor audio quality**: Adjust sample rate in configuration
- **Audio level too low**: Check microphone input level in System Preferences

### Connection Issues
- **Cannot connect**: Verify WebSocket endpoint URL
- **Authentication failed**: Check username/password and User Pool configuration
- **Session not found**: Ensure session was created successfully

### Configuration Issues
- **Settings not saved**: Check file permissions in user data directory
- **Invalid configuration**: Use "Reset Configuration" to start over

## Development

### Build from Source
```bash
npm install
npm run build    # Compile TypeScript
npm run dev      # Run in development mode
```

### Package for Distribution
```bash
npm run package  # Creates distributable app
```

## Production Deployment

This app is **production-ready** and includes:
- ✅ Real audio capture (not simulated)
- ✅ Secure authentication and token management
- ✅ Error handling and user feedback
- ✅ Configuration validation
- ✅ Automatic reconnection logic
- ✅ Audio level monitoring
- ✅ Professional UI/UX

Perfect for **church services, conferences, and live events** requiring real-time translation.
