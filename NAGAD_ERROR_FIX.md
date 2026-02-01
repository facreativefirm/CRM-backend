# Nagad Payment Error Fix

## Issue
**Error:** `Nagad completion failed: Cannot read properties of undefined (reading 'replace')`

## Root Cause
The error occurred in the `completePayment` method of `nagad.service.ts` when trying to call `.replace()` on `process.env.FRONTEND_URL` which could be `undefined` in production.

## Files Modified

### 1. `backend/src/services/nagad.service.ts` (Line 173-177)
**Problem:** 
```typescript
let frontendUrl = process.env.FRONTEND_URL || '';
frontendUrl = frontendUrl.replace(/\/$/, '');
```
If `FRONTEND_URL` was somehow `undefined` (not just empty string), calling `.replace()` would fail.

**Fix:**
```typescript
// Get frontend URL and ensure it's a valid string
let frontendUrl = process.env.FRONTEND_URL || '';

// Only remove trailing slash if frontendUrl is not empty
if (frontendUrl && frontendUrl.length > 0) {
    frontendUrl = frontendUrl.replace(/\/$/, '');
}

const merchantCallbackURL = frontendUrl 
    ? `${frontendUrl}/payment/nagad-callback`
    : '/payment/nagad-callback'; // Fallback to relative URL
```

### 2. `backend/src/services/crypto.service.ts` (Line 83-92)
**Problem:**
The `decryptWithPrivateKey` function could receive `undefined` or `null` as `encryptedData` parameter.

**Fix:**
Added validation before calling `.replace()`:
```typescript
if (!encryptedData || typeof encryptedData !== 'string') {
    throw new Error('Invalid encrypted data: must be a non-empty string');
}
```

## Production Checklist

### ✅ Immediate Actions
1. **Verify Environment Variable in Production:**
   ```bash
   # Check if FRONTEND_URL is set correctly
   echo $FRONTEND_URL
   ```
   
   Expected value: `https://yourdomain.com` (without trailing slash)

2. **Update .env file on production server:**
   ```env
   FRONTEND_URL=https://yourdomain.com
   ```

3. **Restart the backend service** after updating environment variables

### 🔍 Testing Steps
1. Try making a Nagad payment in production
2. Monitor backend logs for any new errors
3. Verify the callback URL is correctly formed in Nagad requests

### 📝 Additional Notes
- The fix now provides a fallback to relative URL if `FRONTEND_URL` is not set
- Added proper validation to prevent similar errors in crypto operations
- All `.replace()` calls now have safety checks

## Prevention
To prevent similar issues in the future:
1. Always validate environment variables before using string methods
2. Use TypeScript strict mode to catch potential undefined values
3. Add runtime validation for critical configuration values

## Related Error Logs
Previous errors in logs showed:
- `Nagad completion failed: RSA_PKCS1_PADDING is no longer supported` (different issue, already fixed)
- `Invalid Payment Reference Id Format` (Nagad API validation issue)

The current fix addresses the `.replace()` error specifically.
