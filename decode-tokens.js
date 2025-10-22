#!/usr/bin/env node

/**
 * Cognito Token Decoder
 * 
 * This script decodes JWT tokens to show their contents and claims.
 * Run: node decode-tokens.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Decode JWT token without verification (for inspection only)
 */
function decodeJWT(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid JWT format');
        }

        // Decode header
        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
        
        // Decode payload
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        
        // Signature (we don't decode this)
        const signature = parts[2];

        return {
            header,
            payload,
            signature: signature.substring(0, 20) + '...' // Show first 20 chars
        };
    } catch (error) {
        return { error: error.message };
    }
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp) {
    if (!timestamp) return 'Not set';
    const date = new Date(timestamp * 1000);
    return `${date.toISOString()} (${Math.floor((Date.now() - date.getTime()) / 1000 / 60)} minutes ago)`;
}

/**
 * Analyze token expiration
 */
function analyzeExpiration(exp) {
    if (!exp) return 'No expiration set';
    
    const now = Math.floor(Date.now() / 1000);
    const remaining = exp - now;
    
    if (remaining <= 0) {
        return `EXPIRED ${Math.abs(remaining)} seconds ago`;
    } else {
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        return `Valid for ${hours}h ${minutes}m`;
    }
}

/**
 * Load tokens from Electron app secure storage
 */
