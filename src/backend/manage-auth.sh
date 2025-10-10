#!/bin/bash

# Service Translate - Cognito Authentication Management
# Consolidated script for all auth operations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_error() { echo -e "${RED}❌ $1${NC}"; }
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_info() { echo "ℹ️  $1"; }

show_usage() {
    cat << EOF
Service Translate - Cognito Auth Management

Usage: ./manage-auth.sh <command> [options]

Commands:
  get-token <username> <pool-id> <client-id>
      Get JWT tokens for a user
      
  change-password <username> <pool-id> <client-id>
      Change user password (temporary to permanent)
      
  create-user <email> <pool-id> <region>
      Create a new Cognito user
      
  delete-user <username> <pool-id> <region>
      Delete a Cognito user
      
  list-users <pool-id> <region>
      List all users in the pool

Examples:
  ./manage-auth.sh get-token admin@example.com us-east-1_ABC123 xyz789
  ./manage-auth.sh change-password admin@example.com us-east-1_ABC123 xyz789
  ./manage-auth.sh create-user newuser@example.com us-east-1_ABC123 us-east-1

EOF
    exit 1
}

validate_password() {
    local pwd="$1"
    [ ${#pwd} -lt 8 ] && { print_error "Password must be at least 8 characters"; return 1; }
    echo "$pwd" | grep -q '[A-Z]' || { print_error "Password must contain uppercase letter"; return 1; }
    echo "$pwd" | grep -q '[a-z]' || { print_error "Password must contain lowercase letter"; return 1; }
    echo "$pwd" | grep -q '[0-9]' || { print_error "Password must contain number"; return 1; }
    return 0
}

cmd_get_token() {
    local username=$1 pool_id=$2 client_id=$3
    
    read -s -p "Enter password for $username: " password
    echo ""
    
    local response=$(aws cognito-idp initiate-auth \
        --auth-flow USER_PASSWORD_AUTH \
        --client-id "$client_id" \
        --auth-parameters USERNAME="$username",PASSWORD="$password" \
        --output json 2>&1)
    
    if [ $? -eq 0 ]; then
        local access_token=$(echo "$response" | jq -r '.AuthenticationResult.AccessToken')
        local id_token=$(echo "$response" | jq -r '.AuthenticationResult.IdToken')
        local refresh_token=$(echo "$response" | jq -r '.AuthenticationResult.RefreshToken')
        local expires_in=$(echo "$response" | jq -r '.AuthenticationResult.ExpiresIn')
        
        print_success "Authentication successful!"
        echo ""
        echo "Access Token: $access_token"
        echo "ID Token: $id_token"
        echo "Refresh Token: $refresh_token"
        echo "Expires in: ${expires_in}s"
    else
        print_error "Authentication failed"
        echo "$response" | jq -r '.message // .'
        exit 1
    fi
}

cmd_change_password() {
    local username=$1 pool_id=$2 client_id=$3
    
    read -s -p "Enter temporary password: " temp_pwd
    echo ""
    read -s -p "Enter new password: " new_pwd
    echo ""
    read -s -p "Confirm new password: " confirm_pwd
    echo ""
    
    [ "$new_pwd" != "$confirm_pwd" ] && { print_error "Passwords don't match"; exit 1; }
    validate_password "$new_pwd" || exit 1
    
    local session=$(aws cognito-idp initiate-auth \
        --auth-flow USER_PASSWORD_AUTH \
        --client-id "$client_id" \
        --auth-parameters USERNAME="$username",PASSWORD="$temp_pwd" \
        --query 'Session' --output text 2>&1)
    
    [ "$session" == "None" ] && { print_error "Failed to authenticate"; exit 1; }
    
    aws cognito-idp respond-to-auth-challenge \
        --client-id "$client_id" \
        --challenge-name NEW_PASSWORD_REQUIRED \
        --session "$session" \
        --challenge-responses USERNAME="$username",NEW_PASSWORD="$new_pwd" \
        &> /dev/null
    
    [ $? -eq 0 ] && print_success "Password changed!" || { print_error "Failed to change password"; exit 1; }
}

cmd_create_user() {
    local email=$1 pool_id=$2 region=$3
    
    read -s -p "Enter password for new user: " password
    echo ""
    read -s -p "Confirm password: " confirm_pwd
    echo ""
    
    [ "$password" != "$confirm_pwd" ] && { print_error "Passwords don't match"; exit 1; }
    validate_password "$password" || exit 1
    
    local temp_pwd=$(openssl rand -base64 12)
    
    aws cognito-idp admin-create-user \
        --user-pool-id "$pool_id" \
        --username "$email" \
        --user-attributes Name=email,Value="$email",Name=email_verified,Value=true \
        --temporary-password "$temp_pwd" \
        --message-action SUPPRESS \
        --region "$region" &> /dev/null
    
    echo "$password" | aws cognito-idp admin-set-user-password \
        --user-pool-id "$pool_id" \
        --username "$email" \
        --password "$(cat)" \
        --permanent \
        --region "$region" &> /dev/null
    
    [ $? -eq 0 ] && print_success "User created: $email" || { print_error "Failed to create user"; exit 1; }
}

cmd_delete_user() {
    local username=$1 pool_id=$2 region=$3
    
    read -p "Delete user $username? (yes/NO): " confirm
    [ "$confirm" != "yes" ] && { print_info "Cancelled"; exit 0; }
    
    aws cognito-idp admin-delete-user \
        --user-pool-id "$pool_id" \
        --username "$username" \
        --region "$region" &> /dev/null
    
    [ $? -eq 0 ] && print_success "User deleted: $username" || { print_error "Failed to delete user"; exit 1; }
}

cmd_list_users() {
    local pool_id=$1 region=$2
    
    aws cognito-idp list-users \
        --user-pool-id "$pool_id" \
        --region "$region" \
        --query 'Users[*].[Username,UserStatus,Enabled]' \
        --output table
}

# Main
[ $# -lt 1 ] && show_usage

COMMAND=$1
shift

case "$COMMAND" in
    get-token)
        [ $# -ne 3 ] && show_usage
        cmd_get_token "$@"
        ;;
    change-password)
        [ $# -ne 3 ] && show_usage
        cmd_change_password "$@"
        ;;
    create-user)
        [ $# -ne 3 ] && show_usage
        cmd_create_user "$@"
        ;;
    delete-user)
        [ $# -ne 3 ] && show_usage
        cmd_delete_user "$@"
        ;;
    list-users)
        [ $# -ne 2 ] && show_usage
        cmd_list_users "$@"
        ;;
    *)
        print_error "Unknown command: $COMMAND"
        show_usage
        ;;
esac
