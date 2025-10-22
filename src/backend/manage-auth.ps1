#!/usr/bin/env pwsh

# Service Translate - Cognito Authentication Management
# PowerShell version - consolidated script for all auth operations

param(
    [Parameter(Mandatory=$true, Position=0)]
    [ValidateSet("get-token", "change-password", "create-user", "delete-user", "list-users")]
    [string]$Command,
    
    [Parameter(Position=1)]
    [string]$Username,
    
    [Parameter(Position=2)]
    [string]$PoolIdOrRegion,
    
    [Parameter(Position=3)]
    [string]$ClientIdOrRegion,
    
    [Parameter(Position=4)]
    [string]$Region
)

$ErrorActionPreference = "Stop"

# Color output functions
function Write-Error-Custom {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Cyan
}

function Show-Usage {
    Write-Host @"
Service Translate - Cognito Auth Management (PowerShell)

Usage: .\manage-auth.ps1 <command> [options]

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
  .\manage-auth.ps1 get-token admin@example.com us-east-1_ABC123 xyz789
  .\manage-auth.ps1 change-password admin@example.com us-east-1_ABC123 xyz789
  .\manage-auth.ps1 create-user newuser@example.com us-east-1_ABC123 us-east-1

"@
    exit 1
}

function Test-PasswordComplexity {
    param([string]$Password)
    
    if ($Password.Length -lt 8) {
        Write-Error-Custom "Password must be at least 8 characters"
        return $false
    }
    
    if (-not ($Password -cmatch '[A-Z]')) {
        Write-Error-Custom "Password must contain uppercase letter"
        return $false
    }
    
    if (-not ($Password -cmatch '[a-z]')) {
        Write-Error-Custom "Password must contain lowercase letter"
        return $false
    }
    
    if (-not ($Password -cmatch '[0-9]')) {
        Write-Error-Custom "Password must contain number"
        return $false
    }
    
    return $true
}

function Get-Token {
    param([string]$Username, [string]$PoolId, [string]$ClientId)
    
    $SecurePassword = Read-Host "Enter password for $Username" -AsSecureString
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword))
    
    try {
        $response = aws cognito-idp initiate-auth `
            --auth-flow USER_PASSWORD_AUTH `
            --client-id $ClientId `
            --auth-parameters "USERNAME=$Username,PASSWORD=$Password" `
            --output json | ConvertFrom-Json
        
        Write-Success "Authentication successful!"
        Write-Host ""
        Write-Host "Access Token: $($response.AuthenticationResult.AccessToken)"
        Write-Host "ID Token: $($response.AuthenticationResult.IdToken)"
        Write-Host "Refresh Token: $($response.AuthenticationResult.RefreshToken)"
        Write-Host "Expires in: $($response.AuthenticationResult.ExpiresIn)s"
    }
    catch {
        Write-Error-Custom "Authentication failed"
        Write-Host $_.Exception.Message
        exit 1
    }
    finally {
        # Clear password from memory
        $Password = $null
        [System.GC]::Collect()
    }
}

function Set-UserPassword {
    param([string]$Username, [string]$PoolId, [string]$ClientId)
    
    $SecureTempPassword = Read-Host "Enter temporary password" -AsSecureString
    $TempPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureTempPassword))
    
    $SecureNewPassword = Read-Host "Enter new password" -AsSecureString
    $NewPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureNewPassword))
    
    $SecureConfirmPassword = Read-Host "Confirm new password" -AsSecureString
    $ConfirmPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureConfirmPassword))
    
    try {
        if ($NewPassword -ne $ConfirmPassword) {
            Write-Error-Custom "Passwords don't match"
            return
        }
        
        if (-not (Test-PasswordComplexity $NewPassword)) {
            return
        }
        
        $sessionResponse = aws cognito-idp initiate-auth `
            --auth-flow USER_PASSWORD_AUTH `
            --client-id $ClientId `
            --auth-parameters "USERNAME=$Username,PASSWORD=$TempPassword" `
            --query 'Session' --output text
        
        if ($sessionResponse -eq "None") {
            Write-Error-Custom "Failed to authenticate"
            return
        }
        
        aws cognito-idp respond-to-auth-challenge `
            --client-id $ClientId `
            --challenge-name NEW_PASSWORD_REQUIRED `
            --session $sessionResponse `
            --challenge-responses "USERNAME=$Username,NEW_PASSWORD=$NewPassword" | Out-Null
        
        Write-Success "Password changed!"
    }
    catch {
        Write-Error-Custom "Failed to change password"
        Write-Host $_.Exception.Message
    }
    finally {
        # Clear passwords from memory
        $TempPassword = $null
        $NewPassword = $null
        $ConfirmPassword = $null
        [System.GC]::Collect()
    }
}

