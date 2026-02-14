import prisma from '../src/config/database';

async function checkRefundLogs() {
    try {
        console.log('Searching for refund logs...');
        const logs = await prisma.gatewayLog.findMany({
            where: {
                requestData: {
                    contains: 'REFUND'
                }
            },
            orderBy: {
                timestamp: 'desc'
            },
            take: 10
        });

        console.log('Found logs:', logs.length);
        console.log(JSON.stringify(logs, null, 2));

        const refunds = await prisma.refund.findMany({
            orderBy: {
                createdAt: 'desc'
            },
            take: 5
        });
        console.log('Recent refunds:', JSON.stringify(refunds, null, 2));

    } catch (error) {
        console.error('Error checking logs:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkRefundLogs();
