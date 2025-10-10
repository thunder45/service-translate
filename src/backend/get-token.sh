#!/bin/bash

# Get JWT token from Cognito
# Usage: ./get-token.sh <username> <user-pool-id> <client-id>

USERNAME=$1
USER_POOL_ID=$2
CLIENT_ID=$3

if [ -z "$USERNAME" ] || [ -z "$USER_POOL_ID" ] || [ -z "$CLIENT_ID" ]; then
    echo "Usage: ./get-token.sh <username> <user-pool-id> <client-id>"
    echo ""
    echo "Get USER_POOL_ID and CLIENT_ID from CDK deployment outputs"
    echo "Password will be read securely from stdin"
    exit 1
fi

# Read password securely
read -s -p "Enter password for $USERNAME: " PASSWORD
echo ""

if [ -z "$PASSWORD" ]; then
    echo "❌ Password cannot be empty"
    exit 1
fi

# Authenticate and get tokens
RESPONSE=$(aws cognito-idp initiate-auth \
    --auth-flow USER_PASSWORD_AUTH \
    --client-id "$CLIENT_ID" \
    --auth-parameters USERNAME="$USERNAME",PASSWORD="$PASSWORD" \
    --output json 2>&1)

if [ $? -eq 0 ]; then
    ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.AuthenticationResult.AccessToken')
    ID_TOKEN=$(echo "$RESPONSE" | jq -r '.AuthenticationResult.IdToken')
    REFRESH_TOKEN=$(echo "$RESPONSE" | jq -r '.AuthenticationResult.RefreshToken')
    EXPIRES_IN=$(echo "$RESPONSE" | jq -r '.AuthenticationResult.ExpiresIn')
    
    # Calculate expiry time
    EXPIRY_TIME=$(date -d "+${EXPIRES_IN} seconds" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -v "+${EXPIRES_IN}S" '+%Y-%m-%d %H:%M:%S' 2>/dev/null)
    
    echo "✅ Authentication successful!"
    echo ""
    echo "Access Token:"
    echo "$ACCESS_TOKEN"
    echo ""
    echo "ID Token:"
    echo "$ID_TOKEN"
    echo ""
    echo "Refresh Token:"
    echo "$REFRESH_TOKEN"
    echo ""
    echo "Expires in: ${EXPIRES_IN} seconds (at $EXPIRY_TIME)"
    echo ""
    echo "To save tokens to file:"
    echo "  ./get-token.sh $USERNAME $USER_POOL_ID $CLIENT_ID > tokens.txt"
else
    echo "❌ Authentication failed"
    echo "$RESPONSE" | jq -r '.message // .'
    exit 1
fi
