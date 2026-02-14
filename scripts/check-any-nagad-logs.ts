import prisma from '../src/config/database';

async function checkAnyNagadLogs() {
    try {
        const logs = await prisma.gatewayLog.findMany({
            where: {
                gateway: {
                    contains: 'NAGAD',
                    mode: 'insensitive'
                }
            },
            orderBy: {
                timestamp: 'desc'
            },
            take: 5
        });

        if (logs.length > 0) {
            console.log(`Found ${logs.length} Nagad logs.`);
            logs.forEach(log => {
                console.log(`\n--- Log ID: ${log.id} ---`);
                console.log('Status:', log.status);
                console.log('TransactionId:', log.transactionId);
                console.log('RequestData:', log.requestData);
                console.log('ResponseData:', log.responseData);
            });
        } else {
            console.log('No Nagad logs found at all.');
        }

    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

checkAnyNagadLogs();
