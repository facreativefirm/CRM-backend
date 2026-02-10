import prisma from '../src/config/database';

async function verifyEncryption() {
    console.log('='.repeat(60));
    console.log('ENCRYPTION VERIFICATION REPORT');
    console.log('='.repeat(60));

    const sensitiveKeys = ['bkashAppSecret', 'bkashPassword', 'nagadPrivateKey', 'nagadPublicKey', 'smtpPass'];

    const settings = await prisma.systemSetting.findMany({
        where: { settingKey: { in: sensitiveKeys } }
    });

    console.log(`\nFound ${settings.length} sensitive credential(s)\n`);

    let allEncrypted = true;

    for (const setting of settings) {
        const value = setting.settingValue;
        const hasColons = value.includes(':');
        const parts = value.split(':');
        const isEncryptedFormat = parts.length === 3;
        const encryptedFlag = setting.encrypted;

        console.log(`Field: ${setting.settingKey}`);
        console.log(`  Value Preview: ${value.substring(0, 20)}...`);
        console.log(`  Encrypted Flag: ${encryptedFlag ? '✅ TRUE' : '❌ FALSE'}`);
        console.log(`  Format Check: ${isEncryptedFormat ? '✅ ENCRYPTED (iv:tag:data)' : '❌ PLAIN TEXT'}`);
        console.log(`  Status: ${encryptedFlag && isEncryptedFormat ? '✅ SECURE' : '⚠️  NEEDS ATTENTION'}`);
        console.log('');

        if (!encryptedFlag || !isEncryptedFormat) {
            allEncrypted = false;
        }
    }

    console.log('='.repeat(60));
    if (allEncrypted && settings.length > 0) {
        console.log('✅ ALL CREDENTIALS ARE ENCRYPTED AND FLAGGED CORRECTLY');
    } else if (settings.length === 0) {
        console.log('⚠️  NO CREDENTIALS FOUND IN DATABASE');
    } else {
        console.log('❌ SOME CREDENTIALS ARE NOT PROPERLY ENCRYPTED');
    }
    console.log('='.repeat(60));
}

verifyEncryption()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
