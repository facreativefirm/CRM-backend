import prisma from '../config/database';

async function main() {
    const logs = await prisma.gatewayLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: 20
    });
    logs.forEach(log => {
        console.log(`--- ID: ${log.id} ---`);
        console.log(`TransactionId: ${log.transactionId}`);
        console.log(`Status: ${log.status}`);
        console.log(`Response: ${log.responseData}`);
        console.log(`Request: ${JSON.stringify(log.requestData)}`);
    });
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
