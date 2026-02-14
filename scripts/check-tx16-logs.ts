import prisma from '../src/config/database';

async function checkSuccessfulInitLog() {
    try {
        const tx = await prisma.transaction.findUnique({ where: { id: 16 } });
        if (!tx) return;

        console.log('--- Checking logs for Transaction 16 ---');
        const logs = await prisma.gatewayLog.findMany({
            where: {
                transactionId: tx.transactionId as string
            }
        });

        logs.forEach(log => {
            console.log(`\nLog ID: ${log.id} | Status: ${log.status}`);
            const isHtml = log.responseData?.includes('<html');
            console.log(`Is HTML: ${isHtml}`);
            if (!isHtml) {
                console.log(`Snippet: ${log.responseData?.substring(0, 200)}`);
            }
        });
    } catch (error) { console.error(error); }
    finally { await prisma.$disconnect(); }
}

checkSuccessfulInitLog();
