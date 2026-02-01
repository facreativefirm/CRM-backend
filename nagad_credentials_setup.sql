-- ============================================
-- Nagad Credentials Check & Setup Script
-- ============================================

-- STEP 1: Check if Nagad credentials exist
-- ============================================
SELECT 
    "settingKey",
    CASE 
        WHEN "settingValue" IS NULL OR "settingValue" = '' THEN '❌ MISSING'
        WHEN "settingKey" = 'nagadMerchantId' AND LENGTH("settingValue") < 5 THEN '⚠️ TOO SHORT'
        WHEN "settingKey" = 'nagadPublicKey' AND LENGTH("settingValue") < 200 THEN '⚠️ TOO SHORT'
        WHEN "settingKey" = 'nagadPrivateKey' AND LENGTH("settingValue") < 500 THEN '⚠️ TOO SHORT'
        ELSE '✅ Present (' || LENGTH("settingValue") || ' chars)'
    END as status,
    "updatedAt"
FROM "SystemSetting" 
WHERE "settingKey" IN ('nagadMerchantId', 'nagadPublicKey', 'nagadPrivateKey', 'nagadRunMode')
ORDER BY "settingKey";

-- STEP 2: If credentials are missing, ADD THEM HERE
-- ============================================
-- ⚠️ IMPORTANT: Replace the placeholder values with YOUR actual Nagad credentials
-- ⚠️ Get these from Nagad Merchant Portal or Nagad Support

/*
-- Uncomment and fill in your actual credentials:

INSERT INTO "SystemSetting" ("settingKey", "settingValue", "createdAt", "updatedAt")
VALUES 
    -- Your Merchant ID from Nagad (usually 6-10 digits)
    ('nagadMerchantId', 'YOUR_MERCHANT_ID_HERE', NOW(), NOW()),
    
    -- Nagad's Public Key (for encrypting data you send to Nagad)
    -- This should start with -----BEGIN PUBLIC KEY-----
    ('nagadPublicKey', '-----BEGIN PUBLIC KEY-----
YOUR_NAGAD_PUBLIC_KEY_HERE
-----END PUBLIC KEY-----', NOW(), NOW()),
    
    -- Your Merchant Private Key (for signing requests)
    -- This should start with -----BEGIN PRIVATE KEY-----
    ('nagadPrivateKey', '-----BEGIN PRIVATE KEY-----
YOUR_MERCHANT_PRIVATE_KEY_HERE
-----END PRIVATE KEY-----', NOW(), NOW()),
    
    -- Run mode: 'sandbox' for testing, 'production' for live
    ('nagadRunMode', 'sandbox', NOW(), NOW())
    
ON CONFLICT ("settingKey") 
DO UPDATE SET 
    "settingValue" = EXCLUDED."settingValue", 
    "updatedAt" = NOW();
*/

-- STEP 3: Verify credentials were added
-- ============================================
SELECT 
    "settingKey",
    LENGTH("settingValue") as "Length",
    LEFT("settingValue", 50) as "Preview",
    "updatedAt"
FROM "SystemSetting" 
WHERE "settingKey" IN ('nagadMerchantId', 'nagadPublicKey', 'nagadPrivateKey', 'nagadRunMode')
ORDER BY "settingKey";

-- STEP 4: Quick switch between sandbox and production
-- ============================================

-- Switch to SANDBOX mode (for testing):
-- UPDATE "SystemSetting" SET "settingValue" = 'sandbox', "updatedAt" = NOW() WHERE "settingKey" = 'nagadRunMode';

-- Switch to PRODUCTION mode (only after Nagad approval):
-- UPDATE "SystemSetting" SET "settingValue" = 'production', "updatedAt" = NOW() WHERE "settingKey" = 'nagadRunMode';

-- ============================================
-- NOTES:
-- ============================================
-- 1. You MUST get credentials from Nagad first
--    - Register at: https://merchant.mynagad.com/
--    - Contact Nagad support for sandbox access
--
-- 2. Key format is critical:
--    - Public key: -----BEGIN PUBLIC KEY-----
--    - Private key: -----BEGIN PRIVATE KEY-----
--    - Include all header/footer lines
--    - Keep line breaks in the key
--
-- 3. After adding credentials:
--    - Restart your backend service
--    - Check logs for "Nagad credentials loaded from: Database"
--    - Try a test payment
--
-- 4. Troubleshooting:
--    - See NAGAD_WAF_REJECTION.md for detailed guide
--    - Check backend logs for detailed error messages
-- ============================================
