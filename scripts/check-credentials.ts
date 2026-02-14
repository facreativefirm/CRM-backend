import prisma from '../src/config/database';
import encryptionService from '../src/services/encryption.service';

async function quickCheck() {
    try {
        const settings = await prisma.systemSetting.findMany({
            where: {
                settingKey: {
                    in: ['nagadPublicKey', 'nagadPrivateKey', 'bkashAppSecret', 'bkashPassword', 'smtpPass']
                }
            }
        });

        console.log('\n📊 Payment Gateway Credentials Status:\n');
        console.log('Total credentials found:', settings.length);
        console.log('');

        if (settings.length === 0) {
            console.log('⚠️  No credentials found in database.');
            console.log('   Credentials are being loaded from .env file (not encrypted).\n');
        } else {
            settings.forEach(s => {
                const isEncFormat = encryptionService.isEncrypted(s.settingValue);
                console.log(`${s.settingKey}:`);
                console.log(`  - DB encrypted flag: ${s.encrypted}`);
                console.log(`  - Format check: ${isEncFormat ? 'ENCRYPTED ✅' : 'PLAIN TEXT ⚠️'}`);
                console.log(`  - Length: ${s.settingValue.length} chars`);
                console.log('');
            });
        }

        await prisma.$disconnect();
    } catch (error: any) {
        console.error('Error:', error.message);
        await prisma.$disconnect();
        process.exit(1);
    }
}

quickCheck();
