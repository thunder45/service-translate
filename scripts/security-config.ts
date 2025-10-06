#!/usr/bin/env node

/**
 * Security Configuration Utility
 * Helps configure and test security settings
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import { loadEnvironmentConfig } from '../config/environment';

interface SecurityTestResult {
  test: string;
  passed: boolean;
  message: string;
  recommendation?: string;
}

class SecurityConfigManager {
  private config: any;

  constructor() {
    this.config = loadEnvironmentConfig();
  }

  async runSecurityAudit(): Promise<void> {
    console.log('🔒 Running Security Audit...');
    console.log('================================\n');

    const tests: SecurityTestResult[] = [
      await this.testAuthConfiguration(),
      await this.testSessionSecurity(),
      await this.testRateLimiting(),
      await this.testCredentialSecurity(),
      await this.testNetworkSecurity(),
      await this.testFilePermissions(),
    ];

    // Display results
    let passedCount = 0;
    let failedCount = 0;

    for (const test of tests) {
      const status = test.passed ? '✅' : '❌';
      console.log(`${status} ${test.test}`);
      console.log(`   ${test.message}`);
      
      if (test.recommendation) {
        console.log(`   💡 Recommendation: ${test.recommendation}`);
      }
      
      console.log();

      if (test.passed) {
        passedCount++;
      } else {
        failedCount++;
      }
    }

    // Summary
    console.log('Security Audit Summary:');
    console.log(`✅ Passed: ${passedCount}`);
    console.log(`❌ Failed: ${failedCount}`);
    console.log(`📊 Score: ${Math.round((passedCount / tests.length) * 100)}%\n`);

    if (failedCount > 0) {
      console.log('⚠️  Please address the failed security checks before deployment.');
    } else {
      console.log('🎉 All security checks passed! Your deployment is secure.');
    }

    // Generate security report
    await this.generateSecurityReport(tests);
  }

  private async testAuthConfiguration(): Promise<SecurityTestResult> {
    const authEnabled = this.config.security.enableAuth;
    const hasCredentials = this.config.security.authUsername && this.config.security.authPassword;

    if (!authEnabled) {
      return {
        test: 'Authentication Configuration',
        passed: true,
        message: 'Authentication is disabled (suitable for local-only deployment)',
        recommendation: 'Enable authentication for network or cloud deployments'
      };
    }

    if (!hasCredentials) {
      return {
        test: 'Authentication Configuration',
        passed: false,
        message: 'Authentication is enabled but credentials are not configured',
        recommendation: 'Set AUTH_USERNAME and AUTH_PASSWORD in .env file'
      };
    }

    // Check password strength
    const password = this.config.security.authPassword;
    const isStrongPassword = password.length >= 8 && 
                           /[A-Z]/.test(password) && 
                           /[a-z]/.test(password) && 
                           /[0-9]/.test(password);

    if (!isStrongPassword) {
      return {
        test: 'Authentication Configuration',
        passed: false,
        message: 'Authentication credentials are weak',
        recommendation: 'Use a strong password with at least 8 characters, including uppercase, lowercase, and numbers'
      };
    }

    return {
      test: 'Authentication Configuration',
      passed: true,
      message: 'Authentication is properly configured with strong credentials'
    };
  }

  private async testSessionSecurity(): Promise<SecurityTestResult> {
    const secureIds = this.config.session.secureIds;
    const sessionSecret = this.config.session.secret;

    if (!secureIds) {
      return {
        test: 'Session Security',
        passed: true,
        message: 'Basic session IDs enabled (human-readable format)',
        recommendation: 'Enable secure session IDs for enhanced security'
      };
    }

    // Check session secret strength
    if (!sessionSecret || sessionSecret === 'your-secret-key-here-change-this' || sessionSecret.length < 32) {
      return {
        test: 'Session Security',
        passed: false,
        message: 'Session secret is weak or using default value',
        recommendation: 'Generate a strong session secret with at least 32 characters'
      };
    }

    return {
      test: 'Session Security',
      passed: true,
      message: 'Secure session IDs enabled with strong secret key'
    };
  }

  private async testRateLimiting(): Promise<SecurityTestResult> {
    const wsRateLimit = this.config.security.websocketRateLimitPerSecond;
    const pollyRateLimit = this.config.security.pollyRateLimitPerMinute;
    const maxClients = this.config.security.maxClientsPerSession;

    const issues: string[] = [];

    if (wsRateLimit > 50) {
      issues.push('WebSocket rate limit is very high');
    }

    if (pollyRateLimit > 300) {
      issues.push('Polly rate limit is very high');
    }

    if (maxClients > 100) {
      issues.push('Maximum clients per session is very high');
    }

    if (issues.length > 0) {
      return {
        test: 'Rate Limiting Configuration',
        passed: false,
        message: `Rate limiting issues: ${issues.join(', ')}`,
        recommendation: 'Consider lowering rate limits to prevent abuse'
      };
    }

    return {
      test: 'Rate Limiting Configuration',
      passed: true,
      message: 'Rate limiting is properly configured'
    };
  }

  private async testCredentialSecurity(): Promise<SecurityTestResult> {
    const envFile = '.env';
    
    if (!fs.existsSync(envFile)) {
      return {
        test: 'Credential Security',
        passed: false,
        message: '.env file not found',
        recommendation: 'Create .env file with proper credentials'
      };
    }

    const envContent = fs.readFileSync(envFile, 'utf8');
    const issues: string[] = [];

    // Check for exposed credentials in comments or examples
    if (envContent.includes('your_access_key_here') || envContent.includes('your_secret_key_here')) {
      issues.push('Default credential placeholders detected');
    }

    // Check for AWS credentials in environment variables
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      // This is actually OK, but warn about security
      issues.push('AWS credentials in environment variables (ensure they are not logged)');
    }

    if (issues.length > 0) {
      return {
        test: 'Credential Security',
        passed: false,
        message: `Credential security issues: ${issues.join(', ')}`,
        recommendation: 'Replace placeholder credentials and ensure AWS credentials are properly secured'
      };
    }

    return {
      test: 'Credential Security',
      passed: true,
      message: 'Credentials appear to be properly configured'
    };
  }

  private async testNetworkSecurity(): Promise<SecurityTestResult> {
    const deploymentMode = this.config.deployment.mode;
    const corsOrigin = process.env.WEBSOCKET_CORS_ORIGIN || '*';

    if (deploymentMode !== 'local' && corsOrigin === '*') {
      return {
        test: 'Network Security',
        passed: false,
        message: 'CORS is configured to allow all origins in non-local deployment',
        recommendation: 'Restrict CORS origins for network or cloud deployments'
      };
    }

    if (deploymentMode === 'cloud' && !this.config.security.enableAuth) {
      return {
        test: 'Network Security',
        passed: false,
        message: 'Cloud deployment without authentication enabled',
        recommendation: 'Enable authentication for cloud deployments'
      };
    }

    return {
      test: 'Network Security',
      passed: true,
      message: 'Network security configuration is appropriate for deployment mode'
    };
  }

  private async testFilePermissions(): Promise<SecurityTestResult> {
    const sensitiveFiles = ['.env', 'config/', 'logs/'];
    const issues: string[] = [];

    for (const file of sensitiveFiles) {
      if (fs.existsSync(file)) {
        try {
          const stats = fs.statSync(file);
          // Check if file is readable by others (basic check)
          if (stats.mode & 0o044) {
            issues.push(`${file} may be readable by others`);
          }
        } catch (error) {
          // Ignore permission errors for this test
        }
      }
    }

    if (issues.length > 0) {
      return {
        test: 'File Permissions',
        passed: false,
        message: `File permission issues: ${issues.join(', ')}`,
        recommendation: 'Restrict file permissions for sensitive files (chmod 600 .env)'
      };
    }

    return {
      test: 'File Permissions',
      passed: true,
      message: 'File permissions appear to be properly configured'
    };
  }

  private async generateSecurityReport(tests: SecurityTestResult[]): Promise<void> {
    const report = `# Security Audit Report

Generated: ${new Date().toISOString()}

## Configuration Summary

- **Deployment Mode**: ${this.config.deployment.mode}
- **Authentication**: ${this.config.security.enableAuth ? 'Enabled' : 'Disabled'}
- **Secure Session IDs**: ${this.config.session.secureIds ? 'Enabled' : 'Disabled'}
- **Rate Limiting**: WebSocket (${this.config.security.websocketRateLimitPerSecond}/sec), Polly (${this.config.security.pollyRateLimitPerMinute}/min)
- **Max Clients**: ${this.config.security.maxClientsPerSession} per session

## Test Results

${tests.map(test => `
### ${test.test}
- **Status**: ${test.passed ? '✅ PASSED' : '❌ FAILED'}
- **Message**: ${test.message}
${test.recommendation ? `- **Recommendation**: ${test.recommendation}` : ''}
`).join('\n')}

## Security Recommendations

### For Local Deployment
- Authentication can be disabled for single-machine use
- Basic session IDs are acceptable
- Standard rate limits are sufficient

### For Network Deployment
- Enable authentication with strong credentials
- Use secure session IDs
- Restrict CORS origins
- Monitor connection logs

### For Cloud Deployment
- Authentication is mandatory
- Use secure session IDs with strong secret
- Implement additional monitoring
- Consider HTTPS termination
- Regular security audits

## Next Steps

1. Address any failed security checks
2. Review and update credentials regularly
3. Monitor security logs for suspicious activity
4. Keep dependencies updated
5. Regular security audits

---
*This report was generated automatically by the Service Translate security audit system.*
`;

    fs.writeFileSync('SECURITY_AUDIT_REPORT.md', report);
    console.log('📄 Security audit report generated: SECURITY_AUDIT_REPORT.md');
  }

  async generateSecureCredentials(): Promise<void> {
    console.log('🔐 Generating Secure Credentials...');
    console.log('===================================\n');

    // Generate session secret
    const sessionSecret = crypto.randomBytes(32).toString('hex');
    
    // Generate auth credentials
    const authUsername = 'admin';
    const authPassword = this.generateStrongPassword();

    console.log('Generated secure credentials:');
    console.log(`SESSION_SECRET=${sessionSecret}`);
    console.log(`AUTH_USERNAME=${authUsername}`);
    console.log(`AUTH_PASSWORD=${authPassword}`);
    console.log();
    console.log('Add these to your .env file for enhanced security.');
    console.log('⚠️  Keep these credentials secure and do not share them!');
  }

  private generateStrongPassword(length: number = 16): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    return password;
  }
}

// CLI interface
if (require.main === module) {
  const manager = new SecurityConfigManager();
  
  const command = process.argv[2];
  
  if (command === 'generate') {
    manager.generateSecureCredentials().catch(console.error);
  } else {
    manager.runSecurityAudit().catch(console.error);
  }
}

export { SecurityConfigManager };