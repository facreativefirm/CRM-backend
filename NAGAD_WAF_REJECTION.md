# Nagad WAF Rejection Error - Troubleshooting Guide

## Current Error
```
Nagad initialization returned empty sensitiveData. 
Full response: "<html><head><title>Request Rejected</title></head><body>The requested URL was rejected..."
Support ID: 13622562619434818662
```

## What This Means
Nagad's **Web Application Firewall (WAF)** is blocking your API requests before they even reach the Nagad payment gateway. This is a security measure that rejects requests that don't meet certain criteria.

## Common Causes & Solutions

### 1. Missing or Invalid Nagad Credentials ⚠️ MOST LIKELY

**Check if credentials are configured:**

Run this SQL query in your database:
```sql
SELECT "settingKey", 
       CASE 
           WHEN "settingValue" IS NULL OR "settingValue" = '' THEN '❌ MISSING'
           ELSE '✅ Present (' || LENGTH("settingValue") || ' chars)'
       END as status
FROM "SystemSetting" 
WHERE "settingKey" IN ('nagadMerchantId', 'nagadPublicKey', 'nagadPrivateKey', 'nagadRunMode');
```

**Expected output:**
```
nagadMerchantId    | ✅ Present (6-10 chars)
nagadPublicKey     | ✅ Present (400+ chars)
nagadPrivateKey    | ✅ Present (1600+ chars)
nagadRunMode       | ✅ Present (7-10 chars) - should be 'sandbox' or 'production'
```

**If any are MISSING, add them:**

```sql
-- Example for sandbox (replace with your actual credentials)
INSERT INTO "SystemSetting" ("settingKey", "settingValue", "createdAt", "updatedAt")
VALUES 
    ('nagadMerchantId', 'YOUR_MERCHANT_ID', NOW(), NOW()),
    ('nagadPublicKey', 'YOUR_NAGAD_PUBLIC_KEY', NOW(), NOW()),
    ('nagadPrivateKey', 'YOUR_MERCHANT_PRIVATE_KEY', NOW(), NOW()),
    ('nagadRunMode', 'sandbox', NOW(), NOW())
ON CONFLICT ("settingKey") 
DO UPDATE SET "settingValue" = EXCLUDED."settingValue", "updatedAt" = NOW();
```

### 2. Using Production Mode Without Proper Setup

If `nagadRunMode` is set to `'production'` but you haven't completed Nagad's production onboarding:

**Solution:** Switch to sandbox mode temporarily:
```sql
UPDATE "SystemSetting" 
SET "settingValue" = 'sandbox', "updatedAt" = NOW()
WHERE "settingKey" = 'nagadRunMode';
```

Then restart your backend.

### 3. Invalid Key Format

Nagad keys must be in proper PEM format.

**Public Key Format (from Nagad):**
```
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAiD6gXLa...
(multiple lines of base64)
...end of base64
-----END PUBLIC KEY-----
```

**Private Key Format (your merchant key):**
```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
(multiple lines of base64)
...end of base64
-----END PRIVATE KEY-----
```

**Common mistakes:**
- ❌ Missing header/footer lines
- ❌ Extra quotes or escape characters
- ❌ Line breaks removed
- ❌ Using `BEGIN RSA PRIVATE KEY` instead of `BEGIN PRIVATE KEY`

### 4. Incorrect Merchant ID

**Verify your merchant ID:**
- Should be 6-10 characters
- Usually numeric
- Must match exactly what Nagad provided

**Check in database:**
```sql
SELECT "settingValue" FROM "SystemSetting" WHERE "settingKey" = 'nagadMerchantId';
```

### 5. Server IP Not Whitelisted (Production Only)

If you're using production mode, Nagad may require your server IP to be whitelisted.

**Find your server's public IP:**
```bash
curl ifconfig.me
```

**Contact Nagad support** to whitelist this IP if needed.

### 6. Invalid Request Signature

The WAF might reject requests with invalid signatures. This happens if:
- Private key is incorrect
- Key format is wrong
- Encryption/signing algorithm mismatch

