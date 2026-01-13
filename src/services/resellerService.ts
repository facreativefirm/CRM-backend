import prisma from '../config/database';
import { Prisma, CommissionStatus } from '@prisma/client';

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

        const reseller = await tx.user.findUnique({
            where: { id: order.resellerId }
        });

        if (!reseller || !reseller.commissionRate) return;

        const commissionRate = reseller.commissionRate;

        for (const item of order.items) {
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
                    status: CommissionStatus.PENDING
                }
            });
        }
    }

    /**
     * Process Payout for Reseller
     */
    static async processPayout(resellerId: number, amount: number, method: string) {
        return await prisma.$transaction(async (tx) => {
            const payout = await tx.resellerPayout.create({
                data: {
                    resellerId,
                    payoutPeriodStart: new Date(), // Simpler for now
                    payoutPeriodEnd: new Date(),
                    totalCommissions: new Prisma.Decimal(amount),
                    netAmount: new Prisma.Decimal(amount),
                    paymentMethod: method,
                    status: 'PAID',
                    paidDate: new Date()
                }
            });

            // Mark pending commissions as paid (simplified logic)
            await tx.resellerCommission.updateMany({
                where: {
                    resellerId,
                    status: 'APPROVED'
                },
                data: {
                    status: 'PAID',
                    payoutId: payout.id
                }
            });

            return payout;
        });
    }
}
