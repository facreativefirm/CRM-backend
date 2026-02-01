# Nagad Payment Error Fix - Complete Guide

## Current Error
**Error:** `Nagad completion failed: Invalid encrypted data: must be a non-empty string`

## Root Causes (Multiple Issues Fixed)

### Issue 1: `.replace()` on undefined (FIXED ✅)
The error initially occurred when trying to call `.replace()` on `process.env.FRONTEND_URL` which could be `undefined`.

**Files Fixed:**
- `backend/src/services/nagad.service.ts` (Line 173-183)
- `backend/src/services/crypto.service.ts` (Line 90-91)

### Issue 2: Mock Gateway Service (FIXED ✅)
The `gatewayService.ts` was returning mock data instead of calling the real Nagad API.

**File Fixed:**
- `backend/src/services/gatewayService.ts` (Line 39-69)

### Issue 3: Missing sensitiveData Validation (FIXED ✅)
The Nagad initialization wasn't validating that `sensitiveData` was actually returned from the API.

**File Fixed:**
- `backend/src/services/nagad.service.ts` (Line 136-160)

## Current Status

The error "Invalid encrypted data: must be a non-empty string" means that the Nagad initialization API call is either:
1. **Failing completely** (not reaching Nagad servers)
2. **Returning an error response** (authentication/configuration issue)
3. **Returning success but without sensitiveData** (API format changed)

## Troubleshooting Steps

### Step 1: Check Nagad Credentials
Verify that your Nagad credentials are correctly configured in the database:

```sql
SELECT * FROM "SystemSetting" 
WHERE "settingKey" IN ('nagadMerchantId', 'nagadPublicKey', 'nagadPrivateKey', 'nagadRunMode');
```

Required settings:
- `nagadMerchantId`: Your merchant ID from Nagad
- `nagadPublicKey`: Nagad's public key (for encryption)
- `nagadPrivateKey`: Your merchant private key
- `nagadRunMode`: Either `'production'` or `'sandbox'`

### Step 2: Check Environment Variables
If database settings are not configured, the system falls back to environment variables:

```env
NAGAD_MERCHANT_ID=your_merchant_id
NAGAD_PUBLIC_KEY=your_public_key
NAGAD_MERCHANT_PRIVATE_KEY=your_private_key
NAGAD_RUN_MODE=sandbox  # or 'production'
FRONTEND_URL=https://yourdomain.com
```

### Step 3: Check Backend Logs
Look for detailed error messages in your logs:

```bash
# Check for Nagad initialization errors
grep "Nagad initialization" /app/logs/error.log

# Check for full response details
grep "Full response" /app/logs/error.log
```

### Step 4: Verify API Connectivity
The Nagad service uses these endpoints:

**Sandbox:**
- Base URL: `https://sandbox-ssl.mynagad.com/api/dfs/`
- Init endpoint: `check-out/initialize/{merchantId}/{orderId}`

**Production:**
- Base URL: `https://api.mynagad.com/api/dfs/`
- Init endpoint: `check-out/initialize/{merchantId}/{orderId}`

Test connectivity:
```bash
curl -I https://sandbox-ssl.mynagad.com/api/dfs/
```

### Step 5: Check Key Format
Ensure your keys are in the correct format:

**Public Key Example:**
```
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----
```

**Private Key Example:**
```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----
```

### Step 6: Test with Nagad Sandbox
If you're in production mode, temporarily switch to sandbox to test:

```sql
UPDATE "SystemSetting" 
SET "settingValue" = 'sandbox' 
WHERE "settingKey" = 'nagadRunMode';
```

Then restart your backend and try again.

## Common Issues & Solutions

### Issue: "Merchant ID not found"
**Solution:** Double-check your `nagadMerchantId` matches exactly what Nagad provided.

### Issue: "Invalid signature"
**Solution:** Your private key might be incorrect or in the wrong format. Ensure it's PKCS#8 format.

### Issue: "Invalid Payment Reference Id Format"
**Solution:** The order ID is too long. The system automatically truncates to 20 characters, but verify your invoice numbers aren't excessively long.

### Issue: "RSA_PKCS1_PADDING is no longer supported"
**Solution:** This was fixed in the crypto service. Ensure you're using the latest version of the code.

## Files Modified

1. **backend/src/services/nagad.service.ts**
   - Added null-safety for `FRONTEND_URL`
   - Added validation for `sensitiveData` response
   - Enhanced error logging

2. **backend/src/services/crypto.service.ts**
   - Added validation for `encryptedData` parameter
   - Better error messages

3. **backend/src/services/gatewayService.ts**
   - Replaced mock implementation with real Nagad service calls

## Next Steps

1. **Check your logs** for the detailed error message
2. **Verify Nagad credentials** in database or .env
3. **Test in sandbox mode** first before production
4. **Contact Nagad support** if credentials are correct but still failing

## Testing Checklist

- [ ] Nagad credentials are configured (database or .env)
- [ ] `FRONTEND_URL` is set correctly
- [ ] Backend can reach Nagad API endpoints
- [ ] Keys are in correct PEM format
- [ ] Sandbox mode works before trying production
- [ ] Logs show detailed error messages

## Support

If the issue persists after following these steps, provide:
1. Full error log from backend
2. Nagad run mode (sandbox/production)
3. Whether credentials are in database or .env
4. Any response from Nagad API (check logs)
