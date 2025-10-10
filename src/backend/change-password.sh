#!/bin/bash

# Change Cognito password (temporary to permanent)
# Usage: ./change-password.sh <username> <user-pool-id> <client-id>

set -e

USERNAME=$1
USER_POOL_ID=$2
CLIENT_ID=$3

if [ -z "$USERNAME" ] || [ -z "$USER_POOL_ID" ] || [ -z "$CLIENT_ID" ]; then
    echo "Usage: ./change-password.sh <username> <user-pool-id> <client-id>"
    echo ""
    echo "Passwords will be read securely from stdin"
    exit 1
fi

# Validate password complexity
validate_password() {
    local pwd="$1"
    
    if [ ${#pwd} -lt 8 ]; then
        echo "❌ Password must be at least 8 characters"
        return 1
    fi
    
    if ! echo "$pwd" | grep -q '[A-Z]'; then
        echo "❌ Password must contain at least one uppercase letter"
        return 1
    fi
    
    if ! echo "$pwd" | grep -q '[a-z]'; then
        echo "❌ Password must contain at least one lowercase letter"
        return 1
    fi
    
    if ! echo "$pwd" | grep -q '[0-9]'; then
        echo "❌ Password must contain at least one number"
        return 1
    fi
    
    return 0
}

# Read passwords securely
read -s -p "Enter temporary password: " TEMP_PASSWORD
echo ""
read -s -p "Enter new password: " NEW_PASSWORD
echo ""
read -s -p "Confirm new password: " NEW_PASSWORD_CONFIRM
echo ""

if [ -z "$TEMP_PASSWORD" ] || [ -z "$NEW_PASSWORD" ]; then
    echo "❌ Passwords cannot be empty"
    exit 1
fi

if [ "$NEW_PASSWORD" != "$NEW_PASSWORD_CONFIRM" ]; then
    echo "❌ New passwords do not match"
    exit 1
fi

if ! validate_password "$NEW_PASSWORD"; then
    exit 1
fi

# First login with temp password
echo "Authenticating with temporary password..."
SESSION=$(aws cognito-idp initiate-auth \
    --auth-flow USER_PASSWORD_AUTH \
    --client-id "$CLIENT_ID" \
    --auth-parameters USERNAME="$USERNAME",PASSWORD="$TEMP_PASSWORD" \
    --query 'Session' \
    --output text 2>&1)

if [ "$SESSION" == "None" ] || [ -z "$SESSION" ] || [[ "$SESSION" == *"error"* ]]; then
    echo "❌ Failed to authenticate with temporary password"
    echo "Error: $SESSION"
    exit 1
fi

# Respond to NEW_PASSWORD_REQUIRED challenge
echo "Setting new password..."
RESULT=$(aws cognito-idp respond-to-auth-challenge \
    --client-id "$CLIENT_ID" \
    --challenge-name NEW_PASSWORD_REQUIRED \
    --session "$SESSION" \
    --challenge-responses USERNAME="$USERNAME",NEW_PASSWORD="$NEW_PASSWORD" 2>&1)

if [ $? -eq 0 ]; then
    echo "✅ Password changed successfully!"
    echo ""
    echo "You can now login with your new password"
else
    echo "❌ Failed to change password"
    echo "Error: $RESULT"
    exit 1
fi