function New-CognitoUser {
    param([string]$Email, [string]$PoolId, [string]$Region)
    
    $SecurePassword = Read-Host "Enter password for new user" -AsSecureString
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword))
    
    $SecureConfirmPassword = Read-Host "Confirm password" -AsSecureString
    $ConfirmPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureConfirmPassword))
    
    try {
        if ($Password -ne $ConfirmPassword) {
            Write-Error-Custom "Passwords don't match"
            return
        }
        
        if (-not (Test-PasswordComplexity $Password)) {
            return
        }
        
        # Generate temporary password
        $TempPassword = [System.Web.Security.Membership]::GeneratePassword(12, 3)
        
        # Create user with temporary password
        aws cognito-idp admin-create-user `
            --user-pool-id $PoolId `
            --username $Email `
            --user-attributes "Name=email,Value=$Email" "Name=email_verified,Value=true" `
            --temporary-password $TempPassword `
            --message-action SUPPRESS `
            --region $Region | Out-Null
        
        # Set permanent password
        $Password | aws cognito-idp admin-set-user-password `
            --user-pool-id $PoolId `
            --username $Email `
            --password $Password `
            --permanent `
            --region $Region | Out-Null
        
        Write-Success "User created: $Email"
    }
    catch {
        Write-Error-Custom "Failed to create user"
        Write-Host $_.Exception.Message
    }
    finally {
        # Clear passwords from memory
        $Password = $null
        $ConfirmPassword = $null
        $TempPassword = $null
        [System.GC]::Collect()
    }
}

function Remove-CognitoUser {
    param([string]$Username, [string]$PoolId, [string]$Region)
    
    $confirm = Read-Host "Delete user $Username? (yes/NO)"
    if ($confirm -ne "yes") {
        Write-Info "Cancelled"
        return
    }
    
    try {
        aws cognito-idp admin-delete-user `
            --user-pool-id $PoolId `
            --username $Username `
            --region $Region | Out-Null
        
        Write-Success "User deleted: $Username"
    }
    catch {
        Write-Error-Custom "Failed to delete user"
        Write-Host $_.Exception.Message
    }
}

function Get-CognitoUsers {
    param([string]$PoolId, [string]$Region)
    
    try {
        aws cognito-idp list-users `
            --user-pool-id $PoolId `
            --region $Region `
            --query 'Users[*].[Username,UserStatus,Enabled]' `
            --output table
    }
    catch {
        Write-Error-Custom "Failed to list users"
        Write-Host $_.Exception.Message
    }
}

# Main script logic
if (-not $Command) {
    Show-Usage
}

# Load System.Web for password generation
Add-Type -AssemblyName System.Web

switch ($Command) {
    "get-token" {
        if (-not $Username -or -not $PoolIdOrRegion -or -not $ClientIdOrRegion) {
            Show-Usage
        }
        Get-Token $Username $PoolIdOrRegion $ClientIdOrRegion
    }
    "change-password" {
        if (-not $Username -or -not $PoolIdOrRegion -or -not $ClientIdOrRegion) {
            Show-Usage
        }
        Set-UserPassword $Username $PoolIdOrRegion $ClientIdOrRegion
    }
    "create-user" {
        if (-not $Username -or -not $PoolIdOrRegion -or -not $ClientIdOrRegion) {
            Show-Usage
        }
        New-CognitoUser $Username $PoolIdOrRegion $ClientIdOrRegion
    }
    "delete-user" {
        if (-not $Username -or -not $PoolIdOrRegion -or -not $ClientIdOrRegion) {
            Show-Usage
        }
        Remove-CognitoUser $Username $PoolIdOrRegion $ClientIdOrRegion
    }
    "list-users" {
        if (-not $Username -or -not $PoolIdOrRegion) {
            Show-Usage
        }
        Get-CognitoUsers $Username $PoolIdOrRegion
    }
    default {
        Write-Error-Custom "Unknown command: $Command"
        Show-Usage
    }
}
