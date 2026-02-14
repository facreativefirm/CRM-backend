import prisma from '../src/config/database';

async function findRecentNagadRefund() {
    try {
        console.log('--- Searching for Nagad Transactions ---');
        const transactions = await prisma.transaction.findMany({
            where: {
                gateway: { contains: 'NAGAD', mode: 'insensitive' }
            },
            include: {
                refunds: true
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 5
        });

        transactions.forEach(tx => {
            console.log(`\nTransaction ID: ${tx.id} | Gateway: ${tx.gateway} | Amount: ${tx.amount} | Status: ${tx.status}`);
            console.log(`Reference: ${tx.transactionId}`);
            if (tx.refunds.length > 0) {
                console.log(`Refunds: ${tx.refunds.length}`);
                tx.refunds.forEach(rf => {
                    console.log(` - Refund ID: ${rf.id} | Status: ${rf.status} | Amount: ${rf.amount}`);
                });
            } else {
                console.log(' - No refunds found for this transaction in DB');
            }
        });

        console.log('\n--- Checking Gateway logs for NAGAD_AUTO ---');
        const logs = await prisma.gatewayLog.findMany({
            where: {
                gateway: 'NAGAD_AUTO'
            },
            orderBy: {
                timestamp: 'desc'
            },
            take: 10
        });

        logs.forEach(log => {
            console.log(`\nLog ID: ${log.id} | Status: ${log.status} | Time: ${log.timestamp}`);
            console.log(`TransactionId (Ref): ${log.transactionId}`);
            if (log.status === 'FAILED') {
                console.log(`Error Data: ${log.responseData}`);
            }
        });

    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

findRecentNagadRefund();
