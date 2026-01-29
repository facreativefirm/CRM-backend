import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const logs = await prisma.gatewayLog.findMany();

    const targetLog = logs.find(log => {
        try {
            const data = JSON.parse(log.requestData || '{}');
            return data.invoiceId === 7;
        } catch (e) {
            return false;
        }
    });

    if (targetLog) {
        console.log(`Found log ID: ${targetLog.id}. TransactionId: ${targetLog.transactionId}`);
        const paymentRefId = "MDEyODE4NDE0OTc5OC42ODgzMTM5NTU1NTUzOTkuSU5WNzEwODIuZWY4ZjBjMGUwMDc3ZTU0OTZiODA=";
        await prisma.gatewayLog.update({
            where: { id: targetLog.id },
            data: { transactionId: paymentRefId }
        });
        console.log('Updated!');
    } else {
        console.log('Log not found.');
    }
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
