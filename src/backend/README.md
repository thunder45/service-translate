# Service Translate Backend - Production Ready

AWS serverless infrastructure with real-time audio translation capabilities.

## Architecture

- **API Gateway WebSocket API**: Real-time bidirectional communication
- **Lambda Functions**: 9 event-driven handlers for each API route
- **DynamoDB**: Connection, session, and terminology storage with TTL
- **Cognito**: Admin authentication with JWT tokens
- **AWS Transcribe Streaming**: Real-time Portuguese audio transcription
- **AWS Translate**: Multi-language translation with custom terminology

## Prerequisites

- Node.js 20+
- AWS CLI configured with appropriate permissions
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

## Post-Deployment Setup

### 1. Note the Outputs
After deployment, save these values:
- `WebSocketURL`: Use in client applications (convert https:// to wss://)
- `UserPoolId`: For Cognito authentication
- `UserPoolClientId`: For Cognito authentication

### 2. Create Admin User
```bash
./create-admin.sh admin@example.com <UserPoolId>
```

### 3. Test Connection
```bash
./test-connection.sh
```

## Lambda Handlers - All Implemented ✅

### Connection Management
- **connect.ts**: Establishes WebSocket connection with JWT authentication
- **disconnect.ts**: Cleans up connection and pauses/removes from sessions

### Session Management
- **startsession.ts**: Creates new translation session with QR code (admin only)
- **endsession.ts**: Terminates active session with statistics (admin only)
- **joinsession.ts**: Joins or rejoins existing session (supports admin reconnection)
- **leavesession.ts**: Removes client from session

### Audio & Translation
- **audiostream.ts**: **Real AWS Transcribe Streaming + AWS Translate integration**
- **setlanguage.ts**: Changes client's preferred translation language

### Terminology
- **addterminology.ts**: Adds custom translation terms (admin only)

## Real Audio Processing Pipeline

The `audiostream.ts` handler implements a complete real-time translation pipeline:

1. **Audio Buffering**: Collects chunks until ~64KB threshold
2. **AWS Transcribe Streaming**: Real-time Portuguese transcription (not placeholder)
3. **Custom Terminology**: Applies domain-specific term replacements
4. **AWS Translate**: Translates to all target languages (EN, FR, ES, DE, IT)
5. **WebSocket Broadcasting**: Sends translations to all connected clients

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

### Error Handling
- Standardized error responses with type, code, message, details
- Proper HTTP status codes for WebSocket responses
- Comprehensive logging for debugging

## Testing

### Create Admin User
```bash
./create-admin.sh admin@example.com <UserPoolId>
```

### Change Password (First Login)
```bash
./change-password.sh admin@example.com <UserPoolId>
```

### Get Authentication Token
```bash
./get-token.sh admin@example.com password <UserPoolId> <ClientId>
```

### Test WebSocket Connection
```bash
./test-connection.sh
```

## Monitoring

The infrastructure includes hooks for:
- CloudWatch Logs (all Lambda functions)
- CloudWatch Metrics (API Gateway, DynamoDB)
- X-Ray Tracing (Lambda functions)
- DynamoDB TTL for automatic cleanup

## Security

- JWT token validation for admin connections
- IAM roles with least-privilege access
- VPC endpoints for private communication (optional)
- Encryption at rest and in transit

## Cost Optimization

- Pay-per-use serverless architecture
- DynamoDB on-demand billing
- Lambda provisioned concurrency (optional)
- API Gateway caching (optional)

## Production Readiness

This backend is **production-ready** with:
- ✅ Real AWS service integrations (not placeholders)
- ✅ Proper error handling and logging
- ✅ Security best practices
- ✅ Auto-scaling capabilities
- ✅ Cost optimization
- ✅ Monitoring hooks

The main missing component is the **web client application** for end users.
