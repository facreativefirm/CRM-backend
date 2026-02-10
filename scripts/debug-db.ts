import prisma from '../src/config/database';

async function verify() {
    const keys = ['bkashAppSecret', 'bkashPassword', 'nagadPrivateKey', 'nagadPublicKey'];
    const settings = await prisma.systemSetting.findMany({
        where: { settingKey: { in: keys } }
    });

    console.log(`Found ${settings.length} settings`);
    settings.forEach(s => {
        const val = s.settingValue;
        console.log(`${s.settingKey}: [${val.substring(0, 15)}...] (Length: ${val.length})`);
        const parts = val.split(':');
        console.log(`  Is Encrypted Format (iv:tag:data): ${parts.length === 3}`);
    });
}

verify().catch(console.error).finally(() => prisma.$disconnect());
