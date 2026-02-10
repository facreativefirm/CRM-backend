import prisma from '../src/config/database';

async function checkGateways() {
    console.log('--- Checking PaymentGateway Table ---');
    const gateways = await prisma.paymentGateway.findMany();

    gateways.forEach(g => {
        console.log(`Gateway: ${g.gatewayName} (Enabled: ${g.enabled})`);
        console.log(`Settings: ${g.settings ? g.settings.substring(0, 50) + '...' : 'null'}`);
    });

    console.log('\n--- Checking SystemSetting Table ---');
    const sensitiveKeys = ['bkashAppSecret', 'bkashPassword', 'nagadPrivateKey', 'nagadPublicKey'];
    const settings = await prisma.systemSetting.findMany({
        where: { settingKey: { in: sensitiveKeys } }
    });

    settings.forEach(s => {
        console.log(`${s.settingKey}: ${s.settingValue.includes(':') ? 'ENCRYPTED' : 'PLAIN TEXT'} (${s.settingValue.substring(0, 5)}...)`);
    });
}

checkGateways().catch(console.error).finally(() => prisma.$disconnect());
