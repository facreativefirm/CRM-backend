import prisma from '../src/config/database';

async function checkAnyInitLog() {
    try {
        const log = await prisma.gatewayLog.findFirst({
            where: {
                gateway: 'NAGAD_AUTO',
                status: 'INITIATED'
            },
            orderBy: { timestamp: 'desc' }
        });

        if (log) {
            console.log(`Log ID: ${log.id}`);
            console.log(`ResponseData: ${log.responseData}`);
        }
    } catch (error) { console.error(error); }
    finally { await prisma.$disconnect(); }
}

checkAnyInitLog();
