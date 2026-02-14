import prisma from '../src/config/database';

async function debugNagadRefund() {
    try {
        console.log('🔍 Searching for recent Nagad logs...');
        const logs = await prisma.gatewayLog.findMany({
            where: {
                gateway: 'NAGAD_AUTO'
            },
            orderBy: {
                timestamp: 'desc'
            },
            take: 20
        });

        if (logs.length === 0) {
            console.log('❌ No Nagad logs found.');
            return;
        }

        console.log(`Found ${logs.length} Nagad logs.`);
        for (const log of logs) {
            console.log(`\n--- Log ID: ${log.id} [${log.status}] ---`);
            console.log('Timestamp:', log.timestamp);
            console.log('TransactionId:', log.transactionId);
            console.log('Request:', log.requestData);
            console.log('Response:', log.responseData);
        }

        console.log('\n🔍 Searching for recent Refunds...');
        const refunds = await prisma.refund.findMany({
            include: {
                transaction: true
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 5
        });

        for (const rf of refunds) {
            console.log(`\n--- Refund ID: ${rf.id} [${rf.status}] ---`);
            console.log('Amount:', rf.amount);
            console.log('Gateway:', rf.transaction.gateway);
            console.log('TransactionId:', rf.transaction.transactionId);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

debugNagadRefund();
