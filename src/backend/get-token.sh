#!/bin/bash

# Get JWT token from Cognito
# Usage: ./get-token.sh <username> <password> <user-pool-id> <client-id>

USERNAME=$1
PASSWORD=$2
USER_POOL_ID=$3
CLIENT_ID=$4

if [ -z "$USERNAME" ] || [ -z "$PASSWORD" ] || [ -z "$USER_POOL_ID" ] || [ -z "$CLIENT_ID" ]; then
    echo "Usage: ./get-token.sh <username> <password> <user-pool-id> <client-id>"
    echo ""
    echo "Get USER_POOL_ID and CLIENT_ID from CDK deployment outputs"
    exit 1
fi

# Authenticate and get tokens
RESPONSE=$(aws cognito-idp initiate-auth \
    --auth-flow USER_PASSWORD_AUTH \
    --client-id "$CLIENT_ID" \
    --auth-parameters USERNAME="$USERNAME",PASSWORD="$PASSWORD" \
    --query 'AuthenticationResult.AccessToken' \
    --output text)

if [ $? -eq 0 ]; then
    echo "✅ JWT Token:"
    echo "$RESPONSE"
else
    echo "❌ Authentication failed"
    exit 1
fi
