import prisma from '../src/config/database';

async function checkDb() {
    console.log('--- Checking Database Credentials ---');
    const settings = await prisma.systemSetting.findMany({
        where: {
            settingKey: {
                in: ['bkashAppSecret', 'bkashPassword', 'nagadPrivateKey', 'nagadPublicKey']
            }
        }
    });

    for (const setting of settings) {
        const val = setting.settingValue;
        const isEncrypted = val.includes(':') && val.split(':').length === 3;
        console.log(`Key: ${setting.settingKey}`);
        console.log(`Value (masked): ${val.substring(0, 10)}...${val.substring(val.length - 5)}`);
        console.log(`Likely Encrypted: ${isEncrypted ? '✅ YES' : '❌ NO'}`);
        console.log('-------------------');
    }
}

checkDb().catch(console.error).finally(() => prisma.$disconnect());
