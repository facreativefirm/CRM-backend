import prisma from '../config/database';
import { Prisma } from '@prisma/client';

export class MarketingService {
    /**
     * Track a referral click (anonymous)
     */
    static async trackClick(referralCode: string, ipAddress: string) {
        const affiliate = await prisma.affiliate.findUnique({
            where: { referralCode }
        });

        if (!affiliate) return null;

        // Logic for tracking clicks could be added here
        // For now, we'll just return the affiliate
        return affiliate;
    }

    /**
     * Process a new referral (when referred user registers)
     */
    static async processReferral(affiliateId: number, referredClientId: number) {
        return await prisma.affiliateReferral.create({
            data: {
                affiliateId,
                referredClientId,
                commissionAmount: 0, // Initially 0 until an order is placed
                status: 'PENDING'
            }
        });
    }

    /**
     * Calculate and award commission on order payment
     */
    static async awardCommission(orderId: number, txClient?: Prisma.TransactionClient) {
        const client = txClient || prisma;
        const order = await client.order.findUnique({
            where: { id: orderId },
            include: { client: { include: { referredAffiliates: true } } }
        });

        if (!order || order.totalAmount.equals(0)) return;

        // Find if this client was referred
        const referral = await client.affiliateReferral.findFirst({
            where: {
                referredClientId: order.clientId,
                status: 'PENDING'
            },
            include: { affiliate: true }
        });

        if (!referral) return;

        const commission = (order.totalAmount as any as number) * (referral.affiliate.commissionRate as any as number / 100);

        if (txClient) {
            // 1. Update referral record
            await txClient.affiliateReferral.update({
                where: { id: referral.id },
                data: {
                    commissionAmount: new Prisma.Decimal(commission),
                    referredOrderId: order.id,
                    status: 'APPROVED'
                }
            });

            // 2. Update affiliate balances
            await txClient.affiliate.update({
                where: { id: referral.affiliateId },
                data: {
                    totalEarnings: { increment: new Prisma.Decimal(commission) },
                    pendingEarnings: { increment: new Prisma.Decimal(commission) }
                }
            });
            return;
        }

        return await prisma.$transaction(async (tx) => {
            // 1. Update referral record
            await tx.affiliateReferral.update({
                where: { id: referral.id },
                data: {
                    commissionAmount: new Prisma.Decimal(commission),
                    referredOrderId: order.id,
                    status: 'APPROVED'
                }
            });

            // 2. Update affiliate balances
            await tx.affiliate.update({
                where: { id: referral.affiliateId },
                data: {
                    totalEarnings: { increment: new Prisma.Decimal(commission) },
                    pendingEarnings: { increment: new Prisma.Decimal(commission) }
                }
            });
        });
    }

    /**
     * Track Link Campaign
     */
    static async trackCampaignClick(campaign: string, source?: string, medium?: string) {
        const link = await prisma.linkTracking.findFirst({
            where: { campaign, source, medium }
        });

        if (link) {
            await prisma.linkTracking.update({
                where: { id: link.id },
                data: { clicks: { increment: 1 } }
            });
        } else {
            await prisma.linkTracking.create({
                data: {
                    url: '/', // Default
                    campaign,
                    source,
                    medium,
                    clicks: 1
                }
            });
        }
    }
}
