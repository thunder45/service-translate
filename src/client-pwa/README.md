# Service Translate Client PWA

A Progressive Web Application for receiving real-time translations with text-to-speech support.

## Features

- **Progressive Web App**: Installable on mobile devices, works offline
- **Real-time Translations**: Receive live translations via WebSocket
- **Text-to-Speech**: Cloud (AWS Polly) and local (Web Speech API) TTS support
- **Customizable Display**: Font size, family, colors, and fullscreen mode
- **Audio Controls**: Volume control, mute/unmute functionality
- **Session Management**: Join sessions with human-readable IDs
- **Responsive Design**: Mobile-first design that works on all devices

## Getting Started

### Development Server

1. Navigate to the client-pwa directory:
   ```bash
   cd src/client-pwa
   ```

2. Start a local HTTP server:
   ```bash
   # Using Python 3
   python3 -m http.server 8080
   
   # Or using Node.js (if you have http-server installed)
   npx http-server -p 8080
   
   # Or using PHP
   php -S localhost:8080
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:8080
   ```

### Installation as PWA

1. Open the app in a supported browser (Chrome, Firefox, Safari, Edge)
2. Look for the "Install" or "Add to Home Screen" option
3. Follow the browser prompts to install the PWA

## Project Structure

```
src/client-pwa/
├── index.html          # Main HTML file
├── styles.css          # CSS styles with responsive design
├── app.js              # Main application JavaScript
├── sw.js               # Service Worker for offline functionality
├── manifest.json       # PWA manifest file
├── package.json        # Project configuration
├── icons/              # PWA icons directory
│   └── README.md       # Icon requirements
└── README.md           # This file
```

## Usage

### Joining a Session

1. Enter the session ID provided by the admin (e.g., "CHURCH-2025-001")
2. Click "Join Session"
3. Select your preferred language from the available options
4. Wait for translations to begin

### Audio Controls

- **Mute/Unmute**: Click the speaker icon
- **Volume**: Use the volume slider (0-100%)
- **TTS Mode**: Automatically determined by session configuration

### Display Customization

1. Click the "Settings" button in the footer
2. Adjust the following options:
   - **Font Size**: Small, Medium, Large, Extra Large
   - **Font Family**: Sans Serif, Serif, Monospace
   - **Background**: White, Light Gray, Dark Gray, Black
   - **Text Color**: Black, White, Blue, Green
3. Settings are automatically saved to localStorage

### Fullscreen Mode

- Click the fullscreen button in the header
- Useful for better visibility during services
- Exit by pressing Escape or clicking the button again

## Browser Compatibility

- **Chrome/Chromium**: Full support including installation
- **Firefox**: Full support including installation
- **Safari**: Full support including installation (iOS 11.3+)
- **Edge**: Full support including installation

## Offline Functionality

The PWA includes a service worker that provides:

- **Offline Access**: Basic functionality when network is unavailable
- **Caching**: Static assets are cached for faster loading
- **Background Sync**: Queued actions when connection is restored
- **Update Management**: Automatic updates with user notification

## Technical Details

### WebSocket Connection

The app connects to the local WebSocket server running on the admin machine:
- **Default URL**: `ws://localhost:3001` (configurable)
- **Protocol**: Socket.IO for reliable real-time communication
- **Reconnection**: Automatic reconnection with exponential backoff

### Local Storage

The following data is stored locally:
- **Settings**: Display preferences and audio settings
- **Session Info**: Last session ID for quick reconnection
- **Language Preference**: Selected language for automatic selection

### Security

- **HTTPS**: Required for PWA installation and some features
- **Local Network**: Designed for local church network access
- **No Personal Data**: No personal information is stored or transmitted

## Development Notes

This PWA is designed to work with the Service Translate WebSocket server. The current implementation includes:

- ✅ PWA structure and service worker
- ✅ Responsive mobile-first design
- ✅ Settings management and persistence
- ⏳ WebSocket integration (next subtask)
- ⏳ Language management (next subtask)
- ⏳ Local TTS integration (next subtask)
- ⏳ Audio playback system (next subtask)

## Troubleshooting

### PWA Installation Issues

1. Ensure the app is served over HTTPS (or localhost for development)
2. Check that all required manifest fields are present
3. Verify that the service worker is registered successfully

### Connection Issues

1. Verify the WebSocket server is running on the admin machine
2. Check that both devices are on the same network
3. Ensure firewall settings allow WebSocket connections

### Audio Issues

1. Check browser permissions for audio playback
2. Verify volume settings and mute status
3. Test with different TTS modes (cloud vs local)

For more help, check the browser developer console for error messages.