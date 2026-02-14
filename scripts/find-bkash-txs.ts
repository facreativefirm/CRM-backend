import prisma from '../src/config/database';

async function findBkashTxs() {
    try {
        const txs = await prisma.transaction.findMany({
            where: {
                gateway: {
                    contains: 'bkash',
                    mode: 'insensitive'
                }
            },
            take: 10
        });
        console.log(JSON.stringify(txs, null, 2));
    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

findBkashTxs();
