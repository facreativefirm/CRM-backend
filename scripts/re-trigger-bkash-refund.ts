import prisma from '../src/config/database';
import bkashService from '../src/services/bkash.service';
import logger from '../src/utils/logger';

async function repairStuckRefunds() {
    console.log('🚀 Starting bKash Refund Repair Tool...');

    try {
        // Find bKash transactions that are "REFUNDED" but have no corresponding successful REFUND log
        const stuckRefunds = await prisma.refund.findMany({
            where: {
                status: 'COMPLETED',
                transaction: {
                    gateway: 'BKASH'
                }
            },
            include: {
                transaction: {
                    include: {
                        invoice: true
                    }
                }
            }
        });

        console.log(`Found ${stuckRefunds.length} bKash refunds to check.`);

        for (const refund of stuckRefunds) {
            const originalTransaction = refund.transaction;
            const invoice = originalTransaction.invoice;

            // Check if we already have a success refund log for this
            const existingRefundLog = await prisma.gatewayLog.findFirst({
                where: {
                    gateway: 'BKASH',
                    status: 'SUCCESS',
                    requestData: {
                        contains: '"type":"REFUND"'
                    },
                    responseData: {
                        contains: originalTransaction.transactionId as string // trxID
                    }
                }
            });

            if (existingRefundLog) {
                console.log(`✅ Refund for Transaction #${originalTransaction.id} (trxID: ${originalTransaction.transactionId}) was already processed via API.`);
                continue;
            }

            console.log(`⚠️  Refund for Transaction #${originalTransaction.id} is STUCK. Processing now...`);

            // Find the original payment log to get paymentID
            const paymentLog = await prisma.gatewayLog.findFirst({
                where: {
                    gateway: 'BKASH',
                    status: 'SUCCESS',
                    responseData: {
                        contains: originalTransaction.transactionId as string
                    }
                }
            });

            if (!paymentLog || !paymentLog.responseData) {
                console.error(`❌ Could not find original bKash session for Transaction #${originalTransaction.id}. Manual refund required.`);
                continue;
            }

            const responseData = JSON.parse(paymentLog.responseData);
            const paymentID = responseData.paymentID;
            const trxID = responseData.trxID;

            if (!paymentID || !trxID) {
                console.error(`❌ Incomplete payment data for Transaction #${originalTransaction.id}.`);
                continue;
            }

            console.log(`Calling bKash Refund API for PaymentID: ${paymentID}, Amount: ${refund.amount}...`);

            try {
                const result = await bkashService.refundPayment({
                    paymentID,
                    amount: parseFloat(refund.amount.toString()),
                    trxID,
                    reason: refund.reason || 'Stuck refund repair',
                    sku: invoice.invoiceNumber
                });

                console.log(`✅ SUCCESS! bKash Refund TrxID: ${result.refundTrxID || result.trxID}`);

                // Log the success
                await prisma.gatewayLog.create({
                    data: {
                        gateway: 'BKASH',
                        transactionId: result.refundTrxID || result.trxID,
                        status: 'SUCCESS',
                        requestData: JSON.stringify({
                            type: 'REFUND',
                            repair: true,
                            originalPaymentID: paymentID,
                            originalTrxID: trxID,
                            refundAmount: refund.amount
                        }),
                        responseData: JSON.stringify(result)
                    }
                });

            } catch (apiError: any) {
                console.error(`❌ API ERROR: ${apiError.message}`);
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
