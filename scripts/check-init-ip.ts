import prisma from '../src/config/database';

async function checkInitiationIP() {
    try {
        const txId = 'MDIzMTE5MTEwODU1OC42NzYuZDAwYTZhZTRjY2UyZmNlYjAwMDA='; // I saw something like this earlier
        // Let's just find by the paymentRefId from the refund log
        const log = await prisma.gatewayLog.findFirst({
            where: {
                transactionId: 'MDIxNDEyMzAzMTQzNi42' // Truncated ID I saw in logs
            }
        });

        // Better: find the initiation log for the transaction that failed to refund
        const tx = await prisma.transaction.findUnique({
            where: { id: 16 }
        });

        if (tx) {
            const initLog = await prisma.gatewayLog.findFirst({
                where: {
                    transactionId: tx.transactionId as string,
                    gateway: 'NAGAD_AUTO'
                }
            });
            if (initLog) {
                console.log('Initiation Log RequestData:', initLog.requestData);
            }
        }
    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

checkInitiationIP();
