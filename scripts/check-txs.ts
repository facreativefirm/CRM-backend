import prisma from '../src/config/database';

async function checkTransactions() {
    try {
        console.log('Fetching last 10 transactions...');
        const txs = await prisma.transaction.findMany({
            orderBy: {
                createdAt: 'desc'
            },
            take: 10
        });

        console.table(txs.map(t => ({
            id: t.id,
            gateway: t.gateway,
            amount: t.amount,
            status: t.status,
            transactionId: t.transactionId
        })));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkTransactions();
