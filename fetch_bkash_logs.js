
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log("Searching for bKash logs...");
        const logs = await prisma.gatewayLog.findMany({
            where: { gateway: 'BKASH' },
            orderBy: { createdAt: 'desc' },
            take: 5
        });

        if (logs.length === 0) {
            console.log("No bKash logs found.");
        } else {
            logs.forEach(log => {
                console.log(`--- Log ID: ${log.id} [${log.status}] ---`);
                console.log("Request Data:", log.requestData);
                console.log("Response Data:", log.responseData);
            });
        }
    } catch (e) {
        console.error("Error fetching logs:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
