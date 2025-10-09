# Service Translate - Shared Types

**TypeScript type definitions shared across the Service Translate application.**

## Overview

This directory contains shared TypeScript types and interfaces used by both the local Electron application and any remaining backend components. These types ensure type safety and consistency across the application.

## File Structure

```
src/shared/
├── types.ts     # Core TypeScript type definitions
└── README.md    # This file
```

## Key Type Definitions

### Core Types
- **ConnectionType**: `'admin' | 'client'` - User connection types
- **SourceLanguage**: `'pt' | 'en' | 'es' | 'fr' | 'de' | 'it'` - Supported source languages (Portuguese, English, Spanish, French, German, Italian)
- **TargetLanguage**: `'en' | 'fr' | 'es' | 'de' | 'it' | 'pt'` - Supported translation languages (English, French, Spanish, German, Italian, Portuguese)
- **AudioEncoding**: `'pcm' | 'opus' | 'flac'` - Audio format options
- **SessionStatus**: Session state management types
- **MessageType**: Event and message categorization (includes admin message types)

### Admin Authentication Types
- **AdminIdentity**: Persistent admin identity with UUID, username, and session ownership
- **AdminPermissions**: Granular permission system for admin operations
- **AdminConnectionContext**: Admin connection state and authentication context
- **SessionData**: Enhanced session data with persistent admin ownership (replaces adminSocketId)
- **SessionConfig**: Comprehensive session configuration interface
- **ClientData**: Client connection and preference data

### Admin Message Protocol Types
- **AdminAuthMessage/AdminAuthResponse**: Authentication flow messages
- **StartSessionMessage/StartSessionResponseMessage**: Session creation messages
- **ListSessionsMessage/ListSessionsResponse**: Session listing and management
- **UpdateSessionConfigMessage/UpdateSessionConfigResponse**: Configuration updates
- **TokenRefreshMessage/TokenRefreshResponse**: JWT token management
- **AdminErrorMessage**: Structured error responses with user-friendly messages

### Error Handling System
- **AdminErrorCode**: Comprehensive enum with 25+ specific error codes
- **ERROR_MESSAGES**: User-friendly error message mappings with retry strategies
- **RetryStrategy**: Client-side retry configuration for error recovery

### Configuration Interfaces
- **AudioConfig**: Audio capture configuration
- **TranslationRequest**: Translation service requests
- **TranslationResponse**: Translation service responses

### Authentication Types
- **ConnectQueryParams**: Connection parameter structure
- **ConnectionResponse**: Connection establishment responses

## Usage

These types are imported and used throughout the application:

```typescript
import { TargetLanguage, AudioConfig, StreamingConfig } from '../shared/types';
```

## Architecture Support

The types in this directory support both **local and persistent admin session architecture**:
- Direct AWS service integration types
- Local audio processing configurations
- **Persistent admin authentication with JWT tokens**
- **WebSocket message protocol types for admin session management**
- **Comprehensive error handling and retry strategies**
- **Session ownership and admin identity management**

## Type Safety

All interfaces and types are designed to:
- Ensure compile-time type checking
- Provide clear API contracts
- Support IDE autocompletion
- Maintain consistency across components

This shared type system enables reliable communication between the Electron main process, renderer process, and AWS service integrations.
