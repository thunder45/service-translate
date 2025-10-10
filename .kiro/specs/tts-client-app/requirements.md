# TTS Client Application - Requirements Document

## Introduction

This feature adds text-to-speech (TTS) capabilities to Service Translate with a client application for congregation members. The system will convert translated text to audio using either cloud-based AWS Polly or local device TTS, and provide a simple web-based client for users to listen to translations in their preferred language.

## Requirements

### Requirement 1: Cloud Text-to-Speech Integration

**User Story:** As an admin, I want to configure cloud-based TTS so that translated text can be converted to high-quality audio for client devices.

#### Acceptance Criteria

1. WHEN admin enables cloud TTS THEN the system SHALL integrate with Amazon Polly for text-to-speech conversion
2. WHEN configuring Polly THEN admin SHALL be able to choose between Standard voices ($4/1M chars) and Neural voices ($16/1M chars)
3. WHEN Polly is unavailable THEN the system SHALL automatically fallback to local TTS
4. WHEN local TTS fails THEN the system SHALL continue with text-only display
5. WHEN using Polly THEN the system SHALL support all 5 target languages (EN, ES, FR, DE, IT)
6. WHEN admin switches between cloud and local TTS THEN the change SHALL take effect without interrupting the active session

### Requirement 2: Local Device TTS Fallback

**User Story:** As a client user, I want the app to use my device's built-in TTS when cloud TTS is unavailable, so I can still hear audio translations.

#### Acceptance Criteria

1. WHEN cloud TTS is disabled or fails THEN client devices SHALL use local Web Speech API for TTS
2. WHEN local TTS is available THEN the system SHALL detect and use device-native voices for each language
3. WHEN no suitable voice is found THEN the system SHALL use the default device voice
4. WHEN local TTS fails THEN the system SHALL display text-only without audio
5. WHEN switching between TTS modes THEN audio playback SHALL continue seamlessly

### Requirement 3: Session-Based Client Application

**User Story:** As a congregation member, I want to join a translation session using a simple session ID so I can receive translations on my mobile device.

#### Acceptance Criteria

1. WHEN admin starts a session THEN the system SHALL generate a human-readable session ID (e.g., "CHURCH-2025-001")
2. WHEN client enters session ID THEN they SHALL be able to join the active translation session
3. WHEN session is active THEN clients SHALL receive real-time translated text and audio
4. WHEN client app crashes THEN they SHALL be able to reconnect to the same session using the session ID
5. WHEN admin app crashes THEN it SHALL be able to reconnect and resume the existing session

### Requirement 4: Progressive Web Application (PWA)

**User Story:** As a congregation member, I want to access the translation service through my mobile browser without installing an app.

#### Acceptance Criteria

1. WHEN accessing the client URL THEN the system SHALL provide a Progressive Web Application
2. WHEN using the PWA THEN it SHALL work offline after initial load for basic functionality
3. WHEN on mobile devices THEN the PWA SHALL support fullscreen mode
4. WHEN network is poor THEN the PWA SHALL handle connection issues gracefully
5. WHEN PWA is added to home screen THEN it SHALL behave like a native app

### Requirement 5: Dynamic Language Selection and Audio Controls

**User Story:** As a client user, I want to select my preferred language from available options and control audio playback so I can customize my experience.

#### Acceptance Criteria

1. WHEN joining a session THEN client SHALL receive available languages from session metadata (subset of EN, ES, FR, DE, IT)
2. WHEN admin changes available languages THEN client SHALL update language options immediately
3. WHEN changing language THEN the switch SHALL take effect immediately for new translations
4. WHEN audio is playing THEN client SHALL have mute/unmute controls
5. WHEN audio is available THEN client SHALL have volume control (0-100%)
6. WHEN TTS mode changes THEN client SHALL be notified of available audio options

### Requirement 6: Customizable Display Options

**User Story:** As a client user, I want to customize the text display so I can read translations comfortably in different lighting conditions.

#### Acceptance Criteria

1. WHEN viewing translations THEN client SHALL be able to adjust font size (small, medium, large, extra-large)
2. WHEN customizing display THEN client SHALL be able to choose font family (serif, sans-serif, monospace)
3. WHEN setting preferences THEN client SHALL be able to select background color (white, black, dark gray, light gray)
4. WHEN setting preferences THEN client SHALL be able to select text color (black, white, blue, green)
5. WHEN preferences are set THEN they SHALL persist across sessions using local storage

### Requirement 7: Cost Tracking and Management

**User Story:** As an admin, I want to monitor usage costs for all cloud services so I can manage expenses effectively.

#### Acceptance Criteria

1. WHEN using cloud services THEN the system SHALL track AWS Transcribe usage and costs separately
2. WHEN using cloud services THEN the system SHALL track AWS Translate usage and costs separately  
3. WHEN using cloud services THEN the system SHALL track AWS Polly usage and costs separately
4. WHEN viewing costs THEN admin SHALL see total combined cost for the current session
5. WHEN session ends THEN admin SHALL see final cost breakdown by service
6. WHEN costs exceed $3/hour THEN admin SHALL receive a warning notification

### Requirement 8: Real-Time Communication Architecture

**User Story:** As a system administrator, I want efficient real-time communication between admin and clients so the system scales to multiple users.

