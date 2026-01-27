import prisma from '../config/database';
import { Prisma, CommissionStatus, PayoutStatus, UserType } from '@prisma/client';
import { sendEmail, EmailTemplates } from './email.service';

export class ResellerService {
    /**
     * Calculate and record commission for a reseller when their client pays
     */
    static async handleOrderCommission(orderId: number, tx: Prisma.TransactionClient) {
        const order = await tx.order.findUnique({
            where: { id: orderId },
            include: {
                client: true,
                items: {
                    include: { product: true }
                }
            }
        });

        if (!order || !order.resellerId) return;

        // Check if commission already recorded for this order
        const existingCommission = await tx.resellerCommission.findFirst({
            where: { orderId: order.id }
        });

        if (existingCommission) return;

        const reseller = await tx.user.findUnique({
            where: { id: order.resellerId }
        });

        if (!reseller) return;

        const commissionRate = reseller.commissionRate || new Prisma.Decimal(15.00); // Default 15%

        for (const item of order.items) {
            // Commission is calculated on the price the client paid
            const commissionAmount = item.totalPrice.mul(commissionRate).div(100);

            await tx.resellerCommission.create({
                data: {
                    resellerId: reseller.id,
                    orderId: order.id,
                    clientId: order.clientId,
                    productId: item.productId,
                    orderAmount: item.totalPrice,
                    commissionRate: commissionRate,
                    commissionAmount: commissionAmount,
                    status: CommissionStatus.APPROVED // Auto-approve for now
                }
            });
        }
    }

    /**
     * Process Payout for Reseller
     */
    static async processPayout(payoutId: number, status: PayoutStatus, transactionId?: string) {
        return await prisma.$transaction(async (tx) => {
            const payout = await tx.resellerPayout.update({
                where: { id: payoutId },
                data: {
                    status,
                    transactionId,
                    paidDate: status === 'PAID' ? new Date() : null
                }
            });

            if (status === 'PAID') {
                // Mark associated commissions as PAID
                // We need to find which commissions were intended for this payout.
                // In a real system, you'd link them at request time.
                // For now, let's link APPROVED commissions for this reseller.
                await tx.resellerCommission.updateMany({
                    where: {
                        resellerId: payout.resellerId,
                        status: CommissionStatus.APPROVED
                        // In a more robust system, we would have linked them to the payout record
                    },
                    data: {
                        status: CommissionStatus.PAID,
                        payoutId: payout.id
                    }
                });
            }

            // Send Emails
            try {
                const fullPayout = await tx.resellerPayout.findUnique({
                    where: { id: payoutId },
                    include: { reseller: true }
                });

                if (fullPayout?.reseller?.email) {
                    const { subject, body } = EmailTemplates.payoutProcessed(
                        `${fullPayout.netAmount.toFixed(2)}`,
                        status,
                        transactionId ? `Transaction ID: ${transactionId}` : undefined
                    );
                    await sendEmail(fullPayout.reseller.email, subject, body);

                    if (status === 'PAID') {
                        // Notify Admins
                        const admins = await tx.user.findMany({
                            where: { userType: { in: [UserType.ADMIN, UserType.SUPER_ADMIN] }, status: 'ACTIVE' },
                            select: { email: true }
                        });

                        const adminNotification = EmailTemplates.adminTransitionNotification(
                            'Payout Processed (Reseller)',
                            `Reseller: ${fullPayout.reseller.firstName} ${fullPayout.reseller.lastName}\nAmount: ${fullPayout.netAmount.toFixed(2)}\nStatus: ${status}\nTransaction: ${transactionId || 'N/A'}`
                        );

                        for (const admin of admins) {
                            if (admin.email) {
                                try {
                                    await sendEmail(admin.email, adminNotification.subject, adminNotification.body);
                                } catch (sendErr) {
                                    console.error(`Failed to send reseller payout notification to admin ${admin.email}:`, sendErr);
                                }
                            }
                        }
                    }
                }
            } catch (emailError) {
                console.error('Failed to send reseller payout processing emails:', emailError);
            }

            return payout;
        });
    }
}
