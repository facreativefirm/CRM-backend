import prisma from '../src/config/database';

async function inspectNagadRefundResult() {
    try {
        const log = await prisma.gatewayLog.findFirst({
            where: {
                transactionId: { startsWith: 'REF-' },
                gateway: 'NAGAD_AUTO'
            },
            orderBy: {
                timestamp: 'desc'
            }
        });

        if (log) {
            console.log('--- Refund Log Found ---');
            console.log('ID:', log.id);
            console.log('Ref:', log.transactionId);
            console.log('Status:', log.status);
            console.log('Response:', log.responseData);
        } else {
            console.log('No Nagad refund log found.');
        }
    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

inspectNagadRefundResult();
