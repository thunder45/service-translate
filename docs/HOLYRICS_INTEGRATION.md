Perfect! Holyrics has a **built-in REST API** that allows external applications to send text directly to the screen. There's no plugin needed – it's a native feature[1][2].

## Holyrics API Integration

Holyrics provides the **Communication Panel** feature with an API endpoint called `SetTextCP` (Set Text Communication Panel) that can display custom text on the big screen[1].

### Setup Steps in Holyrics

1. Open Holyrics and go to **Menu → Configurações → API Server** (File → Settings → API Server)[1]
2. Enable the API Server[1]
3. Click **"Gerenciar Permissões"** (Manage Permissions) to create an access token[1]
4. Note the IP address, port, and token for your integration[1]

### Integration Architecture

```
Audio Transcription → Translation → Socket.IO Server → Holyrics API → Big Screen
```

### Implementation: Send Translations to Holyrics

The application includes built-in Holyrics integration in the local streaming manager:

```typescript
// Holyrics configuration in config
const holyricsConfig = {
  enabled: true,
  host: '192.168.1.100',  // IP of the computer running Holyrics
  port: 8091,              // Default Holyrics port (usually 8091)
  token: 'your-api-token', // Token from Holyrics settings
  language: 'fr',          // Target language (fr, en, es, de, it)
  maxLines: 3              // Maximum lines to display
};

/**
 * Send text to Holyrics Communication Panel
 * Uses SetTextCP API endpoint
 */
async function sendToHolyrics(text, show = true) {
  try {
    const url = `http://${holyricsConfig.host}:${holyricsConfig.port}/api/SetTextCP?token=${holyricsConfig.token}`;
    
    const response = await axios.post(url, {
      text: text,
      show: show,
      display_ahead: true // Show immediately without waiting
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error sending to Holyrics:', error.message);
    throw error;
  }
}

/**
 * Clear text from Holyrics screen
 */
async function clearHolyrics() {
  return sendToHolyrics('', false);
}

// Modify the Socket.IO server to include Holyrics
io.on('connection', (socket) => {
  // ... existing code ...
  
  // Receive transcription from presenter
  socket.on('transcription', async (data) => {
    const { text, isFinal, sourceLanguage = 'en' } = data;
    
    if (!isFinal) {
      // For partial results, broadcast to viewers only
      io.to('viewers').emit('partialTranscription', {
        text,
        sourceLanguage,
        timestamp: Date.now()
      });
      return;
    }
    
    // For final results, translate and broadcast
    const targetLanguages = new Set(clientLanguages.values());
    const translations = {};
    
    // Translate to all required languages
    const translationPromises = Array.from(targetLanguages).map(async (lang) => {
      if (lang === sourceLanguage) {
        translations[lang] = text;
        return;
      }
      
      try {
        const command = new TranslateTextCommand({
          Text: text,
          SourceLanguageCode: sourceLanguage,
          TargetLanguageCode: lang
        });
        
        const result = await translateClient.send(command);
        translations[lang] = result.TranslatedText;
      } catch (error) {
        console.error(`Translation error for ${lang}:`, error);
        translations[lang] = text;
      }
    });
    
    await Promise.all(translationPromises);
    
    // Send primary language translation to Holyrics
    // Configure which language to display on the big screen
    const holyricsLanguage = config.holyrics.language; // Configured display language
    const holyricsText = translations[holyricsLanguage] || text;
    
    try {
      await sendToHolyrics(holyricksText);
      console.log('Sent to Holyrics:', holyricksText);
    } catch (error) {
      console.error('Failed to send to Holyrics:', error);
    }
    
    // Broadcast to each language room
    for (const [lang, translatedText] of Object.entries(translations)) {
      io.to(`lang_${lang}`).emit('finalTranscription', {
        text: translatedText,
        originalText: text,
        sourceLanguage,
        targetLanguage: lang,
        timestamp: Date.now()
      });
    }
  });
  
  // Manual control to clear Holyrics screen
  socket.on('clearHolyrics', async () => {
    try {
      await clearHolyrics();
      socket.emit('holyricksCleared');
    } catch (error) {
      socket.emit('holyricksError', error.message);
    }
  });
});
```

### Alternative: Send Accumulated Text

For better readability on the big screen, accumulate multiple sentences:

```javascript
class HolyricsManager {
  constructor(config) {
    this.config = config;
    this.displayedText = '';
    this.maxLines = 3; // Show last 3 sentences
  }
  
  async addTranscription(newText) {
    // Split into sentences
    const sentences = this.displayedText.split(/[.!?]\s+/).filter(s => s.trim());
    
    // Add new sentence
    sentences.push(newText);
    
    // Keep only last N sentences
    const recentSentences = sentences.slice(-this.maxLines);
    this.displayedText = recentSentences.join('. ') + '.';
    
    // Send to Holyrics
    await this.sendToScreen();
  }
  
