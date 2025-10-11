# Client PWA Alignment Analysis

**Date**: January 11, 2025
**Branch**: client-pwa
**Purpose**: Analyze client-pwa code alignment with WebSocket server implementation

## Executive Summary

The client-pwa application needs updates to align with the WebSocket server's message protocols and error handling. The client does **NOT** require Cognito authentication (that's only for admin apps), but it needs to handle the new error message formats and codes.

## Current State

### ✅ What's Already Correct

1. **Client Message Protocol** - Already matches MESSAGE_PROTOCOLS.md:
   - `join-session` message format is correct
   - `change-language` message format is correct
   - `leave-session` message format is correct

2. **Server Response Handling** - Core functionality working:
   - `session-metadata` handling implemented
   - `translation` message handling implemented
   - `config-updated` handling implemented
   - `session-ended` handling implemented

3. **Connection Management**:
   - WebSocket connection with fallback URLs
   - Reconnection logic with backoff
   - Offline mode support

### ❌ What Needs Updates

#### 1. Error Message Format (CRITICAL)

**Current Format** (Old):
```javascript
{
  "type": "error",
  "code": 400,
  "message": "Error message",
  "details": {}
}
```

**New Format** (Required):
```javascript
{
  "type": "admin-error",  // or "error" for client errors
  "errorCode": "SESSION_1201",
  "message": "Technical message",
  "userMessage": "User-friendly message",
  "retryable": true,
  "retryAfter": 30,
  "details": {},
  "timestamp": "2025-01-11T..."
}
```

#### 2. Error Code Handling

**Missing Error Codes**:
- Cognito authentication errors (COGNITO_1001-1008) - for display only, not used by PWA
- Session management errors (SESSION_1201-1207)
- System errors (SYSTEM_1401-1406)
- Validation errors (VALIDATION_1501-1505)

**Current Implementation**: Only handles generic HTTP-style codes (400, 404, 500)

#### 3. Error Response Handling

**Issues**:
- No handling of `retryable` flag
- No automatic retry with `retryAfter` delays
- No distinction between user message and technical message
- Missing error code-specific handling logic

#### 4. Session Message Handling

**Potential Issues**:
- `session-joined` response changed to `session-metadata` in new protocol
- Need to verify `session-not-found` error handling
- Language removal notifications may need updates

## Required Changes

### Priority 1: Error Message Handler (CRITICAL)

Create new error handler that:
1. Recognizes new error message format
2. Displays `userMessage` to users (not technical `message`)
3. Implements retry logic based on `retryable` flag
4. Respects `retryAfter` delays
5. Handles error codes appropriately

### Priority 2: Update Error Display

Update all error display functions to:
1. Show user-friendly messages
2. Provide retry buttons for retryable errors
3. Display countdown for rate-limited errors
4. Log technical messages for debugging

### Priority 3: Session Error Handling

Add specific handlers for:
- `SESSION_1201` - Session not found
- `SESSION_1207` - Session full (max clients)
- `SYSTEM_1401` - Internal server error
- `VALIDATION_1503` - Invalid session ID format

### Priority 4: Enhance Reconnection

Update reconnection logic to:
1. Handle `session-expired` messages
2. Implement exponential backoff properly
3. Show user-friendly reconnection status

## Code Locations

### Files to Update

1. **src/client-pwa/app.js**
   - Line ~815: `setupWebSocketListeners()` - add new error handlers
   - Line ~1100: `handleSessionJoined()` - verify response format
   - Line ~250: Error display functions - update for new format
   - Line ~1650: Reconnection logic - enhance error handling

2. **src/client-pwa/README.md**
   - Update error handling documentation
   - Add troubleshooting section

## Compatibility Matrix

| Feature | Current | Required | Status |
|---------|---------|----------|--------|
| join-session format | ✅ Correct | ✅ Correct | ✅ OK |
| translation format | ✅ Correct | ✅ Correct | ✅ OK |
| Error message format | ❌ Old | ❌ New | ⚠️ NEEDS UPDATE |
| Error codes | ❌ HTTP only | ❌ New codes | ⚠️ NEEDS UPDATE |
| Retry logic | ⚠️ Basic | ❌ Advanced | ⚠️ NEEDS UPDATE |
| Reconnection | ✅ Working | ⚠️ Enhanced | ⚠️ CAN IMPROVE |
| Session metadata | ✅ Correct | ✅ Correct | ✅ OK |
| Config updates | ✅ Correct | ✅ Correct | ✅ OK |

## Testing Requirements

After updates, test:
1. ✅ Session join with valid session ID
2. ✅ Session join with invalid session ID (SESSION_1201)
3. ✅ Session full error (SESSION_1207)
4. ✅ Network disconnection and reconnection
5. ✅ Server restart recovery
6. ✅ Rate limiting (if applicable to clients)
7. ✅ Language change
8. ✅ TTS audio playback
9. ✅ Offline mode with cached content

## Implementation Plan

### Phase 1: Error Handler Foundation (30 min)
1. Create `ErrorMessageHandler` class
2. Implement new error format parser
3. Add error code registry

### Phase 2: Update Error Display (20 min)
1. Update `showStatus()` to use `userMessage`
2. Add retry button for retryable errors
3. Implement countdown for rate limits

### Phase 3: Enhanced Reconnection (15 min)
1. Add `session-expired` handler
2. Improve exponential backoff
3. Better status messages

### Phase 4: Testing (30 min)
1. Test all error scenarios
2. Verify reconnection
3. Check compatibility with server

**Total Estimated Time**: 95 minutes (~1.5 hours)

## Risk Assessment

**Low Risk Changes**:
- Error message display updates
- Adding new error handlers
- Enhanced logging

**Medium Risk Changes**:
- Retry logic implementation
- Reconnection enhancements

**High Risk Changes**:
- None identified - changes are additive, not breaking

## Backward Compatibility

All changes should maintain backward compatibility with:
- Existing session join flow
- Translation message handling
- Current UI components
- Service Worker caching

## Success Criteria

✅ Client can handle all new error codes gracefully
✅ User-friendly messages displayed for all errors
✅ Retry logic works for retryable errors
✅ Rate limit countdown works correctly
✅ Reconnection is robust and user-friendly
✅ No regression in existing functionality
✅ Code is well-documented

## Notes

- The client-pwa is NOT an admin application
- It does NOT need Cognito authentication
- It only needs to handle client-side operations
- Admin errors (AUTH_*, AUTHZ_*, ADMIN_*) are for reference only
- Focus on SESSION_*, SYSTEM_*, and VALIDATION_* errors

## Next Steps

1. Review this analysis with team
2. Create detailed implementation tasks
3. Implement changes in phases
4. Test thoroughly
5. Update documentation
6. Commit and push changes
