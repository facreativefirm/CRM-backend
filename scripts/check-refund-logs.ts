import prisma from '../src/config/database';

async function checkRefundLogs() {
    try {
        console.log('--- Searching for Refund Logs ---');
        const logs = await prisma.gatewayLog.findMany({
            where: {
                transactionId: { startsWith: 'REF-' }
            },
            orderBy: {
                timestamp: 'desc'
            }
        });

        logs.forEach(log => {
            console.log(`\nLog ID: ${log.id} | Gateway: ${log.gateway} | Status: ${log.status}`);
            console.log(`Ref: ${log.transactionId}`);
            console.log(`Response: ${log.responseData}`);
        });

    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

checkRefundLogs();
