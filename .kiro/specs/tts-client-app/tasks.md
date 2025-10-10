# TTS Client Application - Implementation Plan

## Task Overview

This implementation plan converts the TTS Client Application design into actionable coding tasks. The plan builds on the existing WebSocket infrastructure and session management to add TTS capabilities and client applications.

## Implementation Tasks

- [x] 1. Create Local WebSocket Server Infrastructure

- [x] 1.1 Clean up unused cloud WebSocket infrastructure
  - Remove CDK stack files (src/backend/cdk/)
  - Remove Lambda handler files (src/backend/lambdas/)
  - Remove compiled WebSocket client code (src/capture/dist/websocket-client.js)
  - Clean up any cloud-related dependencies
  - _Requirements: Cleanup_

- [x] 1.2 Create local Node.js WebSocket server
  - Initialize new Node.js project in `src/websocket-server/`
  - Install Socket.IO, TypeScript, and dependencies
  - Create basic WebSocket server with Socket.IO
  - Set up TypeScript configuration and build scripts
  - _Requirements: 8.1, 8.2_

- [x] 1.3 Implement local session management system
  - Create SessionManager class with in-memory session storage
  - Implement human-readable session ID generation (e.g., "CHURCH-2025-001")
  - Add client connection tracking and management
  - Create session persistence using local JSON files
  - _Requirements: 3.1, 3.4, 3.5_

- [x] 1.4 Define WebSocket message protocols for local server
  - Update shared/types.ts for local WebSocket communication
  - Implement message validation and error handling
  - Add message routing and broadcasting logic
  - Create language-specific client grouping system
  - _Requirements: 8.1, 8.3, 9.1_

- [ ]* 1.5 Write unit tests for local WebSocket infrastructure
  - Test session creation and management
  - Test message routing and broadcasting
  - Test client connection handling and reconnection
  - _Requirements: 8.1, 8.2_

- [x] 2. Enhance Admin Application with TTS and Session Management

- [x] 2.1 Integrate AWS Polly SDK for text-to-speech
  - Add @aws-sdk/client-polly to capture application dependencies
  - Create TTSManager class in src/capture/src/tts-manager.ts
  - Implement voice selection between Standard and Neural voices
  - Add language-specific voice mapping for EN, ES, FR, DE, IT
  - Implement audio generation with MP3 output format
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2.2 Add local WebSocket client to admin application
  - Install socket.io-client in capture application
  - Create WebSocketManager class in src/capture/src/websocket-manager.ts
  - Implement connection to local WebSocket server (localhost)
  - Add session creation and management through local WebSocket
  - Handle reconnection and error recovery for local network
  - _Requirements: 3.1, 3.5, 8.2_

- [x] 2.3 Implement cost tracking and monitoring system
  - Create CostTracker class in src/capture/src/cost-tracker.ts
  - Track AWS Transcribe usage (minutes) and costs
  - Track AWS Translate usage (characters) and costs  
  - Track AWS Polly usage (characters) and voice type costs
  - Add real-time cost display in admin UI
  - Implement $3/hour warning system with notifications
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 2.4 Add TTS configuration controls to admin UI
  - Update index.html with TTS mode selection controls
  - Add language subset selection checkboxes (EN, ES, FR, DE, IT)
  - Create TTS mode switcher (Neural/Standard/Local/Disabled)
  - Add cost display panel with real-time updates
  - Implement dynamic configuration changes during active sessions
  - _Requirements: 1.6, 10.1, 10.2, 10.3, 10.4_

- [x] 2.5 Integrate TTS into existing translation pipeline
  - Modify DirectStreamingManager to include TTS generation
  - Add TTS audio generation after translation completion
  - Implement audio broadcasting through WebSocket
  - Add TTS fallback chain (Polly → Local → Text-only)
  - Create audio caching to avoid duplicate generation
  - _Requirements: 1.3, 1.4, 8.2, 8.3_

- [ ]* 2.6 Write integration tests for admin enhancements
  - Test AWS Polly integration and voice selection
  - Test WebSocket communication and broadcasting
  - Test cost tracking accuracy and warnings
  - Test dynamic configuration changes
  - _Requirements: 1.1, 7.1, 10.4_

- [x] 3. Develop Progressive Web Application (PWA) Client

- [x] 3.1 Create PWA project structure and service worker
  - Initialize PWA project in `src/client-pwa/`
  - Create package.json with PWA dependencies (no build tools needed)
  - Set up service worker for offline functionality
  - Create PWA manifest.json for installation
  - Build responsive mobile-first HTML/CSS layout
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 3.2 Implement session joining and local WebSocket client
  - Create index.html with session ID input interface
  - Implement WebSocket client connection to local server (church WiFi)
  - Add session validation and error handling
  - Create session metadata reception and processing
  - Add automatic reconnection for local network issues
  - _Requirements: 3.2, 3.4, 8.1, 9.1_

