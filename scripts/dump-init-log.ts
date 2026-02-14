import prisma from '../src/config/database';

async function dumpInitLog() {
    try {
        const log = await prisma.gatewayLog.findFirst({
            where: {
                gateway: 'NAGAD_AUTO',
                status: 'SUCCESS'
            },
            orderBy: { timestamp: 'desc' }
        });

        if (log) {
            console.log('--- Log Found ---');
            console.log('ID:', log.id);
            console.log('TransactionId (RefID):', log.transactionId);
            console.log('ResponseData:', log.responseData);
        }
    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

dumpInitLog();
