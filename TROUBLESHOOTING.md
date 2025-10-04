# Service Translate - Troubleshooting Guide

## Stream Reconnection Issues

### Problem: Transcription stops after timeout
**Symptoms**: Log shows "Transcription stream timed out" and transcription doesn't resume

**Fixed in latest version**:
- Full stop/start cycle on timeout (mimics manual restart)
- 2-second delay between stop and start for clean resource cleanup
- Completely recreates transcription client and audio capture

**What to check**:
1. Look for `Transcription stream timed out - doing full restart...`
2. Look for `Streaming restarted successfully` - confirms reconnection worked
3. Check VU meter - should resume showing audio levels after restart
4. Speak into microphone - transcription should resume within 2-3 seconds

### Problem: Wrong language sent to Holyrics
**Symptoms**: Portuguese text appears instead of configured language (FR, EN, etc.)

**Fixed in latest version**:
- Language matching now supports both short codes (fr) and full codes (fr-FR)
- Logs show: `[Holyrics] Selected translation: fr-FR: ...` instead of `FALLBACK TO PT`

**What to check**:
1. Look for `[Holyrics] Configured language:` in logs
2. Look for `[Holyrics] Available translations:` - should show all 5 languages
3. Look for `[Holyrics] Selected translation:` - should NOT say "FALLBACK TO PT"

### Problem: Test/Clear buttons not working
**Symptoms**: Error "Streaming manager not initialized"

**Fixed in latest version**:
- Test and Clear buttons work without active streaming
- Use direct API calls when streaming is not active

**What to check**:
1. Click Test Connection - should show message on Holyrics screen
2. Click Clear Screen - should clear Holyrics display
3. Check logs for `[Main] Test Holyrics connection requested`

### Problem: Nothing reaching Holyrics
**Symptoms**: No text appears on Holyrics screen, no Holyrics logs

**Check these in order**:

1. **Is Holyrics running?**
   ```bash
   node test-holyrics-api.js <HOLYRICS_IP> <TOKEN>
   ```
   Should show: `✅ Successfully sent text to Holyrics!`

2. **Is Holyrics integration enabled?**
   - Open app Configuration → Holyrics tab
   - Verify "Enable Holyrics Integration" is checked
   - Click "Test Connection" button - should display test message

3. **Check network connectivity**
   ```bash
   ping <HOLYRICS_IP>
   ```

4. **Check Holyrics API Server**
   - Open Holyrics → Menu → Settings → API Server
   - Verify API Server is enabled
   - Note the port (usually 8091)
   - Verify token matches

5. **Check firewall**
   - Windows: Allow port 8091 in Windows Firewall
   - macOS: System Preferences → Security → Firewall → Allow incoming connections

## Holyrics Error Messages

### `❌ Connection refused`
**Cause**: Holyrics not running or API Server disabled

**Solution**:
1. Start Holyrics
2. Enable API Server in Holyrics settings
3. Restart Service Translate app

### `❌ Timeout`
**Cause**: Network issue or wrong IP address

**Solution**:
1. Verify IP address: `ipconfig` (Windows) or `ifconfig` (macOS) on Holyrics computer
2. Check both computers are on same network
3. Try pinging Holyrics computer

### `❌ HTTP 401` or `HTTP 403`
**Cause**: Invalid or missing token

**Solution**:
1. Regenerate token in Holyrics → Settings → API Server → Manage Permissions
2. Copy new token to Service Translate → Configuration → Holyrics tab
3. Save configuration

### `❌ HTTP 404`
**Cause**: Wrong API endpoint or Holyrics version too old

**Solution**:
1. Update Holyrics to latest version (API endpoint is SetTextCP)
2. Verify endpoint with test script:
   ```bash
   node test-holyrics-api.js <IP> <TOKEN>
   ```

## Audio Issues

### No audio levels showing (VU meter flat)
**Causes**:
1. Wrong audio device selected
2. Microphone muted
3. No microphone permission

**Solutions**:
1. Configuration → Audio tab → Select correct device
2. Check system sound settings
3. macOS: System Preferences → Security → Microphone → Allow app
4. Windows: Settings → Privacy → Microphone → Allow desktop apps

### Audio levels showing but no transcription
**Causes**:
1. Audio too quiet
2. Wrong language (not Portuguese)
3. AWS credentials expired

**Solutions**:
1. Speak louder or adjust microphone gain
2. Verify speaking Portuguese
3. Logout and login again (refreshes credentials)

## AWS Issues

### Authentication failed
**Cause**: Invalid credentials or expired token

**Solution**:
1. Verify AWS configuration in Connection tab
2. Check User Pool ID, Client ID, Identity Pool ID
3. Logout and login again
4. If still failing, recreate admin user:
   ```bash
   cd src/backend
   ./create-admin.sh <email> <UserPoolId>
   ```

### Transcription not working
**Causes**:
1. AWS Transcribe service issue
2. Invalid credentials
3. Wrong region

**Solutions**:
1. Check AWS service status: https://status.aws.amazon.com/
2. Verify region matches deployment (usually us-east-1)
3. Check IAM permissions for Identity Pool role

### Translation not working
**Cause**: AWS Translate permissions or quota

**Solution**:
1. Check AWS Translate service status
2. Verify IAM role has `translate:TranslateText` permission
3. Check AWS quota limits

## Performance Issues

### High CPU usage
**Causes**:
1. Too many translations
2. Audio processing overhead

**Solutions**:
1. Reduce number of target languages
2. Close other applications
3. Use wired microphone instead of Bluetooth

### High latency
**Causes**:
1. Network latency to AWS
2. Bluetooth audio device
3. Holyrics on slow network

**Solutions**:
1. Use AWS region closest to you
2. Use wired microphone
3. Ensure Holyrics computer on same LAN

## Debug Mode

### Enable detailed logging

**macOS/Linux**:
```bash
cd src/capture
DEBUG=* npm run dev
```

**Windows**:
```powershell
cd src/capture
$env:DEBUG="*"
npm run dev
```

### Check Electron DevTools

Uncomment in `src/capture/src/main.ts`:
```typescript
mainWindow.webContents.openDevTools();
```

Then rebuild:
```bash
npm run build
npm run dev
```

## Common Log Messages

### Normal operation:
```
✅ [Holyrics] Success (200): <text>
✅ Transcription stream restarted - audio capture continues
✅ Local streaming started successfully
```

### Warnings (normal):
```
⚠️  Transcription stream timed out - this is normal when no audio is detected
⚠️  Restarting transcription stream...
```

### Errors (need attention):
```
❌ [Holyrics] Connection refused
❌ Failed to restart transcription
❌ Audio capture error
❌ Authentication failed
```

## Getting Help

1. **Check logs** - Look for error messages with ❌
2. **Test components individually**:
   - Audio: Check VU meter
   - Transcription: Speak Portuguese and watch for text
   - Translation: Check language tabs
   - Holyrics: Use test script
3. **Verify configuration**:
   - AWS credentials
   - Holyrics IP/port/token
   - Audio device selection
4. **Restart everything**:
   - Stop Service Translate
   - Restart Holyrics
   - Start Service Translate

## Quick Diagnostic Checklist

- [ ] Holyrics is running
- [ ] Holyrics API Server is enabled
- [ ] Service Translate shows "Streaming Active"
- [ ] VU meter shows audio levels
- [ ] Portuguese text appears in app
- [ ] Translations appear in language tabs
- [ ] Holyrics logs show `✅ Success`
- [ ] Text appears on Holyrics screen

If all checked and still not working, check the specific error messages in the logs.
