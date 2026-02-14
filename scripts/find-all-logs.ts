import prisma from '../src/config/database';

async function findALLLogs() {
    try {
        const search = 'MDIxNDEy'; // Start of the ID
        const logs = await prisma.gatewayLog.findMany({
            where: {
                transactionId: { contains: search }
            },
            orderBy: { timestamp: 'asc' }
        });

        console.log(`Found ${logs.length} logs matching ${search}`);
        logs.forEach(log => {
            console.log(`\nID: ${log.id} | Status: ${log.status} | Time: ${log.timestamp}`);
            console.log(`TxId: ${log.transactionId}`);
            // Check if response is HTML
            const isHtml = log.responseData?.includes('<html');
            console.log(`Is HTML: ${isHtml}`);
            if (!isHtml) {
                console.log(`Response: ${log.responseData}`);
            }
        });
    } catch (error) { console.error(error); }
    finally { await prisma.$disconnect(); }
}

findALLLogs();
