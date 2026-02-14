import prisma from '../src/config/database';

async function checkNagadLogs() {
    try {
        const log = await prisma.gatewayLog.findFirst({
            where: {
                gateway: 'NAGAD_AUTO',
                status: 'SUCCESS'
            },
            orderBy: {
                timestamp: 'desc'
            }
        });

        if (log) {
            console.log('--- Nagad Log ---');
            console.log('ID:', log.id);
            console.log('TransactionId:', log.transactionId);
            console.log('RequestData:', log.requestData);
            console.log('ResponseData:', log.responseData);
        } else {
            console.log('No successful Nagad log found.');
        }

    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

checkNagadLogs();
