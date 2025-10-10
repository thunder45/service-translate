#!/bin/bash

# Service Translate - Environment Validation Script
# Validates .env files for required configuration

set -e

echo "Service Translate - Environment Validation"
echo "=========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

print_error() {
    echo -e "${RED}❌ $1${NC}"
    ERRORS=$((ERRORS + 1))
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    WARNINGS=$((WARNINGS + 1))
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Validate WebSocket Server .env
validate_websocket_env() {
    local env_file="src/websocket-server/.env"
    
    echo "Validating WebSocket Server configuration..."
    
    if [ ! -f "$env_file" ]; then
        print_error "$env_file not found"
        echo "  Run: ./setup-unified-auth.sh"
        return
    fi
    
    # Source the file
    set -a
    source "$env_file" 2>/dev/null || {
        print_error "Failed to load $env_file"
        return
    }
    set +a
    
    # Check required Cognito variables
    [ -z "$COGNITO_REGION" ] && print_error "COGNITO_REGION not set" || print_success "COGNITO_REGION: $COGNITO_REGION"
    [ -z "$COGNITO_USER_POOL_ID" ] && print_error "COGNITO_USER_POOL_ID not set" || print_success "COGNITO_USER_POOL_ID: $COGNITO_USER_POOL_ID"
    [ -z "$COGNITO_CLIENT_ID" ] && print_error "COGNITO_CLIENT_ID not set" || print_success "COGNITO_CLIENT_ID: $COGNITO_CLIENT_ID"
    
    # Check deprecated variables
    [ -n "$ADMIN_USERNAME" ] && print_warning "ADMIN_USERNAME is deprecated (remove from .env)"
    [ -n "$ADMIN_PASSWORD" ] && print_warning "ADMIN_PASSWORD is deprecated (remove from .env)"
    [ -n "$JWT_SECRET" ] && print_warning "JWT_SECRET is deprecated (remove from .env)"
    
    # Validate format
    if [ -n "$COGNITO_USER_POOL_ID" ]; then
        if [[ ! "$COGNITO_USER_POOL_ID" =~ ^[a-z]+-[a-z]+-[0-9]+_[a-zA-Z0-9]+$ ]]; then
            print_warning "COGNITO_USER_POOL_ID format looks incorrect"
        fi
    fi
    
    # Validate AWS resources exist (if AWS CLI available)
    if command -v aws &> /dev/null && [ -n "$COGNITO_USER_POOL_ID" ] && [ -n "$COGNITO_REGION" ]; then
        echo ""
        echo "Validating AWS resources..."
        
        if aws cognito-idp describe-user-pool \
            --user-pool-id "$COGNITO_USER_POOL_ID" \
            --region "$COGNITO_REGION" &> /dev/null; then
            print_success "Cognito User Pool exists and is accessible"
        else
            print_error "Cognito User Pool not found or not accessible"
            echo "  Check: AWS credentials, region, and User Pool ID"
        fi
        
        if aws cognito-idp describe-user-pool-client \
            --user-pool-id "$COGNITO_USER_POOL_ID" \
            --client-id "$COGNITO_CLIENT_ID" \
            --region "$COGNITO_REGION" &> /dev/null; then
            print_success "Cognito Client exists and is accessible"
        else
            print_error "Cognito Client not found or not accessible"
        fi
    else
        print_warning "Skipping AWS resource validation (AWS CLI not available or credentials not set)"
    fi
    
    echo ""
}

# Validate Capture App config (if exists)
validate_capture_config() {
    local config_file="src/capture/src/config.ts"
    
    echo "Validating Capture App configuration..."
    
    if [ ! -f "$config_file" ]; then
        print_warning "$config_file not found"
        return
    fi
    
    # Check if Cognito config exists in TypeScript
    if grep -q "userPoolId" "$config_file" && grep -q "clientId" "$config_file"; then
        print_success "Cognito configuration found in config.ts"
    else
        print_warning "Cognito configuration may be missing in config.ts"
    fi
    
    echo ""
}

# Main validation
main() {
    validate_websocket_env
    validate_capture_config
    
    echo "=========================================="
    if [ $ERRORS -gt 0 ]; then
        echo -e "${RED}Validation failed: $ERRORS error(s), $WARNINGS warning(s)${NC}"
        exit 1
    elif [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}Validation passed with $WARNINGS warning(s)${NC}"
        exit 0
    else
        echo -e "${GREEN}✅ All validations passed!${NC}"
        exit 0
    fi
}

main
