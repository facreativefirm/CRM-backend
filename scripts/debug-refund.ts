import prisma from '../src/config/database';

async function findRefundResult() {
    try {
        console.log('Searching for bKash refund logs...');
        const logs = await prisma.gatewayLog.findMany({
            where: {
                gateway: 'BKASH',
                OR: [
                    { requestData: { contains: 'REFUND' } },
                    { responseData: { contains: 'refund' } }
                ]
            },
            orderBy: {
                timestamp: 'desc'
            },
            take: 10
        });

        if (logs.length === 0) {
            console.log('No bKash refund logs found.');
            return;
        }

        for (const log of logs) {
            console.log('\n--- Log Entry ---');
            console.log('Status:', log.status);
            console.log('Request:', log.requestData);
            console.log('Response:', log.responseData);
            console.log('Timestamp:', log.timestamp);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

findRefundResult();
