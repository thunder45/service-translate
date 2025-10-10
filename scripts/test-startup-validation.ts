#!/usr/bin/env node

/**
 * Test script for startup validation
 * Tests the Cognito configuration validation without actually starting the server
 */

import * as path from 'path';
import * as fs from 'fs';

console.log('🧪 Testing Startup Validation Logic\n');

const serverDir = path.join(process.cwd(), 'src', 'websocket-server');
const envPath = path.join(serverDir, '.env');

// Helper function to extract env var
function extractEnvVar(envContent: string, varName: string): string | null {
  const match = envContent.match(new RegExp(`^${varName}=(.*)$`, 'm'));
  if (!match) return null;
  
  // Remove inline comments and trim
  const value = match[1].split('#')[0].trim();
  return value || null;
}

// Test 1: Check if .env exists
console.log('Test 1: Checking .env file existence...');
if (!fs.existsSync(envPath)) {
  console.log('❌ FAIL: .env file not found');
  console.log('   This should trigger the missing .env error message');
} else {
  console.log('✅ PASS: .env file exists');
}

// Test 2: Check Cognito configuration
console.log('\nTest 2: Checking Cognito configuration...');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  
  const cognitoRegion = extractEnvVar(envContent, 'COGNITO_REGION');
  const cognitoUserPoolId = extractEnvVar(envContent, 'COGNITO_USER_POOL_ID');
  const cognitoClientId = extractEnvVar(envContent, 'COGNITO_CLIENT_ID');
  
  const missingVars: string[] = [];
  
  if (!cognitoRegion || cognitoRegion.trim() === '') {
    missingVars.push('COGNITO_REGION');
  }
  
  if (!cognitoUserPoolId || cognitoUserPoolId.trim() === '') {
    missingVars.push('COGNITO_USER_POOL_ID');
  }
  
  if (!cognitoClientId || cognitoClientId.trim() === '') {
    missingVars.push('COGNITO_CLIENT_ID');
  }
  
  if (missingVars.length > 0) {
    console.log('❌ FAIL: Missing Cognito configuration');
    console.log(`   Missing variables: ${missingVars.join(', ')}`);
    console.log('   This should trigger the missing Cognito config error message');
  } else {
    console.log('✅ PASS: All Cognito variables are set');
    console.log(`   COGNITO_REGION: ${cognitoRegion}`);
    console.log(`   COGNITO_USER_POOL_ID: ${cognitoUserPoolId}`);
    console.log(`   COGNITO_CLIENT_ID: ${cognitoClientId?.substring(0, 8)}...`);
    
    // Test 3: Validate User Pool ID format
    console.log('\nTest 3: Validating User Pool ID format...');
    if (cognitoUserPoolId && !cognitoUserPoolId.match(/^[a-z]+-[a-z]+-\d+_[a-zA-Z0-9]+$/)) {
      console.log('❌ FAIL: Invalid User Pool ID format');
      console.log(`   Expected: <region>_<id> (e.g., us-east-1_aBcDeFgHi)`);
      console.log(`   Got: ${cognitoUserPoolId}`);
      console.log('   This should trigger the invalid format error message');
    } else if (cognitoUserPoolId) {
      console.log('✅ PASS: User Pool ID format is valid');
    }
  }
}

// Test 4: Check directory setup
console.log('\nTest 4: Checking directory setup...');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  
  const adminDir = extractEnvVar(envContent, 'ADMIN_IDENTITIES_DIR') || './admin-identities';
  const sessionDir = extractEnvVar(envContent, 'SESSION_PERSISTENCE_DIR') || './sessions';
  
  const adminDirPath = path.join(serverDir, adminDir);
  const sessionDirPath = path.join(serverDir, sessionDir);
  
  console.log(`   Admin identities dir: ${adminDir}`);
  console.log(`   Exists: ${fs.existsSync(adminDirPath) ? '✅' : '❌ (will be created)'}`);
  
  console.log(`   Sessions dir: ${sessionDir}`);
  console.log(`   Exists: ${fs.existsSync(sessionDirPath) ? '✅' : '❌ (will be created)'}`);
}

console.log('\n📋 Summary:');
console.log('   The startup script will validate Cognito configuration on startup');
console.log('   and fail fast with clear error messages if configuration is missing.');
console.log('\n   To fix missing configuration:');
console.log('   1. Deploy backend CDK stack: cd src/backend && npm run deploy');
console.log('   2. Run setup script: ./setup-unified-auth.sh');
console.log('   3. Or manually add Cognito values to src/websocket-server/.env');
