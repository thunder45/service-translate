/**
 * Test script to verify session management with Cognito IDs
 * 
 * This script verifies:
 * 1. SessionData uses adminId field (Cognito sub)
 * 2. Session creation uses Cognito sub as adminId
 * 3. createdBy field uses Cognito username or email
 * 4. Session persistence works with Cognito-based IDs
 * 5. Sessions are preserved when admin re-authenticates after token expiry
 */

import { SessionManager } from './session-manager';
import { SessionConfig, TargetLanguage } from '../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

// Test configuration
const TEST_SESSIONS_DIR = './test-sessions';
const COGNITO_SUB = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'; // Mock Cognito sub (UUID)
const COGNITO_USERNAME = 'testuser@example.com';
const SOCKET_ID_1 = 'socket-123';
const SOCKET_ID_2 = 'socket-456';

// Clean up test directory
function cleanupTestDir() {
  if (fs.existsSync(TEST_SESSIONS_DIR)) {
    fs.rmSync(TEST_SESSIONS_DIR, { recursive: true, force: true });
  }
}

// Test 1: Verify SessionData uses adminId field
function testSessionDataStructure() {
  console.log('\n=== Test 1: Verify SessionData uses adminId field ===');
  
  const sessionManager = new SessionManager(TEST_SESSIONS_DIR);
  
  const config: SessionConfig = {
    sourceLanguage: 'pt',
    targetLanguages: ['en', 'es'],
    enabledLanguages: ['en', 'es'],
    ttsMode: 'neural',
    audioQuality: 'high',
    audioConfig: {
      sampleRate: 16000,
      encoding: 'pcm',
      channels: 1
    }
  };
  
  const session = sessionManager.createSession(
    'CHURCH-2025-001',
    config,
    COGNITO_SUB,
    SOCKET_ID_1,
    COGNITO_USERNAME
  );
  
  // Verify adminId is set correctly
  if (session.adminId !== COGNITO_SUB) {
    throw new Error(`Expected adminId to be ${COGNITO_SUB}, got ${session.adminId}`);
  }
  
  console.log('✓ SessionData has adminId field');
  console.log(`✓ adminId is set to Cognito sub: ${session.adminId}`);
  
  return sessionManager;
}

// Test 2: Verify session creation uses Cognito sub as adminId
function testSessionCreationWithCognitoSub(sessionManager: SessionManager) {
  console.log('\n=== Test 2: Verify session creation uses Cognito sub as adminId ===');
  
  const config: SessionConfig = {
    sourceLanguage: 'en',
    targetLanguages: ['pt', 'fr'],
    enabledLanguages: ['pt', 'fr'],
    ttsMode: 'standard',
    audioQuality: 'medium',
    audioConfig: {
      sampleRate: 16000,
      encoding: 'pcm',
      channels: 1
    }
  };
  
  const session = sessionManager.createSession(
    'CHURCH-2025-002',
    config,
    COGNITO_SUB,
    SOCKET_ID_1,
    COGNITO_USERNAME
  );
  
  // Verify adminId matches Cognito sub
  if (session.adminId !== COGNITO_SUB) {
    throw new Error(`Expected adminId to match Cognito sub ${COGNITO_SUB}, got ${session.adminId}`);
  }
  
  // Verify adminId is a valid UUID format (Cognito sub format)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(session.adminId)) {
    throw new Error(`adminId ${session.adminId} is not in UUID format (Cognito sub format)`);
  }
  
  console.log('✓ Session created with Cognito sub as adminId');
  console.log(`✓ adminId is valid UUID format: ${session.adminId}`);
}

// Test 3: Verify createdBy field uses Cognito username or email
function testCreatedByField(sessionManager: SessionManager) {
  console.log('\n=== Test 3: Verify createdBy field uses Cognito username or email ===');
  
  const config: SessionConfig = {
    sourceLanguage: 'es',
    targetLanguages: ['en'],
    enabledLanguages: ['en'],
    ttsMode: 'local',
    audioQuality: 'low',
    audioConfig: {
      sampleRate: 16000,
      encoding: 'pcm',
      channels: 1
    }
  };
  
  const session = sessionManager.createSession(
    'CHURCH-2025-003',
    config,
    COGNITO_SUB,
    SOCKET_ID_1,
    COGNITO_USERNAME
  );
  
  // Verify createdBy is set to Cognito username
  if (session.createdBy !== COGNITO_USERNAME) {
    throw new Error(`Expected createdBy to be ${COGNITO_USERNAME}, got ${session.createdBy}`);
  }
  
  console.log('✓ createdBy field is set to Cognito username');
  console.log(`✓ createdBy value: ${session.createdBy}`);
}

