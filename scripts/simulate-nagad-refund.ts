import prisma from '../src/config/database';

async function simulateNagadRefundLogic() {
    try {
        const originalTransaction = await prisma.transaction.findFirst({
            where: {
                gateway: 'NAGAD_AUTO',
                status: 'SUCCESS'
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        if (!originalTransaction) {
            console.log('No successful Nagad transaction found.');
            return;
        }

        console.log(`Testing logic for Transaction #${originalTransaction.id}`);
        console.log(`Transaction ID (Ref): ${originalTransaction.transactionId}`);

        const gatewayLog = await prisma.gatewayLog.findFirst({
            where: {
                gateway: 'NAGAD_AUTO',
                transactionId: originalTransaction.transactionId as string,
                status: 'SUCCESS'
            }
        });

        if (gatewayLog) {
            console.log('✅ Found Gateway Log!');
            console.log('Log status:', gatewayLog.status);
            console.log('ResponseData:', gatewayLog.responseData);

            if (gatewayLog.responseData) {
                const responseData = JSON.parse(gatewayLog.responseData as string);
                const verificationResult = responseData.verificationResult || responseData;
                const paymentRefId = originalTransaction.transactionId as string;
                const nagadOrderId = verificationResult.orderId || verificationResult.nagadOrderId;

                console.log('PaymentRefId:', paymentRefId);
                console.log('NagadOrderId:', nagadOrderId);

                if (paymentRefId && nagadOrderId) {
                    console.log('✅ Logic would proceed to call API.');
                } else {
                    console.error('❌ Data missing: paymentRefId or nagadOrderId is null/undefined');
                }
            }
        } else {
            console.error('❌ Gateway Log NOT found!');
        }

    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

simulateNagadRefundLogic();
