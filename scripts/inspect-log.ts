import prisma from '../src/config/database';

async function inspectSuccessLog() {
    try {
        const log = await prisma.gatewayLog.findFirst({
            where: {
                gateway: 'BKASH',
                status: 'SUCCESS'
            },
            orderBy: {
                timestamp: 'desc'
            }
        });

        if (log) {
            console.log('Log ID:', log.id);
            console.log('ResponseData:', log.responseData);
            if (log.responseData) {
                const data = JSON.parse(log.responseData);
                console.log('Keys in ResponseData:', Object.keys(data));
                console.log('PaymentID:', data.paymentID);
                console.log('TrxID:', data.trxID);
            }
        } else {
            console.log('No successful bKash log found.');
        }

    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

inspectSuccessLog();