#### Acceptance Criteria

1. WHEN clients connect THEN the system SHALL use WebSocket connections for real-time communication
2. WHEN translations are ready THEN they SHALL be broadcast to all connected clients in their selected language
3. WHEN audio is generated THEN it SHALL be streamed efficiently to minimize bandwidth usage
4. WHEN multiple clients are connected THEN the system SHALL handle concurrent connections (up to 50 users)
5. WHEN network issues occur THEN clients SHALL automatically attempt to reconnect

### Requirement 9: Dynamic Session Configuration

**User Story:** As a client, I want to automatically receive session configuration updates so I know what languages and audio options are available.

#### Acceptance Criteria

1. WHEN joining a session THEN client SHALL receive session metadata including available languages and TTS configuration
2. WHEN admin changes language subset THEN all clients SHALL receive updated available languages immediately
3. WHEN admin changes TTS mode (Neural/Standard/Local) THEN all clients SHALL receive updated audio quality information
4. WHEN cloud TTS is enabled THEN metadata SHALL indicate high-quality audio is available
5. WHEN only local TTS is available THEN metadata SHALL indicate device-based audio only
6. WHEN TTS is disabled THEN metadata SHALL indicate text-only mode

### Requirement 10: Admin Language and TTS Management

**User Story:** As an admin, I want to dynamically control which languages are available and TTS quality settings during an active session to optimize costs and user experience.

#### Acceptance Criteria

1. WHEN configuring session THEN admin SHALL be able to select a subset of languages from (EN, ES, FR, DE, IT)
2. WHEN session is active THEN admin SHALL be able to add or remove languages without restarting the session
3. WHEN changing language selection THEN only selected languages SHALL be translated and sent to clients
4. WHEN admin changes TTS mode (Neural/Standard/Local) THEN the change SHALL apply to new translations immediately
5. WHEN reducing languages THEN clients using removed languages SHALL be notified to select from available options
6. WHEN adding languages THEN clients SHALL see new language options immediately

### Requirement 11: Audio Quality and Performance

**User Story:** As a client user, I want high-quality audio with minimal delay so I can follow along with the service effectively.

#### Acceptance Criteria

1. WHEN using Polly Neural voices THEN audio quality SHALL be near-human quality
2. WHEN using Polly Standard voices THEN audio quality SHALL be clear and intelligible
3. WHEN using local TTS THEN audio quality SHALL depend on device capabilities
4. WHEN audio is generated THEN latency SHALL be less than 2 seconds from text to audio playback
5. WHEN multiple audio requests occur THEN they SHALL be queued and played in sequence

**User Story:** As a client user, I want high-quality audio with minimal delay so I can follow along with the service effectively.

#### Acceptance Criteria

1. WHEN using Polly Neural voices THEN audio quality SHALL be near-human quality
2. WHEN using Polly Standard voices THEN audio quality SHALL be clear and intelligible
3. WHEN using local TTS THEN audio quality SHALL depend on device capabilities
4. WHEN audio is generated THEN latency SHALL be less than 2 seconds from text to audio playback
5. WHEN multiple audio requests occur THEN they SHALL be queued and played in sequence

## Cost Analysis

### AWS Polly Pricing (Corrected)
- **Standard Voices**: $4.00 per 1 million characters
- **Neural Voices**: $16.00 per 1 million characters
- **Free Tier**: 5M chars/month (Standard), 1M chars/month (Neural) for first 12 months

### Realistic Usage Estimates
- **Average speaking rate**: ~150 words per minute = ~750 characters per minute
- **1 hour of continuous speech**: ~45,000 characters
- **1 day (8 hours) of service**: ~360,000 characters

### Hourly Cost Estimates (Per Language)
- **Standard Polly**: $0.18/hour (45k chars × $4/1M chars)
- **Neural Polly**: $0.72/hour (45k chars × $16/1M chars)
- **5 languages Neural**: $3.60/hour (well within $3/hour budget per language)

### Combined Service Costs (Per Hour)
- **Transcribe**: $1.44/hour (60 min × $0.024/min)
- **Translate**: $0.72/hour (45k chars × 5 languages × $15/1M chars)
- **Polly Neural (5 languages)**: $3.60/hour
- **Total**: $5.76/hour (exceeds $3/hour target, requires optimization)

### Cost Optimization Strategies
1. **Language Subset Selection**: Admin can choose 1-3 languages instead of all 5 (reduces Polly costs proportionally)
2. **Standard vs Neural Choice**: Use Standard Polly voices ($0.18/hour per language) vs Neural ($0.72/hour per language)
3. **Smart Caching**: Avoid re-generating identical translations and audio
4. **Local TTS Primary**: Use local TTS as default with Polly as premium upgrade option
5. **Dynamic Cost Control**: Admin can switch TTS modes during session based on budget

### Example Cost Scenarios (Per Hour)
- **2 Languages + Standard Polly**: $2.52/hour total (within $3 budget)
- **3 Languages + Standard Polly**: $2.70/hour total (within $3 budget)  
- **1 Language + Neural Polly**: $2.88/hour total (within $3 budget)
- **2 Languages + Neural Polly**: $4.32/hour total (exceeds budget, requires Standard or Local TTS)