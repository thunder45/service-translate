# Holyrics Integration Setup Guide

## Overview

Your Service Translate app now integrates directly with Holyrics to display real-time translations on the church's big screen. This integration uses Holyrics' built-in REST API.

## Setup Steps

### 1. Enable Holyrics API Server

1. **Open Holyrics** on the computer connected to your projector
2. **Go to Menu → Configurações → API Server** (File → Settings → API Server)
3. **Enable the API Server** by checking the box
4. **Note the IP address and port** (default is port 8091)
5. **Click "Gerenciar Permissões"** (Manage Permissions) to create an access token
6. **Copy the generated token** - you'll need this for configuration

### 2. Configure Service Translate

1. **Open Service Translate** and click "⚙️ Configuration"
2. **Click the "📺 Holyrics" tab**
3. **Fill in the settings:**
   - ✅ **Enable Holyrics Integration** (check the box)
   - **Holyrics Host**: IP address of the Holyrics computer (e.g., `192.168.178.53`)
   - **Holyrics Port**: Usually `8091` (default)
   - **API Token**: Paste the token from Holyrics
   - **Display Language**: Choose which language to show on the big screen (fr, en, es, de, it)
   - **Max Lines on Screen**: How many sentences to display (recommended: 3)

4. **Test the connection** by clicking "🧪 Test Connection" - should display "Teste de conexão com Holyrics"
5. **Clear the test message** by clicking "🧹 Clear Screen"
6. **Save Configuration**

### 3. How It Works

When you start streaming:

1. **Audio** is captured from your microphone in configured source language
2. **Real-time transcription** converts speech to text (AWS Transcribe)
3. **Translation** happens to configured target languages (AWS Translate)
4. **Selected language** is automatically sent to Holyrics via SetTextCP API
5. **Big screen displays** the translation in real-time with rolling text (last 3 sentences)
6. **Individual devices** can still view other languages via the app

**Language Matching**: The app supports flexible language codes:
- Configure `fr` → matches `fr-FR` translations
- Configure `en` → matches `en-US` translations
- Configure `es` → matches `es-ES` translations

## Usage

### Starting Translation with Holyrics

1. **Login** to Service Translate
2. **Select your audio device** in Configuration → Audio
3. **Click "🎤 Start Local Streaming"**
4. **Speak in source language** - translations appear on:
   - ✅ **Big screen** (via Holyrics - selected language only)
   - ✅ **Individual devices** (via the app - all configured target languages)

### Manual Controls

- **🧹 Clear Screen**: Clears the Holyrics display (sends empty text with show: false)
- **🧪 Test Connection**: Sends "Teste de conexão com Holyrics" to verify connectivity

## Network Setup

### Same Network (Recommended)
- Holyrics computer and Service Translate on same WiFi/LAN
- Use local IP address (e.g., `192.168.1.100`)

### Different Networks
- Use Holyrics' internet API endpoint
- Requires additional API key configuration
- Contact Holyrics support for internet API setup

## Troubleshooting

### Connection Issues
- ✅ **Check IP address**: Verify Holyrics computer's IP
- ✅ **Check port**: Default is 8091, verify in Holyrics settings
- ✅ **Check token**: Regenerate token in Holyrics if needed
- ✅ **Check firewall**: Ensure port 8091 is open
- ✅ **Test manually**: Try `http://IP:8091/api/SetTextCP?token=TOKEN` in browser

### Display Issues
- ✅ **Check language**: Verify correct display language selected
- ✅ **Check max lines**: Adjust if text is too long
- ✅ **Clear screen**: Use "🧹 Clear Screen" button to reset

### Audio Issues
- ✅ **Check microphone**: Verify audio device selection
- ✅ **Check VU meter**: Ensure audio levels are showing
- ✅ **Check transcription**: Verify source language transcription is working

## Example Configuration

```
Holyrics Settings:
✅ Enable Holyrics Integration: ON
📍 Holyrics Host: 192.168.1.100
🔌 Holyrics Port: 8091
🔑 API Token: abc123def456
🌍 Display Language: pt (Source Language)
📄 Max Lines on Screen: 3
```

## Benefits

- **No plugin required**: Uses Holyrics' native API
- **Real-time display**: Instant translation on big screen
- **Multi-language support**: Different languages for screen vs devices
- **Automatic management**: Handles text accumulation and clearing
- **Simple setup**: Just configure once and use

## Support

If you encounter issues:

1. **Test connection** using the built-in test button
2. **Check Holyrics logs** for API errors
3. **Verify network connectivity** between computers
4. **Regenerate API token** in Holyrics if needed

Your church now has professional real-time translation displayed directly on the big screen! 🎉
