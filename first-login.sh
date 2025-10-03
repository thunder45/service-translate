#!/bin/bash

if [ $# -ne 3 ]; then
    echo "Usage: $0 <email> <user-pool-client-id> <new-password>"
    echo "Example: $0 admin@example.com 4avro42msdf7ssuaqslsmfd790 MyNewPassword123!"
    exit 1
fi

EMAIL=$1
CLIENT_ID=$2
NEW_PASSWORD=$3
TEMP_PASSWORD="TempPass123!"
USER_POOL_ID="us-east-1_WoaXmyQLQ"

echo "Performing first-time login and password change for: $EMAIL"

# Get the actual username (UUID) from Cognito
echo "Step 1: Getting user details..."
USER_INFO=$(aws cognito-idp admin-get-user \
    --user-pool-id $USER_POOL_ID \
    --username $EMAIL \
    --output json 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "❌ User not found: $EMAIL"
    exit 1
fi

USERNAME=$(echo $USER_INFO | jq -r '.Username')
USER_STATUS=$(echo $USER_INFO | jq -r '.UserStatus')

echo "✅ Found user: $USERNAME (Status: $USER_STATUS)"

if [ "$USER_STATUS" != "FORCE_CHANGE_PASSWORD" ]; then
    echo "❌ User status is $USER_STATUS, not FORCE_CHANGE_PASSWORD"
    echo "User may already have a permanent password or need different handling"
    exit 1
fi

# First login with temporary password using the actual username
echo "Step 2: Authenticating with temporary password..."
AUTH_RESPONSE=$(aws cognito-idp admin-initiate-auth \
    --user-pool-id $USER_POOL_ID \
    --client-id $CLIENT_ID \
    --auth-flow ADMIN_NO_SRP_AUTH \
    --auth-parameters USERNAME=$USERNAME,PASSWORD=$TEMP_PASSWORD \
    --output json 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "❌ Failed to authenticate with temporary password"
    echo "Trying with email as username..."
    AUTH_RESPONSE=$(aws cognito-idp admin-initiate-auth \
        --user-pool-id $USER_POOL_ID \
        --client-id $CLIENT_ID \
        --auth-flow ADMIN_NO_SRP_AUTH \
        --auth-parameters USERNAME=$EMAIL,PASSWORD=$TEMP_PASSWORD \
        --output json 2>/dev/null)
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to authenticate with both username and email"
        exit 1
    fi
fi

# Extract session token
SESSION=$(echo $AUTH_RESPONSE | jq -r '.Session // empty')

if [ -z "$SESSION" ]; then
    echo "❌ No session token received"
    exit 1
fi

echo "✅ Temporary authentication successful"

# Set permanent password
echo "Step 3: Setting new permanent password..."
aws cognito-idp admin-respond-to-auth-challenge \
    --user-pool-id $USER_POOL_ID \
    --client-id $CLIENT_ID \
    --challenge-name NEW_PASSWORD_REQUIRED \
    --challenge-responses USERNAME=$USERNAME,NEW_PASSWORD=$NEW_PASSWORD \
    --session $SESSION \
    --output json > /dev/null

if [ $? -eq 0 ]; then
    echo "✅ Password changed successfully!"
    echo "You can now login with:"
    echo "  Email: $EMAIL"
    echo "  Password: $NEW_PASSWORD"
else
    echo "❌ Failed to change password"
    exit 1
fi
