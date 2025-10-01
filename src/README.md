# Service Translate - New Implementation

Implementation based on API_SPECIFICATION-2025-10-01-FINAL.md

## Project Structure

```
src/
├── backend/           # AWS CDK infrastructure and Lambda functions
│   ├── cdk/          # CDK stack definitions
│   ├── lambdas/      # Lambda function handlers
│   └── lib/          # Shared libraries
├── capture/          # macOS audio capture application
├── client/           # Web/mobile client application
└── shared/           # Shared types and utilities
```

## Implementation Status

- [ ] Backend Infrastructure (AWS CDK)
- [ ] WebSocket API Gateway
- [ ] Lambda Functions
- [ ] DynamoDB Tables
- [ ] Cognito Authentication
- [ ] Audio Capture Application
- [ ] Web Client Application

## Key Changes from Old Implementation

1. Connection parameters now passed as query strings (not body)
2. Environment variables use https:// format (converted to wss:// by clients)
3. Audio config passed in startsession request body
4. All messages require timestamp field
5. Standardized error response format
6. Session reconnection support for admin
7. Optional sessionName for human-readable session IDs

## Getting Started

See individual component READMEs for setup instructions.
