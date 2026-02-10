/**
 * Fix Encrypted Flag
 * 
 * This script updates the 'encrypted' flag for credentials that are already encrypted
 * but don't have the flag set to true in the database.
 */

import prisma from '../src/config/database';
import encryptionService from '../src/services/encryption.service';

const SENSITIVE_FIELDS = [
    'bkashAppSecret',
    'bkashPassword',
    'nagadPrivateKey',
    'nagadPublicKey',
    'smtpPass'
];

async function fixEncryptedFlags() {
    console.log('\n🔧 Fixing Encrypted Flags\n');
    console.log('='.repeat(60));

    try {
        const settings = await prisma.systemSetting.findMany({
            where: {
                settingKey: {
                    in: SENSITIVE_FIELDS
                }
            }
        });

        console.log(`\nFound ${settings.length} sensitive credential(s)\n`);

        let updatedCount = 0;
        let alreadyCorrect = 0;

        for (const setting of settings) {
            const isEncryptedFormat = encryptionService.isEncrypted(setting.settingValue);

            if (isEncryptedFormat && !setting.encrypted) {
                // Update the flag
                await prisma.systemSetting.update({
                    where: { id: setting.id },
                    data: { encrypted: true }
                });

                console.log(`✅ UPDATED: ${setting.settingKey} - set encrypted flag to TRUE`);
                updatedCount++;
            } else if (isEncryptedFormat && setting.encrypted) {
                console.log(`✓  OK: ${setting.settingKey} - already flagged as encrypted`);
                alreadyCorrect++;
            } else if (!isEncryptedFormat && !setting.encrypted) {
                console.log(`⚠️  WARNING: ${setting.settingKey} - NOT encrypted (plain text)`);
            } else {
                console.log(`❌ ERROR: ${setting.settingKey} - flag mismatch`);
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('\n📊 Summary:\n');
        console.log(`   ✅ Updated:        ${updatedCount}`);
        console.log(`   ✓  Already Correct: ${alreadyCorrect}`);
        console.log(`   📝 Total:          ${settings.length}\n`);

        if (updatedCount > 0) {
            console.log('✅ Encrypted flags have been fixed!\n');
        } else {
            console.log('ℹ️  No updates needed.\n');
        }

    } catch (error: any) {
        console.error('\n❌ Failed to fix encrypted flags:', error.message);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

fixEncryptedFlags()
    .then(() => {
        console.log('🎉 Done!\n');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