- [x] 3.3 Build language selection and management
  - Create dynamic language selection UI based on session metadata
  - Implement real-time language option updates from admin
  - Add language switching functionality during active sessions
  - Handle graceful language removal notifications
  - Store language preference in localStorage
  - _Requirements: 5.1, 5.2, 5.3, 9.2, 10.5_

- [x] 3.4 Integrate Web Speech API for local TTS
  - Create LocalTTSService class using Web Speech API
  - Add voice detection and language capability mapping
  - Implement voice quality assessment and selection
  - Create TTS fallback chain (cloud → local → text-only)
  - Handle browser compatibility and permissions
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 3.5 Create audio playback and control system
  - Implement audio streaming and playback for Polly-generated audio
  - Add mute/unmute and volume control (0-100%)
  - Create audio queue management for sequential playback
  - Add audio format support (MP3 primary, fallback to others)
  - Handle audio loading states and error recovery
  - _Requirements: 5.4, 5.5, 11.5_

- [x] 3.6 Build customizable display interface
  - Create font size controls (small, medium, large, extra-large)
  - Add font family selection (serif, sans-serif, monospace)
  - Implement background and text color customization
  - Add fullscreen mode toggle and responsive design
  - Create settings persistence using localStorage
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ]* 3.7 Write comprehensive PWA tests
  - Test session joining and reconnection
  - Test local TTS integration and fallback
  - Test audio playback and controls
  - Test display customization and persistence
  - _Requirements: 4.1, 2.1, 5.4, 6.1_

- [x]  4. Enhance Local Server for TTS Audio Distribution

- [x] 4.1 Add local audio file management
  - Create local audio storage directory structure
  - Implement audio file caching with cleanup policies
  - Add audio file serving through local HTTP server
  - Create audio URL generation for local network access
  - _Requirements: 1.5, 11.1, 11.2_

- [x] 4.2 Enhance local WebSocket server for audio broadcasting
  - Add audio metadata (duration, format, voice type) to messages
  - Implement language-specific client filtering for audio
  - Add audio caching logic to avoid duplicate generation
  - Create efficient audio streaming for local network
  - _Requirements: 8.2, 8.3, 11.4_

- [x] 4.3 Add TTS configuration to local session management
  - Update local session data model to include TTS configuration
  - Add TTS mode change broadcasting to connected clients
  - Implement session metadata updates for TTS capabilities
  - Create dynamic configuration updates during sessions
  - _Requirements: 9.2, 9.3, 9.6, 10.4_

- [x] 4.4 Integrate TTS generation into local server
  - Add AWS Polly integration to local WebSocket server
  - Implement voice selection logic for different languages
  - Add audio format conversion and local file storage
  - Create error handling and fallback mechanisms
  - _Requirements: 1.1, 1.2, 1.3_

- [ ]* 4.5 Write local server integration tests
  - Test audio generation and local storage
  - Test TTS configuration broadcasting
  - Test session metadata updates
  - Test audio URL generation and local access
  - _Requirements: 1.1, 8.2, 9.2_

- [x]  5. Implement Error Handling and Resilience

- [x] 5.1 Create TTS fallback chain implementation
  - Implement Polly → Local TTS → Text-only fallback logic in admin app
  - Add error detection and automatic fallback triggering
  - Create fallback notification system for clients via WebSocket
  - Add fallback performance monitoring and logging
  - _Requirements: 1.3, 1.4, 2.1, 2.4_

- [x] 5.2 Enhance existing connection recovery system
  - Extend existing WebSocket reconnection logic for TTS features
  - Add session state recovery for TTS configuration
  - Enhance connection health monitoring for audio capabilities
  - Add offline mode handling for PWA clients with cached audio
  - _Requirements: 3.4, 3.5, 4.4, 8.1_

- [x] 5.3 Add comprehensive error logging and monitoring
  - Extend existing CloudWatch logging for TTS operations
  - Add error tracking for Polly API failures
  - Create performance monitoring for audio generation latency
  - Add debugging tools for TTS configuration issues
  - _Requirements: 11.4, 8.4_

- [ ]* 5.4 Write resilience and error handling tests
  - Test TTS fallback chain under various failure scenarios
  - Test reconnection behavior with TTS session recovery
  - Test error handling and graceful degradation
  - Test performance under load with audio generation
  - _Requirements: 1.3, 3.4, 8.4_

- [x]  6. Configure Local Deployment Environment

