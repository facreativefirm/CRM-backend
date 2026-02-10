import prisma from '../src/config/database';

async function dump() {
    console.log('--- ALL SYSTEM SETTINGS ---');
    const settings = await prisma.systemSetting.findMany();
    settings.forEach(s => {
        console.log(`[${s.settingGroup}] ${s.settingKey}: ${s.settingValue.substring(0, 50)}... (Encrypted: ${s.encrypted})`);
    });

    console.log('\n--- ALL PAYMENT GATEWAYS ---');
    const gateways = await prisma.paymentGateway.findMany();
    gateways.forEach(g => {
        console.log(`ID: ${g.id}, Name: ${g.gatewayName}, Settings: ${g.settings}`);
    });
}

dump().catch(console.error).finally(() => prisma.$disconnect());
