# Authentication Management Quick Reference

## Unified Auth Management Script

All Cognito authentication operations are now consolidated in `manage-auth.sh`.

### Get JWT Tokens
```bash
./manage-auth.sh get-token <username> <pool-id> <client-id>
```
**Example**:
```bash
./manage-auth.sh get-token admin@example.com us-east-1_ABC123 xyz789client
```
**Output**: Access token, ID token, refresh token, and expiry time

---

### Change Password
```bash
./manage-auth.sh change-password <username> <pool-id> <client-id>
```
**Example**:
```bash
./manage-auth.sh change-password admin@example.com us-east-1_ABC123 xyz789client
```
**Prompts**: Temporary password, new password, confirmation

**Password Requirements**:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

---

### Create User
```bash
./manage-auth.sh create-user <email> <pool-id> <region>
```
**Example**:
```bash
./manage-auth.sh create-user newuser@example.com us-east-1_ABC123 us-east-1
```
**Prompts**: Password and confirmation

**Notes**:
- User is created with email verified
- Password is set as permanent (no temporary password flow)
- Password never appears in process list or logs

---

### Delete User
```bash
./manage-auth.sh delete-user <username> <pool-id> <region>
```
**Example**:
```bash
./manage-auth.sh delete-user olduser@example.com us-east-1_ABC123 us-east-1
```
**Prompts**: Confirmation (must type "yes")

---

### List Users
```bash
./manage-auth.sh list-users <pool-id> <region>
```
**Example**:
```bash
./manage-auth.sh list-users us-east-1_ABC123 us-east-1
```
**Output**: Table with username, status, and enabled state

---

## Legacy Scripts (Still Available)

### get-token.sh
```bash
./get-token.sh <username> <pool-id> <client-id>
```
**Status**: ✅ Still works, but prefer `manage-auth.sh get-token`

### change-password.sh
```bash
./change-password.sh <username> <pool-id> <client-id>
```
**Status**: ✅ Still works, but prefer `manage-auth.sh change-password`

---

## Getting Pool ID and Client ID

### From CDK Deployment Output:
```bash
cd src/backend
npm run deploy
# Look for outputs:
# - UserPoolId: us-east-1_ABC123
# - UserPoolClientId: xyz789client
```

### From AWS Console:
1. Go to AWS Console → Cognito → User Pools
2. Select your pool
3. Copy User Pool ID from overview
4. Go to App Integration → App clients
5. Copy Client ID

### From CloudFormation:
```bash
aws cloudformation describe-stacks \
  --stack-name ServiceTranslateStack \
  --query 'Stacks[0].Outputs'
```

---

## Security Best Practices

### ✅ DO:
- Use `manage-auth.sh` for all operations
- Store tokens securely (encrypted files or environment variables)
- Rotate passwords regularly
- Use strong passwords (12+ characters recommended)

### ❌ DON'T:
- Pass passwords as command-line arguments
- Store passwords in plain text files
- Share tokens via insecure channels
- Commit tokens to version control

---

## Troubleshooting

### "Authentication failed"
- Verify username and password are correct
- Check if user exists: `./manage-auth.sh list-users <pool-id> <region>`
- Verify user is enabled (not disabled)

### "User Pool not found"
- Verify Pool ID format: `us-east-1_ABC123`
- Check AWS region matches Pool ID region
- Verify AWS credentials have access

### "Password does not meet requirements"
- Ensure password has:
  - At least 8 characters
  - One uppercase letter
  - One lowercase letter
  - One number

### "Session expired"
- Tokens expire after 1 hour by default
- Use refresh token to get new access token
- Or re-authenticate with username/password

---

## Examples

### Complete Setup Flow:
```bash
# 1. Deploy infrastructure
cd src/backend
npm run deploy

# 2. Note the outputs (Pool ID and Client ID)

# 3. Create admin user
cd ../..
./src/backend/manage-auth.sh create-user admin@example.com us-east-1_ABC123 us-east-1

# 4. Get tokens
./src/backend/manage-auth.sh get-token admin@example.com us-east-1_ABC123 xyz789client

# 5. Use tokens in your application
```

### Rotating User Password:
```bash
# Admin sets new temporary password
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_ABC123 \
  --username user@example.com \
  --password TempPass123! \
  --region us-east-1

# User changes to permanent password
./manage-auth.sh change-password user@example.com us-east-1_ABC123 xyz789client
```

---

## Integration with WebSocket Server

The WebSocket server uses these same Cognito credentials:

```bash
# 1. Setup server with Cognito config
./setup-unified-auth.sh

# 2. Start server
cd src/websocket-server
npm start

# 3. Capture app authenticates with Cognito
# Uses same Pool ID and Client ID
```

All users in the Cognito User Pool have admin access to the WebSocket server.
