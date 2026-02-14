import prisma from '../src/config/database';

async function testRefundLogicFix() {
    try {
        // Find a bKash transaction that was refunded but didn't actually call the API
        const transaction = await prisma.transaction.findFirst({
            where: {
                gateway: 'BKASH',
                status: 'SUCCESS'
            },
            include: {
                refunds: {
                    where: {
                        status: 'COMPLETED'
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        if (!transaction || !transaction.refunds.length) {
            console.log('No eligible bKash transaction with completed refund found.');
            return;
        }

        const refund = transaction.refunds[0];
        console.log(`Testing logic for Transaction #${transaction.id}, Refund #${refund.id}`);
        console.log(`Transaction ID (trxID): ${transaction.transactionId}`);

        // Try the NEW search logic
        console.log('Searching for log using NEW logic (searching trxID inside responseData)...');
        const gatewayLog = await prisma.gatewayLog.findFirst({
            where: {
                gateway: 'BKASH',
                status: 'SUCCESS',
                responseData: {
                    contains: transaction.transactionId as string
                }
            }
        });

        if (gatewayLog) {
            console.log('✅ SUCCESS: Gateway log found using NEW logic!');
            console.log('PaymentID found in log:', gatewayLog.transactionId);

            const responseData = JSON.parse(gatewayLog.responseData as string);
            console.log('Verified paymentID from JSON:', responseData.paymentID);
            console.log('Verified trxID from JSON:', responseData.trxID);
        } else {
            console.log('❌ FAILURE: Gateway log still not found using NEW logic.');
        }

        // Try OLD search logic (for comparison)
        console.log('\nSearching for log using OLD logic (searching transactionId directly)...');
        const oldLog = await prisma.gatewayLog.findFirst({
            where: {
                transactionId: transaction.transactionId,
                gateway: 'BKASH',
                status: 'SUCCESS'
            }
        });

        if (oldLog) {
            console.log('✅ OLD logic worked? (Surprising)');
        } else {
            console.log('❌ OLD logic failed (Expected)');
        }

    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

testRefundLogicFix();
