#!/bin/bash

# Admin Setup Script for Service Translate WebSocket Server
# This script helps set up the initial admin credentials

set -e

echo "=========================================="
echo "Service Translate - Admin Setup"
echo "=========================================="
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "Error: .env file not found!"
    echo "Please copy .env.example to .env first:"
    echo "  cp .env.example .env"
    exit 1
fi

# Check if admin password is already set
CURRENT_PASSWORD=$(grep "^ADMIN_PASSWORD=" .env | cut -d '=' -f2)

if [ -n "$CURRENT_PASSWORD" ]; then
    echo "Admin password is already configured."
    read -p "Do you want to change it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 0
    fi
fi

# Prompt for admin username
echo ""
echo "Enter admin username (default: admin):"
read -r ADMIN_USERNAME
ADMIN_USERNAME=${ADMIN_USERNAME:-admin}

# Prompt for admin password
echo ""
echo "Enter admin password (minimum 8 characters):"
read -s ADMIN_PASSWORD
echo ""
echo "Confirm admin password:"
read -s ADMIN_PASSWORD_CONFIRM
echo ""

# Validate password
if [ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD_CONFIRM" ]; then
    echo "Error: Passwords do not match!"
    exit 1
fi

if [ ${#ADMIN_PASSWORD} -lt 8 ]; then
    echo "Error: Password must be at least 8 characters long!"
    exit 1
fi

# Update .env file
echo ""
echo "Updating .env file..."

# Update admin username
if grep -q "^ADMIN_USERNAME=" .env; then
    sed -i.bak "s/^ADMIN_USERNAME=.*/ADMIN_USERNAME=$ADMIN_USERNAME/" .env
else
    echo "ADMIN_USERNAME=$ADMIN_USERNAME" >> .env
fi

# Update admin password
if grep -q "^ADMIN_PASSWORD=" .env; then
    sed -i.bak "s/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=$ADMIN_PASSWORD/" .env
else
    echo "ADMIN_PASSWORD=$ADMIN_PASSWORD" >> .env
fi

# Generate JWT secret if not set
JWT_SECRET=$(grep "^JWT_SECRET=" .env | cut -d '=' -f2)
if [ -z "$JWT_SECRET" ]; then
    echo "Generating JWT secret..."
    JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
    if grep -q "^JWT_SECRET=" .env; then
        sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
    else
        echo "JWT_SECRET=$JWT_SECRET" >> .env
    fi
fi

# Create admin identities directory
ADMIN_DIR=$(grep "^ADMIN_IDENTITIES_DIR=" .env | cut -d '=' -f2)
ADMIN_DIR=${ADMIN_DIR:-./admin-identities}
mkdir -p "$ADMIN_DIR"
echo "Created admin identities directory: $ADMIN_DIR"

# Create sessions directory
SESSION_DIR=$(grep "^SESSION_PERSISTENCE_DIR=" .env | cut -d '=' -f2)
SESSION_DIR=${SESSION_DIR:-./sessions}
mkdir -p "$SESSION_DIR"
echo "Created sessions directory: $SESSION_DIR"

# Clean up backup file
rm -f .env.bak

echo ""
echo "=========================================="
echo "Admin setup completed successfully!"
echo "=========================================="
echo ""
echo "Admin Username: $ADMIN_USERNAME"
echo "Admin Password: ********"
echo "JWT Secret: Generated"
echo ""
echo "IMPORTANT: Keep your .env file secure!"
echo "Do not commit it to version control."
echo ""
echo "You can now start the WebSocket server:"
echo "  npm start"
echo ""