- [x] 6.1 Set up local environment for TTS services
  - Configure AWS credentials for Polly access on local machine
  - Set up local file system permissions for audio storage
  - Create local network configuration for WebSocket server
  - Add environment configuration for different deployment scenarios
  - _Requirements: 1.1, 7.6_

- [x] 6.2 Create local deployment scripts
  - Create startup scripts for local WebSocket server
  - Add PWA serving through local HTTP server
  - Create configuration management for local environment
  - Write deployment and maintenance documentation
  - _Requirements: 4.1, 4.2_

- [x] 6.3 Implement local security and access controls
  - Add basic authentication for local WebSocket server
  - Implement rate limiting for local Polly API calls
  - Create secure session ID generation and validation
  - Ensure local network security for audio communications
  - _Requirements: 3.1, 8.1_

- [ ]* 6.4 Write local deployment and security tests
  - Test local deployment scripts and configuration
  - Test local network security and access controls
  - Test performance with multiple local clients
  - Test local monitoring and error handling
  - _Requirements: 8.4, 3.1_

- [x]  7. Performance Optimization and Monitoring

- [x] 7.1 Optimize audio generation and delivery
  - Implement smart caching strategies for repeated translations
  - Add audio compression and format optimization for mobile
  - Create efficient audio streaming with progressive loading
  - Optimize Polly voice selection for quality vs. cost balance
  - _Requirements: 11.1, 11.2, 11.4_

- [x] 7.2 Implement client-side performance optimizations
  - Add lazy loading for PWA resources and audio files
  - Optimize WebSocket message handling and processing
  - Implement efficient DOM updates for translation display
  - Add memory management and cleanup for long sessions
  - _Requirements: 4.2, 11.5_

- [x] 7.3 Enhance monitoring and analytics system
  - Extend existing CloudWatch monitoring for TTS metrics
  - Add user analytics and usage tracking for PWA clients
  - Create cost optimization recommendations based on usage patterns
  - Add capacity planning metrics for concurrent audio generation
  - _Requirements: 7.1, 7.2, 7.3_

- [ ]* 7.4 Write performance and load tests
  - Test system performance with 50 concurrent PWA clients
  - Test audio latency and quality under load
  - Test cost optimization and caching effectiveness
  - Test scalability and resource usage with TTS enabled
  - _Requirements: 8.4, 11.4, 11.5_

## Implementation Notes

### Current State Analysis
- **❌ Local WebSocket Server**: Needs to be created (existing cloud infrastructure to be removed)
- **❌ Session Management**: Needs local implementation (existing Lambda handlers to be removed)
- **✅ Translation Pipeline**: Direct AWS Transcribe/Translate streaming functional (local-only mode)
- **❌ TTS Integration**: No AWS Polly integration exists yet
- **❌ PWA Client**: No client application exists yet
- **❌ Cost Tracking**: No cost monitoring system implemented
- **❌ WebSocket Integration**: Admin app uses local-only mode, needs local WebSocket client

### Development Approach
- **Build on Existing**: Leverage existing WebSocket and session infrastructure
- **Incremental Development**: Each task builds on previous components
- **Test-Driven Development**: Core functionality tests are required, optional tests marked with *
- **Backward Compatibility**: All changes maintain existing local-only functionality
- **Cost Awareness**: Every feature considers cost implications and optimization

### Technology Stack
- **WebSocket Server**: Node.js + Socket.IO + TypeScript (local server, new)
- **Session Management**: In-memory + local JSON files (local storage, new)
- **Admin Enhancements**: Electron + AWS SDK + TypeScript (extend existing with local WebSocket client)
- **Client PWA**: Vanilla JavaScript + Web Speech API + Service Worker (new)
- **Infrastructure**: AWS Polly (cloud TTS) + Local file system (audio storage) + existing AWS services

### Quality Assurance
- **Unit Tests**: Individual component functionality
- **Integration Tests**: Component interaction and data flow
- **End-to-End Tests**: Complete user workflows
- **Performance Tests**: Load, latency, and resource usage
- **Accessibility Tests**: Screen readers, keyboard navigation, high contrast

### Deployment Strategy
- **Phase 1**: Create local Node.js WebSocket server and integrate with admin app
- **Phase 2**: Build PWA client for local network access (church WiFi)
- **Phase 3**: Add TTS capabilities and performance optimization

**Local Deployment Architecture:**
- **Admin Machine**: Runs Electron admin app + local WebSocket server
- **Client Devices**: Connect to admin machine via local network (WiFi)
- **Audio Storage**: Local file system on admin machine
- **TTS Service**: AWS Polly (cloud) with local caching

This implementation plan builds on the solid foundation of the existing Service Translate system, adding TTS capabilities and client applications while maintaining the cost-effective and reliable architecture.