#!/bin/bash

# Change temporary password
# Usage: ./change-password.sh <username> <temp-password> <new-password> <user-pool-id> <client-id>

USERNAME=$1
TEMP_PASSWORD=$2
NEW_PASSWORD=$3
USER_POOL_ID=$4
CLIENT_ID=$5

if [ -z "$USERNAME" ] || [ -z "$TEMP_PASSWORD" ] || [ -z "$NEW_PASSWORD" ] || [ -z "$USER_POOL_ID" ] || [ -z "$CLIENT_ID" ]; then
    echo "Usage: ./change-password.sh <username> <temp-password> <new-password> <user-pool-id> <client-id>"
    exit 1
fi

# First login with temp password
SESSION=$(aws cognito-idp initiate-auth \
    --auth-flow USER_PASSWORD_AUTH \
    --client-id "$CLIENT_ID" \
    --auth-parameters USERNAME="$USERNAME",PASSWORD="$TEMP_PASSWORD" \
    --query 'Session' \
    --output text)

if [ "$SESSION" == "None" ]; then
    echo "❌ Failed to authenticate with temporary password"
    exit 1
fi

# Respond to NEW_PASSWORD_REQUIRED challenge
aws cognito-idp respond-to-auth-challenge \
    --client-id "$CLIENT_ID" \
    --challenge-name NEW_PASSWORD_REQUIRED \
    --session "$SESSION" \
    --challenge-responses USERNAME="$USERNAME",NEW_PASSWORD="$NEW_PASSWORD"

if [ $? -eq 0 ]; then
    echo "✅ Password changed successfully!"
    echo ""
    echo "Now get your token:"
    echo "   ./get-token.sh $USERNAME $NEW_PASSWORD $USER_POOL_ID $CLIENT_ID"
else
    echo "❌ Failed to change password"
    exit 1
fi
