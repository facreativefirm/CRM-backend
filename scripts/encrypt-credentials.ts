/**
 * Migration Script: Encrypt Payment Gateway Credentials
 * 
 * This script encrypts existing plain-text credentials in the database
 * Run this ONCE after setting up ENCRYPTION_KEY in .env
 * 
 * Usage: npm run encrypt-credentials
 */

import encryptionService from '../src/services/encryption.service';
import prisma from '../src/config/database';
import logger from '../src/utils/logger';

// Sensitive fields that need encryption
const SENSITIVE_FIELDS = [
    'bkashAppSecret',
    'bkashPassword',
    'nagadPrivateKey',
    'nagadPublicKey',
    'smtpPass'
];

async function encryptCredentials() {
    console.log('\n🔐 Payment Gateway Credentials Encryption Migration\n');
    console.log('='.repeat(60));

    try {
        // Test encryption service first
        console.log('\n1️⃣  Testing encryption service...');
        const testPassed = await encryptionService.testEncryption();

        if (!testPassed) {
            throw new Error('Encryption service test failed. Please check ENCRYPTION_KEY in .env');
        }

        // Fetch all sensitive settings
        console.log('\n2️⃣  Fetching credentials from database...');
        const settings = await prisma.systemSetting.findMany({
            where: {
                settingKey: {
                    in: SENSITIVE_FIELDS
                }
            }
        });

        console.log(`   Found ${settings.length} credential(s) to process\n`);

        if (settings.length === 0) {
            console.log('⚠️  No credentials found in database.');
            console.log('   This is normal if credentials are in environment variables only.\n');
            return;
        }

        let encryptedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        // Process each credential
        console.log('3️⃣  Processing credentials:\n');

        for (const setting of settings) {
            try {
                // Check if already encrypted
                if (encryptionService.isEncrypted(setting.settingValue)) {
                    console.log(`   ⏭️  SKIPPED: ${setting.settingKey} (already encrypted)`);
                    skippedCount++;
                    continue;
                }

                // Encrypt the value
                const encrypted = encryptionService.encrypt(setting.settingValue);

                // Update in database
                await prisma.systemSetting.update({
                    where: { id: setting.id },
                    data: {
                        settingValue: encrypted,
                        encrypted: true
                    }
                });

                console.log(`   ✅ ENCRYPTED: ${setting.settingKey}`);
                encryptedCount++;

            } catch (error: any) {
                console.error(`   ❌ ERROR: ${setting.settingKey} - ${error.message}`);
                errorCount++;
            }
        }

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('\n📊 Migration Summary:\n');
        console.log(`   ✅ Encrypted:  ${encryptedCount}`);
        console.log(`   ⏭️  Skipped:    ${skippedCount} (already encrypted)`);
        console.log(`   ❌ Errors:     ${errorCount}`);
        console.log(`   📝 Total:      ${settings.length}\n`);

        if (errorCount > 0) {
            console.log('⚠️  Some credentials failed to encrypt. Please check the errors above.\n');
            process.exit(1);
        }

        if (encryptedCount > 0) {
            console.log('✅ Migration completed successfully!');
            console.log('\n📌 Next Steps:');
            console.log('   1. Test payment gateways to ensure they still work');
            console.log('   2. Backup your ENCRYPTION_KEY from .env file');
            console.log('   3. Never commit .env file to version control');
            console.log('   4. Restart your backend server\n');
        } else {
            console.log('ℹ️  No new credentials were encrypted.\n');
        }

    } catch (error: any) {
        console.error('\n❌ Migration failed:', error.message);
        console.error('\nPlease ensure:');
        console.error('  1. ENCRYPTION_KEY is set in .env file');
        console.error('  2. ENCRYPTION_KEY is exactly 64 hexadecimal characters');
        console.error('  3. Database connection is working\n');
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Run migration
encryptCredentials()
    .then(() => {
        console.log('🎉 Done!\n');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
