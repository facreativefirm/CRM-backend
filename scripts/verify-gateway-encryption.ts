import prisma from '../src/config/database';
import encryptionService from '../src/services/encryption.service';
import logger from '../src/utils/logger';

/**
 * Verification Script: Check Payment Gateway Credential Encryption
 * 
 * This script verifies that:
 * 1. Sensitive payment gateway credentials are encrypted in the database
 * 2. The encryption service can successfully decrypt them
 * 3. The ENCRYPTION_KEY is properly configured
 */

async function verifyGatewayEncryption() {
    console.log('\n🔍 Payment Gateway Encryption Verification\n');
    console.log('='.repeat(60));

    try {
        // Step 1: Test encryption service
        console.log('\n📋 Step 1: Testing Encryption Service...');
        const testResult = await encryptionService.testEncryption();
        if (!testResult) {
            console.error('❌ Encryption service test FAILED');
            process.exit(1);
        }
        console.log('✅ Encryption service is working correctly');

        // Step 2: Check sensitive fields in database
        console.log('\n📋 Step 2: Checking Database Credentials...');

        const sensitiveFields = [
            'bkashAppSecret',
            'bkashPassword',
            'nagadPrivateKey',
            'nagadPublicKey',
            'smtpPass'
        ];

        const settings = await prisma.systemSetting.findMany({
            where: {
                settingKey: {
                    in: sensitiveFields
                }
            }
        });

        console.log(`\nFound ${settings.length} sensitive credential(s) in database:\n`);

        let allEncrypted = true;
        let decryptionErrors = 0;

        for (const setting of settings) {
            const isEncrypted = encryptionService.isEncrypted(setting.settingValue);
            const encryptedFlag = setting.encrypted;

            console.log(`  ${setting.settingKey}:`);
            console.log(`    - Database 'encrypted' flag: ${encryptedFlag ? '✅ true' : '❌ false'}`);
            console.log(`    - Value format check: ${isEncrypted ? '✅ encrypted' : '⚠️  plain text'}`);
            console.log(`    - Value length: ${setting.settingValue.length} chars`);

            // Try to decrypt if it appears encrypted
            if (isEncrypted) {
                try {
                    const decrypted = encryptionService.decrypt(setting.settingValue);
                    console.log(`    - Decryption test: ✅ SUCCESS (decrypted length: ${decrypted.length})`);
                } catch (error: any) {
                    console.log(`    - Decryption test: ❌ FAILED - ${error.message}`);
                    decryptionErrors++;
                }
            } else {
                console.log(`    - ⚠️  WARNING: This credential is NOT encrypted!`);
                allEncrypted = false;
            }
            console.log('');
        }

        // Step 3: Summary
        console.log('='.repeat(60));
        console.log('\n📊 SUMMARY:\n');

        if (settings.length === 0) {
            console.log('⚠️  No sensitive credentials found in database');
            console.log('   This is normal if you haven\'t saved credentials via admin panel yet.');
            console.log('   Credentials from .env file are used directly (not encrypted).');
        } else if (allEncrypted && decryptionErrors === 0) {
            console.log('✅ All sensitive credentials are properly encrypted');
            console.log('✅ All encrypted values can be successfully decrypted');
            console.log('✅ Your payment gateway credentials are secure!');
        } else {
            if (!allEncrypted) {
                console.log('⚠️  Some credentials are stored in plain text');
                console.log('   Action: Re-save credentials via admin panel to encrypt them');
            }
            if (decryptionErrors > 0) {
                console.log(`❌ ${decryptionErrors} credential(s) failed to decrypt`);
                console.log('   Possible causes:');
                console.log('   - ENCRYPTION_KEY mismatch between environments');
                console.log('   - Corrupted encrypted data');
                console.log('   Action: Re-save credentials via admin panel');
            }
        }

        console.log('\n' + '='.repeat(60) + '\n');

        await prisma.$disconnect();
        process.exit(allEncrypted && decryptionErrors === 0 ? 0 : 1);

    } catch (error: any) {
        console.error('\n❌ Verification failed:', error.message);
        console.error('\nStack trace:', error.stack);
        await prisma.$disconnect();
        process.exit(1);
    }
}

// Run verification
verifyGatewayEncryption();