// Test 4: Verify session persistence works with Cognito-based IDs
function testSessionPersistence() {
  console.log('\n=== Test 4: Verify session persistence works with Cognito-based IDs ===');
  
  // Create a new session manager and session
  const sessionManager1 = new SessionManager(TEST_SESSIONS_DIR);
  
  const config: SessionConfig = {
    sourceLanguage: 'pt',
    targetLanguages: ['en', 'es', 'fr'],
    enabledLanguages: ['en', 'es', 'fr'],
    ttsMode: 'neural',
    audioQuality: 'high',
    audioConfig: {
      sampleRate: 16000,
      encoding: 'pcm',
      channels: 1
    }
  };
  
  const session1 = sessionManager1.createSession(
    'CHURCH-2025-004',
    config,
    COGNITO_SUB,
    SOCKET_ID_1,
    COGNITO_USERNAME
  );
  
  console.log('✓ Session created and persisted to disk');
  
  // Create a new session manager instance (simulates server restart)
  const sessionManager2 = new SessionManager(TEST_SESSIONS_DIR);
  
  // Load the persisted session
  const session2 = sessionManager2.getSession('CHURCH-2025-004');
  
  if (!session2) {
    throw new Error('Failed to load persisted session');
  }
  
  // Verify adminId is preserved
  if (session2.adminId !== COGNITO_SUB) {
    throw new Error(`Expected adminId to be ${COGNITO_SUB}, got ${session2.adminId}`);
  }
  
  // Verify createdBy is preserved
  if (session2.createdBy !== COGNITO_USERNAME) {
    throw new Error(`Expected createdBy to be ${COGNITO_USERNAME}, got ${session2.createdBy}`);
  }
  
  console.log('✓ Session loaded from disk with correct adminId');
  console.log('✓ Session loaded from disk with correct createdBy');
  console.log(`✓ Persisted adminId: ${session2.adminId}`);
  console.log(`✓ Persisted createdBy: ${session2.createdBy}`);
}

// Test 5: Verify sessions are preserved when admin re-authenticates after token expiry
function testSessionPreservationOnReauth() {
  console.log('\n=== Test 5: Verify sessions are preserved when admin re-authenticates ===');
  
  const sessionManager = new SessionManager(TEST_SESSIONS_DIR);
  
  const config: SessionConfig = {
    sourceLanguage: 'pt',
    targetLanguages: ['en'],
    enabledLanguages: ['en'],
    ttsMode: 'neural',
    audioQuality: 'high',
    audioConfig: {
      sampleRate: 16000,
      encoding: 'pcm',
      channels: 1
    }
  };
  
  // Step 1: Admin creates session with first socket connection
  const session1 = sessionManager.createSession(
    'CHURCH-2025-005',
    config,
    COGNITO_SUB,
    SOCKET_ID_1,
    COGNITO_USERNAME
  );
  
  console.log('✓ Session created with first socket connection');
  console.log(`  adminId: ${session1.adminId}`);
  console.log(`  currentAdminSocketId: ${session1.currentAdminSocketId}`);
  
  // Step 2: Simulate token expiry and re-authentication with new socket
  // Update current admin socket (simulates reconnection after token refresh)
  const updated = sessionManager.updateCurrentAdminSocket('CHURCH-2025-005', SOCKET_ID_2);
  
  if (!updated) {
    throw new Error('Failed to update current admin socket');
  }
  
  // Step 3: Verify session is still owned by same admin (adminId unchanged)
  const session2 = sessionManager.getSession('CHURCH-2025-005');
  
  if (!session2) {
    throw new Error('Session not found after socket update');
  }
  
  if (session2.adminId !== COGNITO_SUB) {
    throw new Error(`adminId changed after re-authentication: expected ${COGNITO_SUB}, got ${session2.adminId}`);
  }
  
  if (session2.currentAdminSocketId !== SOCKET_ID_2) {
    throw new Error(`currentAdminSocketId not updated: expected ${SOCKET_ID_2}, got ${session2.currentAdminSocketId}`);
  }
  
  console.log('✓ Session preserved after re-authentication');
  console.log(`✓ adminId unchanged: ${session2.adminId}`);
  console.log(`✓ currentAdminSocketId updated: ${session2.currentAdminSocketId}`);
  
  // Step 4: Verify session ownership
  const ownership = sessionManager.getSessionOwnership('CHURCH-2025-005');
  
  if (!ownership) {
    throw new Error('Failed to get session ownership');
  }
  
  if (ownership.adminId !== COGNITO_SUB) {
    throw new Error(`Ownership adminId mismatch: expected ${COGNITO_SUB}, got ${ownership.adminId}`);
  }
  
  console.log('✓ Session ownership verified');
  console.log(`✓ Owner adminId: ${ownership.adminId}`);
  console.log(`✓ Owner username: ${ownership.createdBy}`);
  
  // Step 5: Verify admin can still access their sessions
  const adminSessions = sessionManager.getSessionsByAdmin(COGNITO_SUB);
  
  const hasSession = adminSessions.some(s => s.sessionId === 'CHURCH-2025-005');
  
  if (!hasSession) {
    throw new Error('Admin cannot access their session after re-authentication');
  }
  
  console.log('✓ Admin can still access their sessions after re-authentication');
  console.log(`✓ Admin owns ${adminSessions.length} session(s)`);
}

// Run all tests
function runTests() {
  console.log('Starting Session Management Cognito Integration Tests...');
  
  try {
    // Clean up before tests
    cleanupTestDir();
    
    // Run tests
    const sessionManager = testSessionDataStructure();
    testSessionCreationWithCognitoSub(sessionManager);
    testCreatedByField(sessionManager);
    testSessionPersistence();
    testSessionPreservationOnReauth();
    
    console.log('\n=== All Tests Passed ✓ ===\n');
    console.log('Summary:');
    console.log('✓ SessionData uses adminId field (Cognito-compatible)');
    console.log('✓ Session creation uses Cognito sub as adminId');
    console.log('✓ createdBy field uses Cognito username or email');
    console.log('✓ Session persistence works with Cognito-based IDs');
    console.log('✓ Sessions are preserved when admin re-authenticates after token expiry');
    
    // Clean up after tests
    cleanupTestDir();
    
    process.exit(0);
  } catch (error) {
    console.error('\n=== Test Failed ✗ ===');
    console.error(error);
    
    // Clean up after failed tests
    cleanupTestDir();
    
    process.exit(1);
  }
}

// Run tests if executed directly
if (require.main === module) {
  runTests();
}

export { runTests };
