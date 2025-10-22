#!/usr/bin/env node

/**
 * Token Extractor for Capture App
 * 
 * This creates a script that can be run INSIDE the Electron app console
 * to extract and decode the current tokens.
 */

console.log('🔍 Cognito Token Extractor');
console.log('=========================\n');

console.log('📋 INSTRUCTIONS:');
console.log('1. Open the Service Translate capture app');
console.log('2. Make sure you are logged in');
console.log('3. Open Developer Tools (F12 or Cmd+Option+I)');
console.log('4. Go to the Console tab');
console.log('5. Paste the following code and press Enter:\n');

const extractorCode = `
// Extract and decode tokens (Renderer Process Version)
(async function() {
    try {
        console.log('🔍 Extracting tokens from secure storage...');
        
        // Helper function to decode JWT (works in browser)
        function decodeJWT(token) {
            try {
                const parts = token.split('.');
                if (parts.length !== 3) return null;
                
                // Use base64url decoding
                function base64UrlDecode(str) {
                    // Add padding if needed
                    str += '='.repeat((4 - str.length % 4) % 4);
                    // Replace base64url chars with base64
                    str = str.replace(/-/g, '+').replace(/_/g, '/');
                    return atob(str);
                }
                
                const header = JSON.parse(base64UrlDecode(parts[0]));
                const payload = JSON.parse(base64UrlDecode(parts[1]));
                
                return { header, payload, signature: parts[2].substring(0, 20) + '...' };
            } catch (e) {
                return { error: e.message };
            }
        }
        
        function formatTimestamp(timestamp) {
            if (!timestamp) return 'Not set';
            const date = new Date(timestamp * 1000);
            const now = Date.now();
            const minutesAgo = Math.floor((now - date.getTime()) / 1000 / 60);
            return date.toISOString() + ' (' + minutesAgo + ' minutes ago)';
        }
        
        function analyzeExpiration(exp) {
            if (!exp) return 'No expiration';
            const now = Math.floor(Date.now() / 1000);
            const remaining = exp - now;
            
            if (remaining <= 0) {
                return '❌ EXPIRED ' + Math.abs(remaining) + ' seconds ago';
            } else {
                const hours = Math.floor(remaining / 3600);
                const minutes = Math.floor((remaining % 3600) / 60);
                return '✅ Valid for ' + hours + 'h ' + minutes + 'm';
            }
        }
        
        // Load stored tokens via electronAPI
        const stored = await window.electronAPI.loadStoredAdminTokens();
        
        if (!stored) {
            console.log('❌ No stored tokens found - may have expired or been cleared');
            console.log('💡 Try logging out and logging in again');
            return;
        }
        
        console.log('✅ TOKENS FOUND!');
        console.log('👤 Username:', stored.username);
        console.log('🆔 Admin ID:', stored.adminId);
        console.log('⏰ Stored Expiry:', new Date(stored.tokenExpiry));
        
        // Decode and analyze ACCESS TOKEN
        console.log('\\n' + '='.repeat(60));
        console.log('📋 ACCESS TOKEN ANALYSIS');
        console.log('='.repeat(60));
        console.log('Raw (first 50 chars):', stored.token.substring(0, 50) + '...');
        console.log('Length:', stored.token.length, 'characters');
        
        const accessDecoded = decodeJWT(stored.token);
        if (accessDecoded.error) {
            console.log('❌ Decode error:', accessDecoded.error);
        } else {
            console.log('\\n📄 HEADER:', JSON.stringify(accessDecoded.header, null, 2));
            console.log('\\n📄 PAYLOAD:', JSON.stringify(accessDecoded.payload, null, 2));
            
            if (accessDecoded.payload) {
                console.log('\\n🔍 KEY CLAIMS:');
                console.log('• Subject (sub):', accessDecoded.payload.sub);
                console.log('• Audience (aud):', accessDecoded.payload.aud || '❌ MISSING');
                console.log('• Token Use:', accessDecoded.payload.token_use);
                console.log('• Client ID:', accessDecoded.payload.client_id);
                console.log('• Scope:', accessDecoded.payload.scope);
                console.log('• Issued At:', formatTimestamp(accessDecoded.payload.iat));
                console.log('• Expires At:', formatTimestamp(accessDecoded.payload.exp));
                console.log('• Status:', analyzeExpiration(accessDecoded.payload.exp));
            }
        }
        
        console.log('\\n' + '='.repeat(60));
        console.log('🆔 ID TOKEN - GET FROM MAIN PROCESS');
        console.log('='.repeat(60));
        console.log('⚠️  ID token not available in renderer process');
        console.log('💡 ID token is stored separately in main process as global.authToken');
        console.log('🔍 To check ID token claims, we need to log it during authentication');
        
        // Store tokens for external analysis
        console.log('\\n📄 FULL TOKENS FOR EXTERNAL DECODING:');
        console.log('\\n📋 Access Token:');
        console.log(stored.token);
        
        console.log('\\n💡 NEXT STEPS:');
        console.log('1. Copy the access token above');
        console.log('2. Run: node decode-tokens.js <access-token>');
        console.log('3. For ID token, we need to add logging to main.ts');
        
    } catch (error) {
        console.error('❌ Error extracting tokens:', error);
        console.log('💡 Make sure you are logged into the capture app');
    }
})();
`;

console.log(extractorCode);

console.log('\n🏁 After running the code above, you can decode the tokens with:');
console.log('node decode-tokens.js <access-token> <id-token>');

console.log('\n💡 Your Cognito Configuration:');
console.log('• User Pool ID: us-east-1_WoaXmyQLQ');
console.log('• Client ID: 38t8057tbi0o6873qt441kuo3n');  
console.log('• Identity Pool ID: us-east-1:8a84f3fb-292e-4159-8e56-b6f238ff8d3a');
console.log('• Region: us-east-1');

console.log('\n🎯 Token Expiration Config (from your settings):');
console.log('• Access Token: 1440 minutes (24 hours)');
console.log('• ID Token: 1440 minutes (24 hours)');
console.log('• Refresh Token: 43200 minutes (30 days)');
