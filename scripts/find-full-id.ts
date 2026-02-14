import prisma from '../src/config/database';

async function findFullTxId() {
    try {
        const tx = await prisma.transaction.findFirst({
            where: { gateway: 'NAGAD_AUTO' },
            orderBy: { createdAt: 'desc' }
        });
        if (tx) {
            console.log('Full Transaction ID:', tx.transactionId);
        }
    } catch (error) { console.error(error); }
    finally { await prisma.$disconnect(); }
}

findFullTxId();
