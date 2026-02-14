import prisma from '../src/config/database';

async function findInitLog() {
    try {
        const tx = await prisma.transaction.findUnique({ where: { id: 16 } });
        if (!tx) return;

        // Find the log with INITIATED status for this transactionId
        const log = await prisma.gatewayLog.findFirst({
            where: {
                transactionId: tx.transactionId as string,
                status: 'INITIATED'
            }
        });

        if (log) {
            console.log(`Init Log ID: ${log.id}`);
            const isHtml = log.responseData?.includes('<html');
            console.log(`Is HTML: ${isHtml}`);
            if (!isHtml) {
                console.log(`Data: ${log.responseData}`);
            }
        }
    } catch (error) { console.error(error); }
    finally { await prisma.$disconnect(); }
}

findInitLog();
