
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAdmins() {
    console.log('--- Checking Administrators ---');
    const users = await prisma.user.findMany({
        where: {
            userType: { in: ['ADMIN', 'SUPER_ADMIN', 'STAFF'] }
        }
    });

    if (users.length === 0) {
        console.log('No users found with ADMIN, SUPER_ADMIN, or STAFF types.');
    } else {
        users.forEach(u => {
            console.log(`User: ${u.username}, Email: ${u.email}, Type: ${u.userType}, Status: ${u.status}`);
        });
    }

    console.log('\n--- Checking SMTP Settings ---');
    const settings = await prisma.systemSetting.findMany({
        where: {
            settingKey: { startsWith: 'smtp' }
        }
    });

    settings.forEach(s => {
        const value = s.settingKey === 'smtpPass' ? '********' : s.settingValue;
        console.log(`${s.settingKey}: ${value}`);
    });

    process.exit(0);
}

checkAdmins().catch(err => {
    console.error(err);
    process.exit(1);
});
