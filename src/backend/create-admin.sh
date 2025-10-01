#!/bin/bash

# Create admin user in Cognito
# Usage: ./create-admin.sh <email> <user-pool-id>

EMAIL=$1
USER_POOL_ID=$2

if [ -z "$EMAIL" ] || [ -z "$USER_POOL_ID" ]; then
    echo "Usage: ./create-admin.sh <email> <user-pool-id>"
    echo ""
    echo "Get USER_POOL_ID from CDK deployment outputs"
    exit 1
fi

TEMP_PASSWORD="TempPass123!"

echo "Creating admin user: $EMAIL"
aws cognito-idp admin-create-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "$EMAIL" \
    --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
    --temporary-password "$TEMP_PASSWORD" \
    --message-action SUPPRESS

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ User created successfully!"
    echo ""
    echo "Temporary password: $TEMP_PASSWORD"
    echo ""
    echo "⚠️  You must change the password on first login:"
    echo "   ./change-password.sh $EMAIL $TEMP_PASSWORD <new-password> $USER_POOL_ID <client-id>"
else
    echo "❌ Failed to create user"
    exit 1
fi
