#!/bin/bash

if [ $# -ne 2 ]; then
    echo "Usage: $0 <email> <user-pool-id>"
    echo "Example: $0 admin@example.com us-east-1_iwEEqraYS"
    exit 1
fi

EMAIL=$1
USER_POOL_ID=$2

echo "Creating admin user: $EMAIL"

# Create user
aws cognito-idp admin-create-user \
    --user-pool-id $USER_POOL_ID \
    --username $EMAIL \
    --user-attributes Name=email,Value=$EMAIL Name=email_verified,Value=true \
    --temporary-password TempPass123! \
    --message-action SUPPRESS

echo "User created. Temporary password: TempPass123!"
echo "Please change password on first login."
