import prisma from '../src/config/database';
import nagadService from '../src/services/nagad.service';
import logger from '../src/utils/logger';

async function repairNagadRefunds() {
    console.log('🚀 Starting Nagad Refund Repair Tool...');

    try {
        // Find Nagad transactions that are "REFUNDED" status internally but have no SUCCESS refund log
        const transactions = await prisma.transaction.findMany({
            where: {
                gateway: 'NAGAD_AUTO',
                status: 'SUCCESS',
                refunds: {
                    some: {
                        status: 'COMPLETED'
                    }
                }
            },
            include: {
                refunds: true
            }
        });

        console.log(`Found ${transactions.length} Nagad transactions with completed refunds in DB.`);

        for (const tx of transactions) {
            const refund = tx.refunds.find(r => r.status === 'COMPLETED');
            if (!refund) continue;

            const paymentRefId = tx.transactionId as string;

            // Check if we already have a success refund log
            const existingRefundLog = await prisma.gatewayLog.findFirst({
                where: {
                    gateway: 'NAGAD_AUTO',
                    status: 'SUCCESS',
                    transactionId: `REF-${paymentRefId}`
                }
            });

            if (existingRefundLog) {
                // False success check: If it contains HTML, it failed!
                if (existingRefundLog.responseData && (existingRefundLog.responseData.includes('<html') || existingRefundLog.responseData.includes('<!DOCTYPE'))) {
                    console.log(`⚠️  Found false positive SUCCESS log for #${tx.id} (contains HTML). Re-triggering...`);
                    // Continue to re-trigger
                } else {
                    console.log(`✅ Refund for Transaction #${tx.id} (${paymentRefId}) already processed via API.`);
                    continue;
                }
            }

            console.log(`⚠️  Refund for Transaction #${tx.id} is STUCK (Log failed/rejected). Re-triggering...`);

            // Find initiation log to get Nagad Order ID
            const paymentLog = await prisma.gatewayLog.findFirst({
                where: {
                    gateway: 'NAGAD_AUTO',
                    transactionId: paymentRefId,
                    status: 'SUCCESS'
                }
            });

            if (!paymentLog || !paymentLog.responseData) {
                console.error(`❌ Could not find original Nagad session for Transaction #${tx.id}.`);
                continue;
            }

            const responseData = JSON.parse(paymentLog.responseData);
            const verificationResult = responseData.verificationResult || responseData;
            const nagadOrderId = verificationResult.orderId || verificationResult.nagadOrderId;

            if (!nagadOrderId) {
                console.error(`❌ Could not find Nagad Order ID for Transaction #${tx.id}.`);
                continue;
            }

            console.log(`Calling Nagad Refund API for Ref: ${paymentRefId}, Order: ${nagadOrderId}, Amount: ${refund.amount}...`);

            try {
                const result = await nagadService.refundPayment(
                    paymentRefId,
                    parseFloat(refund.amount.toString()),
                    nagadOrderId,
                    refund.reason || 'Stuck refund repair'
                );

                console.log(`✅ SUCCESS! Nagad Response: ${JSON.stringify(result)}`);

                // Log the success
                await prisma.gatewayLog.create({
                    data: {
                        gateway: 'NAGAD_AUTO',
                        transactionId: `REF-${paymentRefId}`,
                        status: 'SUCCESS',
                        requestData: JSON.stringify({
                            type: 'REFUND',
                            repair: true,
                            originalPaymentRefId: paymentRefId,
                            nagadOrderId: nagadOrderId,
                            refundAmount: refund.amount
                        }),
                        responseData: JSON.stringify(result)
                    }
                });

            } catch (apiError: any) {
                console.error(`❌ API ERROR for Transaction #${tx.id}: ${apiError.message}`);
            }
        }

    } catch (error) {
        console.error('System Error:', error);
    } finally {
        await prisma.$disconnect();
        console.log('🏁 Repair process finished.');
    }
}

repairStuckRefunds();

// Rename to match the actual function name if I made a typo
async function repairStuckRefunds() {
    await repairNagadRefunds();
}
