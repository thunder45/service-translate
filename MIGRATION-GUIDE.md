# Migration Guide: TTS Server Architecture

This guide helps you migrate from the old architecture (capture app generates TTS) to the new architecture (TTS Server generates TTS).

## What Changed

### Old Architecture
```
Capture App → Transcribe → Translate → Polly → Local Files → WebSocket Server → Clients
```

### New Architecture
```
Capture App → Transcribe → Translate → TTS Server (→ Polly) → Clients
```

## Benefits

1. **Simpler Capture App**: No TTS complexity
2. **Centralized TTS**: One place for Polly logic
3. **Better Scalability**: Multiple capture apps can share TTS Server
4. **Flexible Deployment**: TTS Server can run on different machine
5. **Easier Debugging**: Clear separation of concerns

## Migration Steps

### Step 1: Update TTS Server

```bash
cd src/websocket-server

# Install new dependencies
npm install @aws-sdk/client-polly @aws-sdk/credential-providers

# Configure TTS
./setup-tts.sh

# Or manually
cp .env.example .env
nano .env  # Set ENABLE_TTS and AWS credentials
```

### Step 2: Update Capture App

```bash
cd src/capture

# Pull latest changes (already done if you're reading this)
# No additional steps needed - code already updated
```

### Step 3: Test the Flow

```bash
# Terminal 1: Start TTS Server
cd src/websocket-server
npm start

# Terminal 2: Start Capture App
cd src/capture
npm start

# Terminal 3: Start PWA (optional)
cd src/client-pwa
npm start
```

### Step 4: Verify

1. **Capture App**: Create session and start streaming
2. **TTS Server**: Check logs for "broadcast-translation" messages
3. **Clients**: Verify translations received with/without audio

## Configuration Changes

### TTS Server (.env)

**Before**: No TTS configuration needed

**After**:
```bash
ENABLE_TTS=true                    # Enable TTS generation
AWS_REGION=us-east-1
AWS_IDENTITY_POOL_ID=us-east-1:xxx
AWS_USER_POOL_ID=us-east-1_xxx
AWS_JWT_TOKEN=eyJxxx...            # Optional
```

### Capture App

**Before**:
```typescript
tts: {
  mode: 'neural',
  enabledLanguages: ['en-US', 'es-ES', 'fr-FR', 'de-DE', 'it-IT']
}
```

**After**: Same configuration, but now controls TTS Server behavior
```typescript
tts: {
  mode: 'neural',                  // Tells server which voice type to use
  websocketUrl: 'ws://localhost:3001',
  sessionId: 'CHURCH-2025-001'
}
```

## Breaking Changes

### Removed from Capture App
- `tts-manager.ts` - No longer generates TTS locally
- `generateTTSAudio()` method - Moved to TTS Server
- Local audio file management - Handled by TTS Server

### Added to TTS Server
- `polly-service.ts` - AWS Polly client
- `generateAudio()` method - TTS generation
- Audio cache management - Stores generated files

### Message Format Changes

**Before** (capture app sent per-language messages):
```typescript
{
  type: 'translation',
  text: 'Good morning',
  language: 'en',
  audioUrl: 'file:///local/path/audio.mp3'
}
```

**After** (capture app sends all translations at once):
```typescript
{
  sessionId: 'CHURCH-2025-001',
  original: 'Bom dia',
  translations: {
    en: 'Good morning',
    es: 'Buenos días',
    fr: 'Bonjour',
    de: 'Guten Morgen',
    it: 'Buongiorno'
  },
  generateTTS: true,
  voiceType: 'neural'
}
```

## Rollback Plan

If you need to rollback to the old architecture:

### Option 1: Git Revert
```bash
git log --oneline  # Find commit before TTS Server changes
git revert <commit-hash>
```

### Option 2: Keep Both Versions
```bash
# Create a branch for old architecture
git checkout -b legacy-tts-architecture <old-commit>

# Switch between versions
git checkout main           # New architecture
git checkout legacy-tts-architecture  # Old architecture
```

### Option 3: Disable TTS Server
```bash
# In TTS Server .env
ENABLE_TTS=false

# Capture app will still work, clients get text-only
# Clients can use local Web Speech API TTS
```

## Troubleshooting

### TTS Not Working

**Check TTS Server**:
```bash
cd src/websocket-server
cat .env | grep ENABLE_TTS  # Should be 'true'
npm start  # Check for errors
```

**Check Capture App**:
```typescript
// Verify config
tts: {
  mode: 'neural',  // Not 'disabled' or 'local'
  websocketUrl: 'ws://localhost:3001'
}
```

**Check Logs**:
```bash
# TTS Server logs
[socket-id] ← broadcast-translation: { ... }
Generating TTS audio for: ...
Broadcasted translations to N clients

# Capture App logs
Connecting to WebSocket server...
Connected to server: socket-id
Sending translations to TTS Server
```

### Audio URLs Not Working

**Check Audio Cache**:
```bash
cd src/websocket-server
ls -la audio-cache/  # Should contain .mp3 files
```

**Test Audio URL**:
```bash
curl http://localhost:3001/audio/abc123.mp3
# Should return audio file
```

### Clients Not Receiving Translations

**Check Session**:
```bash
# Verify session exists
# Check client joined session
# Confirm language preference set
```

**Check Network**:
```bash
# Verify clients can reach server
curl http://localhost:3001/health
```

## FAQ

### Q: Do I need to change my AWS credentials?
**A**: No, same credentials work. Just move them from capture app to TTS Server.

### Q: Can I disable TTS completely?
**A**: Yes, set `ENABLE_TTS=false` in TTS Server. Clients get text-only.

### Q: Can clients still use local TTS?
**A**: Yes, clients can always choose local Web Speech API regardless of server TTS.

### Q: What happens if Polly fails?
**A**: Server logs error, sends translation with `audioUrl: null`, clients fall back to local TTS.

### Q: Can I run TTS Server on a different machine?
**A**: Yes, just update `websocketUrl` in capture app config.

### Q: Do I need to update PWA clients?
**A**: No, PWA clients work with both old and new architecture.

### Q: What about cost tracking?
**A**: Capture app still tracks Transcribe/Translate costs. TTS Server can add Polly tracking (future enhancement).

## Next Steps

1. ✅ Update TTS Server configuration
2. ✅ Test with TTS enabled
3. ✅ Test with TTS disabled
4. ✅ Verify client audio playback
5. ⏭️ Remove old TTS code from capture app (optional cleanup)
6. ⏭️ Add TTS cost tracking to server (future enhancement)
7. ⏭️ Add server-side analytics (future enhancement)

## Support

If you encounter issues:
1. Check this migration guide
2. Review server and capture app logs
3. Test with minimal configuration
4. Verify AWS credentials
5. Check network connectivity
