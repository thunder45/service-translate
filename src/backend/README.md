# Service Translate Backend - Minimal Authentication Infrastructure

**Simplified AWS infrastructure providing only authentication for local direct streaming.**

## Architecture

- **Cognito User Pool**: Admin user authentication with JWT tokens
- **Cognito Identity Pool**: Direct AWS service access for authenticated users
- **IAM Roles**: Least-privilege access to Transcribe and Translate services
- **No Server Components**: No Lambda, API Gateway, or DynamoDB required

## Prerequisites

- Node.js 20+
- AWS CLI configured with appropriate permissions
- AWS CDK CLI: `npm install -g aws-cdk`

## Setup

```bash
cd src/backend
npm install
```

## What This Provides

This minimal backend infrastructure enables:
- **Admin Authentication**: Secure login for local application users
- **Direct AWS Access**: Identity Pool provides temporary credentials for AWS services
- **Cost Optimization**: No server infrastructure costs, only authentication services

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

# Deploy minimal stack
npm run deploy

# View differences before deploy
npm run diff
```

## Post-Deployment Setup

### 1. Note the Outputs
After deployment, save these values:
- `UserPoolId`: For Cognito authentication
- `UserPoolClientId`: For Cognito authentication  
- `IdentityPoolId`: For direct AWS service access
- `Region`: AWS region for services

### 2. Create Admin User
```bash
./create-admin.sh admin@example.com <UserPoolId>
```

### 3. Test Authentication
```bash
./get-token.sh admin@example.com password <UserPoolId> <ClientId>
```

## Current Implementation - Minimal Auth Only ✅

### Authentication Infrastructure
- **simplified-stack.ts**: Minimal CDK stack with Cognito User Pool and Identity Pool
- **IAM Roles**: Permissions for authenticated users to access Transcribe and Translate
- **No Lambda Functions**: Direct AWS SDK calls from local application
- **No API Gateway**: No WebSocket or REST API infrastructure
- **No DynamoDB**: No session or connection management needed

### Admin Management Scripts

#### Cross-Platform Scripts (Bash + PowerShell)
- **manage-auth.sh** / **manage-auth.ps1**: Consolidated script for all auth operations
  - `get-token` - Retrieves JWT tokens for authentication
  - `change-password` - Changes user passwords (first login)
  - `create-user` - Creates admin users in Cognito User Pool
  - `delete-user` - Removes users from Cognito User Pool
  - `list-users` - Lists all users in the pool
- **test-connection.sh** / **test-connection.ps1**: Tests WebSocket connection to cloud deployment
- **verify-deployment.sh** / **verify-deployment.ps1**: Validates prerequisites and CDK deployment

## Key Implementation Details

### Authentication Flow
1. **Admin Login**: Local app authenticates with Cognito User Pool
2. **JWT Token**: Receives authentication token
3. **Identity Pool**: Exchanges JWT for temporary AWS credentials
4. **Direct Access**: Local app calls AWS Transcribe/Translate directly

### Security Model
- **Cognito User Pool**: Secure admin authentication
- **Identity Pool**: Temporary AWS credentials (1 hour expiration)
- **IAM Roles**: Least-privilege access to required AWS services
- **Local Storage**: Encrypted credential storage in Electron app

### Cost Structure
- **Cognito User Pool**: Free tier covers typical usage
- **Cognito Identity Pool**: Free tier covers typical usage
- **No Server Costs**: No Lambda, API Gateway, or DynamoDB charges
- **Total Backend Cost**: ~$0/month for individual users

## File Structure

```
src/backend/
├── cdk/
│   ├── simplified-stack.ts    # Minimal Cognito + IAM infrastructure
│   ├── app.ts                # CDK app entry point
│   └── cdk.json              # CDK configuration
├── scripts/
│   ├── create-admin.sh       # Admin user creation
│   ├── change-password.sh    # Password management
│   ├── get-token.sh         # Token retrieval for testing
│   └── test-connection.sh   # Authentication validation
├── package.json             # Dependencies and scripts
└── README.md
```

## Testing

### Create Admin User
```bash
# Linux/macOS
./manage-auth.sh create-user admin@example.com <UserPoolId> <Region>

# Windows PowerShell
.\manage-auth.ps1 create-user admin@example.com <UserPoolId> <Region>
```

### Change Password (First Login)
```bash
# Linux/macOS
./manage-auth.sh change-password admin@example.com <UserPoolId> <ClientId>

# Windows PowerShell
.\manage-auth.ps1 change-password admin@example.com <UserPoolId> <ClientId>
```

### Get Authentication Token
```bash
# Linux/macOS
./manage-auth.sh get-token admin@example.com <UserPoolId> <ClientId>

# Windows PowerShell
.\manage-auth.ps1 get-token admin@example.com <UserPoolId> <ClientId>
```

### Test Deployment
```bash
# Linux/macOS
./verify-deployment.sh

# Windows PowerShell
.\verify-deployment.ps1
```

## Monitoring

Minimal monitoring includes:
- CloudWatch Logs for Cognito authentication events
- CloudWatch Metrics for Cognito usage
- No Lambda or API Gateway monitoring needed

## Security

- JWT token validation in local application
- IAM roles with least-privilege access
- Temporary AWS credentials (1-hour expiration)
- Encrypted local credential storage

## Migration from Server Architecture

### Removed Components ✅
- ❌ **API Gateway WebSocket**: No longer needed for local streaming
- ❌ **Lambda Functions**: Direct AWS SDK calls instead
- ❌ **DynamoDB Tables**: No session management needed
- ❌ **Complex IAM Policies**: Simplified to Transcribe/Translate only

### Retained Components ✅
- ✅ **Cognito User Pool**: Admin authentication
- ✅ **Cognito Identity Pool**: Direct AWS service access
- ✅ **IAM Roles**: Permissions for AWS services
- ✅ **Admin Scripts**: User management utilities

## Production Readiness

This minimal backend is **production-ready** for local applications with:
- ✅ Secure authentication infrastructure
- ✅ Direct AWS service access
- ✅ Cost-optimized (no server costs)
- ✅ Simple deployment and management
- ✅ Scalable authentication (supports multiple users)

Perfect for **local applications requiring authenticated AWS service access** without the complexity and cost of server infrastructure.