## Step-by-Step Debugging

### Step 1: Check Backend Logs

After the latest code update, you should see detailed logs:

```bash
# Look for credential loading logs
grep "Nagad credentials loaded" /app/logs/all.log

# Look for request details
grep "Nagad Request URL" /app/logs/all.log
grep "Nagad Merchant ID" /app/logs/all.log
```

**What to look for:**
- Are credentials loaded from Database or Environment?
- Is Merchant ID present and correct length?
- Are Public/Private keys present?
- What is the Run Mode (sandbox/production)?

### Step 2: Verify Credentials in Database

```sql
-- Check all Nagad settings
SELECT * FROM "SystemSetting" 
WHERE "settingKey" LIKE 'nagad%';
```

### Step 3: Test with Nagad Sandbox Credentials

If you don't have credentials yet, you need to:

1. **Register for Nagad Merchant Account:**
   - Visit: https://merchant.mynagad.com/
   - Complete registration
   - Get sandbox credentials first

2. **Request Sandbox Access:**
   - Contact Nagad support
   - Request sandbox merchant ID and keys
   - They will provide:
     - Merchant ID
     - Nagad Public Key (for encrypting data you send)
     - Your Private Key (for signing requests)

### Step 4: Validate Key Format

**Test your private key format:**
```bash
# This should NOT give an error
openssl rsa -in your_private_key.pem -check
```

**Test your public key format:**
```bash
# This should show key details
openssl rsa -pubin -in nagad_public_key.pem -text -noout
```

## Quick Fix Checklist

- [ ] Nagad credentials are in database (run SQL query above)
- [ ] All 4 settings are present (merchantId, publicKey, privateKey, runMode)
- [ ] Run mode is set to 'sandbox' (not 'production')
- [ ] Keys are in proper PEM format with headers/footers
- [ ] Merchant ID matches what Nagad provided
- [ ] Backend has been restarted after adding credentials
- [ ] Check logs show "Nagad credentials loaded from: Database"
- [ ] Check logs show all keys are present

## If Still Not Working

### Option 1: Contact Nagad Support
Provide them with:
- Support ID from error: `13622562619434818662`
- Your merchant ID
- Timestamp of the failed request
- Confirm you're using sandbox mode

### Option 2: Use Manual Nagad Payment
As a temporary workaround, you can use the manual Nagad payment option (nagad_manual) which doesn't require API integration.

## Testing After Fix

1. **Restart backend:**
   ```bash
   # In your Docker environment
   docker-compose restart backend
   ```

2. **Try a test payment**

3. **Check logs for:**
   ```
   ✅ "Nagad credentials loaded from: Database"
   ✅ "Nagad Merchant ID present: true"
   ✅ "Nagad Public Key present: true"
   ✅ "Nagad Private Key present: true"
   ✅ "Nagad initialization successful"
   ```

## Example: Adding Sandbox Credentials

```sql
-- Replace with YOUR actual Nagad sandbox credentials
INSERT INTO "SystemSetting" ("settingKey", "settingValue", "createdAt", "updatedAt")
VALUES 
    ('nagadMerchantId', '683002007104225', NOW(), NOW()),
    ('nagadPublicKey', '-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----', NOW(), NOW()),
    ('nagadPrivateKey', '-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----', NOW(), NOW()),
    ('nagadRunMode', 'sandbox', NOW(), NOW())
ON CONFLICT ("settingKey") 
DO UPDATE SET "settingValue" = EXCLUDED."settingValue", "updatedAt" = NOW();
```

**Important:** The keys above are examples. You MUST use your actual credentials from Nagad.

## Next Steps

1. Run the SQL query to check if credentials exist
2. If missing, contact Nagad to get sandbox credentials
3. Add credentials to database using the SQL above
4. Restart backend
5. Check logs to confirm credentials are loaded
6. Try payment again

---

**Need Help?** Share the output of:
```sql
SELECT "settingKey", LENGTH("settingValue") as length 
FROM "SystemSetting" 
WHERE "settingKey" LIKE 'nagad%';
```
