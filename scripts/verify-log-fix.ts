import prisma from '../src/config/database';

async function verifyFix() {
    try {
        // Assume we have a trxID from a transaction
        const trxID = 'DBE53J0T2R'; // From my previous check

        console.log(`Searching for log with trxID: ${trxID} inside responseData...`);
        const log = await prisma.gatewayLog.findFirst({
            where: {
                gateway: 'BKASH',
                status: 'SUCCESS',
                responseData: {
                    contains: trxID
                }
            }
        });

        if (log) {
            console.log('✅ Found Log!');
            console.log('Log ID:', log.id);
            console.log('Log transactionId (PaymentID):', log.transactionId);
        } else {
            console.log('❌ Log not found.');
        }

    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

verifyFix();