  async sendToScreen() {
    const url = `http://${this.config.host}:${this.config.port}/api/SetTextCP?token=${this.config.token}`;
    
    await axios.post(url, {
      text: this.displayedText,
      show: true,
      display_ahead: true
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  async clear() {
    this.displayedText = '';
    await axios.post(
      `http://${this.config.host}:${this.config.port}/api/SetTextCP?token=${this.config.token}`,
      { text: '', show: false },
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Usage
const holyricsManager = new HolyricsManager(HOLYRICS_CONFIG);

// In your transcription handler
socket.on('transcription', async (data) => {
  if (data.isFinal) {
    // Translate...
    const translatedText = translations[config.holyrics.language]; // Configured display language
    
    // Send to Holyrics
    await holyricsManager.addTranscription(translatedText);
  }
});
```

### Communication Panel Customization

Control the Communication Panel appearance using `SetCommunicationPanelSettings`[1]:

```javascript
async function configureHolyricsDisplay() {
  const url = `http://${HOLYRICS_CONFIG.host}:${HOLYRICS_CONFIG.port}/api/SetCommunicationPanelSettings?token=${HOLYRICS_CONFIG.token}`;
  
  await axios.post(url, {
    text_font_size: 24,        // Font size
    text_font_color: '#FFFFFF', // White text
    background_color: '#000000', // Black background
    text_align: 'center',      // Center alignment
    // Add more styling options
  }, {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

### Internet Access (Remote Setup)

If the Holyrics computer and server are on different networks, use the internet endpoint[1]:

```javascript
// Get API_KEY from Holyrics settings
async function sendToHolyricsRemote(text) {
  const url = 'https://api.holyrics.com.br/send/SetTextCP';
  
  await axios.post(url, {
    text: text,
    show: true,
    display_ahead: true
  }, {
    headers: {
      'Content-Type': 'application/json',
      'api_key': 'YOUR_API_KEY',  // From Holyrics settings
      'token': 'your-token'        // From Holyrics settings
    }
  });
}
```

### Complete Flow Example

```javascript
// Full integration example
const express = require('express');
const { Server } = require('socket.io');
const axios = require('axios');

// Initialize Holyrics connection
const holyrics = {
  async send(text) {
    return axios.post(
      `http://192.168.1.100:8080/api/SetTextCP?token=abc123`,
      { text, show: true, display_ahead: true },
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// On final transcription
io.on('connection', (socket) => {
  socket.on('finalTranscription', async (data) => {
    // 1. Translate
    const displayTranslation = await translateText(data.text, config.holyrics.language);
    
    // 2. Send to Holyrics big screen
    await holyrics.send(displayTranslation);
    
    // 3. Broadcast to all connected viewers
    io.emit('transcriptionUpdate', {
      text: displayTranslation,
      timestamp: Date.now()
    });
  });
});
```

## Testing the Integration

1. Start Holyrics and enable API Server[1]
2. Test the connection with curl:

```bash
curl -X POST \
  'http://192.168.1.100:8080/api/SetTextCP?token=your-token' \
  -H 'Content-Type: application/json' \
  -d '{"text": "Test message", "show": true, "display_ahead": true}'
```

3. The text should appear on the Holyrics projection screen immediately[1]

## Benefits

**No plugin required**: Native API support in Holyrics[1][2]

**Real-time updates**: Text appears instantly on the big screen[1]

**Flexible control**: Show, hide, and update text programmatically[1]

**Multi-language support**: Send different translations to Holyrics and individual viewers[3]

**Simple HTTP requests**: Easy integration with any programming language[1]

This gives you a complete solution: **live audio transcription → translation → simultaneous display on the church's big screen via Holyrics and individual devices via Socket.IO**[1][3][4].

Sources
[1] holyrics/API-Server https://github.com/holyrics/API-Server
[2] Holyrics Script https://www.holyrics.com.br/tips/holyrics_script.html
[3] Transcribe, translate, and summarize live streams in your ... https://aws.amazon.com/blogs/machine-learning/transcribe-translate-and-summarize-live-streams-in-your-browser-with-aws-ai-and-generative-ai-services/
[4] aws-samples/aws-transcribe-translate-summarize-live- ... https://github.com/aws-samples/aws-transcribe-translate-summarize-live-streams-in-browser
[5] API Item https://www.holyrics.com.br/tips/api_item.html
[6] Tell your pastor that Holyrics is far better than the top paid ... https://www.reddit.com/r/churchtech/comments/1fb7fnc/tell_your_pastor_that_holyrics_is_far_better_than/
[7] How to Use Holyrics & OBS Studio on the Same PC (FREE ... https://www.youtube.com/watch?v=3IvKlnK0EkY
[8] Add and Show Lyrics in Holyrics | | Holyrics Tutorial 2024 https://www.youtube.com/watch?v=ytXQaDpFVpM
[9] Websocket Tutorial https://www.asterics.eu/develop/are-remote-apis/Websocket.html
[10] Holyrics Update v2.22.0 · Issue #9 · bitfocus/companion- ... https://github.com/bitfocus/companion-module-limagiran-holyrics/issues/9
[11] holyrics · GitHub Topics https://github.com/topics/holyrics
[12] Is it normal to have separate servers for REST API and ... https://www.reddit.com/r/node/comments/1jr2on0/is_it_normal_to_have_separate_servers_for_rest/
[13] Free Church Presentation Software | Holyrics Tutorial 2024 https://www.youtube.com/watch?v=tC0LMfMIFuE
[14] Holyrics Church Presentation Tutorials | Complete Guide ... https://www.youtube.com/playlist?list=PLIklmu0_wnmhaoBHUD5sJB3_ZfPY2zehc
[15] Websocket vs REST API. 💥 7 Significant Differences https://www.wallarm.com/what/websocket-vs-rest-api
[16] FreeShow — A free and open-source presenter https://freeshow.app
[17] How to Connect Holyrics to OBS | Display Verses & Lyrics ... https://www.youtube.com/watch?v=olYFhbdGWtI
[18] REST API (HTTP) vs Websockets - Concept Overview With ... https://www.youtube.com/watch?v=fG4dkrlaZAA
[19] Connections https://bitfocus.io/connections
[20] Holyrics Tutorial for Church presenters| Display Faster & ... https://www.youtube.com/watch?v=QPIV-OaMZ8g
[21] WebSockets for the REST-API to stream updates/changes ... https://github.com/sirixdb/sirix/issues/286
[22] Holyrics Tutorial Series https://www.youtube.com/playlist?list=PLAgYwOQMPo0nhxU2C3WXUzAN5HxLN3s41
