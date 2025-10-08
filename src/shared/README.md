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
- **SourceLanguage**: `'pt' | 'en' | 'es' | 'fr' | 'de' | 'it'` - Supported source languages
- **TargetLanguage**: `'en' | 'fr' | 'es' | 'de' | 'it' | 'pt'` - Supported translation languages
- **AudioEncoding**: `'pcm' | 'opus' | 'flac'` - Audio format options
- **SessionStatus**: Session state management types
- **MessageType**: Event and message categorization

### Configuration Interfaces
- **AudioConfig**: Audio capture configuration
- **StreamingConfig**: Direct streaming parameters
- **TranslationRequest**: Translation service requests
- **TranslationResponse**: Translation service responses

### Authentication Types
- **ConnectQueryParams**: Connection parameter structure
- **ConnectionResponse**: Connection establishment responses
- **AuthenticationConfig**: Cognito authentication settings

## Usage

These types are imported and used throughout the application:

```typescript
import { TargetLanguage, AudioConfig, StreamingConfig } from '../shared/types';
```

## Local Architecture Focus

The types in this directory reflect the current **local-only architecture**:
- Direct AWS service integration types
- Local audio processing configurations
- Simplified authentication structures
- No WebSocket or server-specific types needed

## Type Safety

All interfaces and types are designed to:
- Ensure compile-time type checking
- Provide clear API contracts
- Support IDE autocompletion
- Maintain consistency across components

This shared type system enables reliable communication between the Electron main process, renderer process, and AWS service integrations.
