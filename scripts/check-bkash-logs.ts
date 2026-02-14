import prisma from '../src/config/database';

async function checkBkashLogs() {
    try {
        const logs = await prisma.gatewayLog.findMany({
            where: {
                gateway: 'BKASH'
            },
            orderBy: {
                timestamp: 'desc'
            },
            take: 20
        });
        console.log(JSON.stringify(logs, null, 2));
    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

checkBkashLogs();
