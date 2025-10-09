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

### AWS Credentials
Configure in the app UI:
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

### 2. Configure AWS Credentials
- Enter credentials in Settings
- Test connection

### 3. Start TTS Server
```bash
cd ../websocket-server
npm start
```

### 4. Create Session
- Enter session ID (e.g., "CHURCH-2025-001")
- Click "Create Session"

### 5. Start Streaming
- Select microphone
- Click "Start"
- Speak in configured source language
- Translations sent to TTS Server

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

### Credential Storage
- Encrypted using Electron safeStorage
- Stored in OS keychain
- Auto-expiration after 24 hours
- Never logged or transmitted

### Best Practices
1. Use dedicated AWS user
2. Rotate credentials regularly
3. Set IAM permissions to minimum
4. Monitor AWS CloudTrail logs

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