function loadStoredTokens() {
    try {
        // Find Electron app data directory
        const appDataPath = process.env.APPDATA || 
                          (os.platform() === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
        
        const serviceTranslatePath = path.join(appDataPath, 'service-translate-capture');
        const tokenFilePath = path.join(serviceTranslatePath, 'cognito-tokens.enc');
        
        console.log('Looking for encrypted tokens at:', tokenFilePath);
        
        if (fs.existsSync(tokenFilePath)) {
            const encryptedData = fs.readFileSync(tokenFilePath);
            console.log('✅ Found encrypted token file');
            console.log('📊 File size:', encryptedData.length, 'bytes');
            console.log('📅 Last modified:', fs.statSync(tokenFilePath).mtime.toISOString());
            console.log('\n⚠️  File is encrypted with Electron safeStorage (OS-level encryption)');
            console.log('🔓 To decode, run this from within the capture app:\n');
            
            console.log('STEP 1: Open capture app');
            console.log('STEP 2: Open developer console (F12)');
            console.log('STEP 3: Paste this code:');
            console.log(`
const { SecureTokenStorage } = require('./src/secure-token-storage');
const path = require('path');
const { app } = require('electron');

// Load tokens from secure storage
const tokenStorage = new SecureTokenStorage(app.getPath('userData'));
const tokens = tokenStorage.loadTokens();

if (tokens) {
    console.log('🎯 TOKENS FOUND:');
    console.log('Access Token:', tokens.accessToken.substring(0, 50) + '...');
    console.log('ID Token:', tokens.idToken.substring(0, 50) + '...');
    console.log('Refresh Token:', tokens.refreshToken.substring(0, 30) + '...');
    console.log('Expires At:', tokens.expiresAt);
    console.log('Username:', tokens.username);
    
    // Copy tokens to decode externally
    console.log('\\n📋 TO DECODE EXTERNALLY:');
    console.log('Access Token Full:', tokens.accessToken);
    console.log('ID Token Full:', tokens.idToken);
} else {
    console.log('❌ No tokens found or tokens expired');
}
            `);
            
            return { encrypted: true, path: tokenFilePath };
        } else if (fs.existsSync(serviceTranslatePath)) {
            const files = fs.readdirSync(serviceTranslatePath);
            console.log('📁 App data directory found:', serviceTranslatePath);
            console.log('📄 Files:', files);
            console.log('❌ No cognito-tokens.enc file found');
            return null;
        } else {
            console.log('❌ Service Translate app data directory not found');
            console.log('💡 Make sure you have logged into the capture app at least once');
            return null;
        }
    } catch (error) {
        console.error('Error loading stored tokens:', error.message);
        return null;
    }
}

/**
 * Try to decode stored tokens automatically
 */
function decodeStoredTokens() {
    console.log('🔍 Attempting to read stored tokens...\n');
    
    const stored = loadStoredTokens();
    if (!stored) {
        return false;
    }
    
    if (stored.encrypted) {
        console.log('\n❌ Cannot decrypt tokens outside Electron context');
        console.log('📝 Follow the instructions above to extract tokens from the running app');
        return false;
    }
    
    return true;
}

/**
 * Main function
 */
function main() {
    console.log('🔍 Cognito Token Decoder');
    console.log('========================\n');

    // Check for tokens in command line arguments
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node decode-tokens.js <access-token> [id-token] [refresh-token]');
        console.log('   Or: node decode-tokens.js --interactive');
        console.log('\nExample:');
        console.log('node decode-tokens.js eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...\n');
        
        // Try to load from stored location
        loadStoredTokens();
        
        console.log('\n💡 To decode tokens:');
        console.log('1. Run the capture app');
        console.log('2. Login successfully');
        console.log('3. Open browser dev tools (F12)');
        console.log('4. In console, type: localStorage');
        console.log('5. Look for stored token data');
        console.log('6. Copy tokens and run: node decode-tokens.js <token>\n');
        
        return;
    }

    if (args[0] === '--interactive') {
        console.log('Interactive mode not implemented yet');
        console.log('Please provide tokens as command line arguments');
        return;
    }

    // Decode provided tokens
    args.forEach((token, index) => {
        const tokenType = ['Access Token', 'ID Token', 'Refresh Token'][index] || `Token ${index + 1}`;
        
        console.log(`\n📋 ${tokenType}`);
        console.log('═'.repeat(50));
        console.log('Raw token:', token.substring(0, 50) + '...');
        console.log('Length:', token.length, 'characters');
        
        if (token.split('.').length === 3) {
            // JWT Token
            const decoded = decodeJWT(token);
            
            if (decoded.error) {
                console.log('❌ Decode error:', decoded.error);
            } else {
                console.log('\n📄 Header:');
                console.log(JSON.stringify(decoded.header, null, 2));
                
                console.log('\n📄 Payload:');
                console.log(JSON.stringify(decoded.payload, null, 2));
                
                // Analyze key claims
                if (decoded.payload) {
                    console.log('\n🔍 Key Claims Analysis:');
                    console.log('• Subject (sub):', decoded.payload.sub || 'Missing');
                    console.log('• Audience (aud):', decoded.payload.aud || '❌ MISSING (This could be the issue!)');
                    console.log('• Issuer (iss):', decoded.payload.iss || 'Missing');
                    console.log('• Client ID:', decoded.payload.client_id || decoded.payload.aud || 'Missing');
                    console.log('• Username:', decoded.payload.username || decoded.payload['cognito:username'] || 'Missing');
                    console.log('• Email:', decoded.payload.email || 'Missing');
                    console.log('• Token Use:', decoded.payload.token_use || 'Missing');
                    console.log('• Issued At:', formatTimestamp(decoded.payload.iat));
                    console.log('• Expires At:', formatTimestamp(decoded.payload.exp));
                    console.log('• Expiration Status:', analyzeExpiration(decoded.payload.exp));
                    
                    // Check for AWS-specific claims
                    if (decoded.payload['cognito:groups']) {
                        console.log('• Cognito Groups:', decoded.payload['cognito:groups']);
                    }
                    
                    // For ID tokens, check additional claims
                    if (decoded.payload.token_use === 'id') {
                        console.log('\n🆔 ID Token Specific Claims:');
                        console.log('• Email Verified:', decoded.payload.email_verified);
                        console.log('• Auth Time:', formatTimestamp(decoded.payload.auth_time));
                        console.log('• Event ID:', decoded.payload.event_id || 'Missing');
                    }
                    
                    // For access tokens, check scope
                    if (decoded.payload.token_use === 'access') {
                        console.log('\n🔑 Access Token Specific Claims:');
                        console.log('• Scope:', decoded.payload.scope);
                        console.log('• Client ID:', decoded.payload.client_id);
                    }
                }
                
                console.log('\n🔐 Signature:', decoded.signature);
            }
        } else {
            // Not a JWT, might be refresh token
            console.log('⚠️  Not a JWT format - likely a Refresh Token');
            console.log('Refresh tokens are opaque strings that cannot be decoded');
        }
    });

    console.log('\n✅ Token analysis complete');
    console.log('\n💡 Key Points:');
    console.log('• Access tokens expire every 24 hours (1440 minutes)');
    console.log('• ID tokens expire every 24 hours (1440 minutes)');  
    console.log('• Refresh tokens expire every 30 days (43200 minutes)');
    console.log('• AWS Identity Pool requires ID tokens with "aud" claim');
    console.log('• Missing "aud" claim = App Client configuration issue');
}

// Run the decoder
main();
