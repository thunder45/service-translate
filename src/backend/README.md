# Service Translate Backend

AWS infrastructure and Lambda functions for the Service Translate system.

## Architecture

- **API Gateway WebSocket API**: Real-time bidirectional communication
- **Lambda Functions**: Event-driven handlers for each API route
- **DynamoDB**: Connection, session, and terminology storage
- **Cognito**: Admin authentication
- **Transcribe**: Audio-to-text conversion
- **Translate**: Multi-language translation

## Prerequisites

- Node.js 20+
- AWS CLI configured
- AWS CDK CLI: `npm install -g aws-cdk`

## Setup

```bash
cd src/backend
npm install
```

## Deployment

```bash
# Bootstrap CDK (first time only)
cdk bootstrap

# Deploy stack
npm run deploy

# View differences before deploy
npm run diff
```

## Environment Variables

After deployment, note the outputs:
- `WebSocketURL`: Use in client applications (convert https:// to wss://)
- `UserPoolId`: For Cognito authentication
- `UserPoolClientId`: For Cognito authentication

## Lambda Handlers

### Connection Management
- **connect**: Establishes WebSocket connection with authentication
- **disconnect**: Cleans up connection and pauses/removes from sessions

### Session Management
- **startsession**: Creates new translation session (admin only)
- **endsession**: Terminates active session (admin only)
- **joinsession**: Joins or rejoins existing session
- **leavesession**: Removes client from session

### Audio & Translation
- **audiostream**: Receives audio chunks and triggers transcription/translation
- **setlanguage**: Changes client's preferred translation language

### Terminology
- **addterminology**: Adds custom translation terms (admin only)

## Key Implementation Details

### Connection Parameters
- Passed as query string parameters (not body)
- Admin connections require JWT token in Authorization parameter
- Format: `?connectionType=admin&deviceId=xyz&Authorization=Bearer%20token`

### Session Reconnection
- Admin disconnect → session enters "paused" state
- Admin rejoin via `joinsession` → session resumes to "active"
- Clients can disconnect/reconnect without affecting session

### Timestamps
- All messages include ISO 8601 UTC timestamp
- Format: `2024-01-01T12:00:00.123Z`

## Testing

Create admin user:
```bash
aws cognito-idp admin-create-user \
  --user-pool-id <UserPoolId> \
  --username admin@example.com \
  --temporary-password TempPass123!
```

## Next Steps

1. Implement audio processing in audiostream handler
2. Add Transcribe streaming integration
3. Add Translate API calls
4. Implement QR code generation
5. Add CloudWatch metrics and alarms
