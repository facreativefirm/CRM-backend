import prisma from '../config/database';
import { Prisma, UserType } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';
import fs from 'fs';
import path from 'path';
import { sendEmail, EmailTemplates } from './email.service';

export class InvestorService {
    /**
     * Distribute commissions to all active investors for a paid invoice.
     * Calculated based on the invoice subtotal (excluding tax).
     */
    static async distributeCommissions(invoiceId: number, invoiceSubtotal: any, tx?: Prisma.TransactionClient) {
        const db = tx || prisma;
        const logFile = path.join(process.cwd(), 'investor_dist.log');
        const log = (msg: string) => {
            const entry = `[${new Date().toISOString()}] ${msg}\n`;
            try { fs.appendFileSync(logFile, entry); } catch (e) { }
            console.log(msg);
        };

        try {
            log(`Starting distribution for Invoice #${invoiceId}, Subtotal: ${invoiceSubtotal}`);
            // Ensure subtotal is a Decimal
            const subtotal = new Prisma.Decimal(invoiceSubtotal || 0);

            if (subtotal.lte(0)) {
                log(`[InvestorService] Skipping distribution for invoice #${invoiceId} as subtotal is ${subtotal}`);
                return;
            }

            // Fetch all active investors
            const investors = await db.investor.findMany({
                where: { status: 'ACTIVE' }
            });

            if (!investors || investors.length === 0) {
                log('[InvestorService] No active investors found.');
                return;
            }

            log(`[InvestorService] Distributing commissions for Invoice #${invoiceId} (Subtotal: ${subtotal}) to ${investors.length} investors.`);

            for (const investor of investors) {
                try {
                    let commissionAmount = new Prisma.Decimal(0);

                    if (investor.commissionType === 'PERCENTAGE') {
                        commissionAmount = subtotal.mul(investor.commissionValue).div(100);
                    } else {
                        commissionAmount = investor.commissionValue;
                    }

                    if (commissionAmount.lte(0)) {
                        log(`[InvestorService] Commission for investor ${investor.id} is 0, skipping.`);
                        continue;
                    }

                    // Record Commission
                    await db.investorCommission.create({
                        data: {
                            investorId: investor.id,
                            invoiceId: invoiceId,
                            invoiceAmount: subtotal,
                            commissionAmount: commissionAmount,
                            status: 'PAID'
                        }
                    });

                    // Update Investor Balance
                    await db.investor.update({
                        where: { id: investor.id },
                        data: {
                            totalEarnings: { increment: commissionAmount },
                            walletBalance: { increment: commissionAmount }
                        }
                    });

                    log(`[InvestorService] Commission of ${commissionAmount} successfully awarded to Investor ID ${investor.id}`);
                } catch (innerError: any) {
                    log(`[InvestorService] Error awarding commission to investor ${investor.id}: ${innerError.message}`);
                }
            }
        } catch (error: any) {
            log(`[InvestorService] Global distribution error for Invoice #${invoiceId}: ${error.message}`);
        }
    }

    /**
     * Get Investor Stats
     */
    static async getStats(userId: number) {
        const investor = await prisma.investor.findUnique({
            where: { userId },
            include: { user: { select: { firstName: true, lastName: true, email: true } } }
        });

        if (!investor) throw new AppError('Investor profile not found', 404);

        const recentCommissions = await prisma.investorCommission.findMany({
            where: { investorId: investor.id },
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: { invoice: { select: { invoiceNumber: true } } }
        });

        return {
            ...investor,
            recentCommissions
        };
    }

    /**
     * Get Commissions with Pagination
     */
    static async getCommissions(userId: number, page: number = 1, limit: number = 10) {
        const investor = await prisma.investor.findUnique({ where: { userId } });
        if (!investor) throw new AppError('Investor profile not found', 404);

        const skip = (page - 1) * limit;
        const [commissions, total] = await Promise.all([
            prisma.investorCommission.findMany({
                where: { investorId: investor.id },
                include: { invoice: { select: { invoiceNumber: true, status: true, paidDate: true } } },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.investorCommission.count({ where: { investorId: investor.id } })
        ]);

        return { commissions, total, page, totalPages: Math.ceil(total / limit) };
    }

    /**
     * Request a Payout
     */
    static async requestPayout(userId: number, amount: number, method: string, details: string) {
        const investor = await prisma.investor.findUnique({ where: { userId } });
        if (!investor) throw new AppError('Investor profile not found', 404);

        const amountDecimal = new Prisma.Decimal(amount);

        if (amountDecimal.lessThan(10)) throw new AppError('Minimum withdrawal amount is $10.00', 400);
        if (investor.walletBalance.lessThan(amountDecimal)) throw new AppError('Insufficient funds', 400);

        // Create Payout Request
        const payout = await prisma.investorPayout.create({
            data: {
                investorId: investor.id,
                amount: amountDecimal,
                method,
                details,
                status: 'PENDING'
            }
        });

        // Deduct from Wallet immediately (pending balance logic could be added, but this is simpler)
        await prisma.investor.update({
            where: { id: investor.id },
            data: {
                walletBalance: { decrement: amountDecimal },
                pendingEarnings: { increment: amountDecimal } // Using pendingEarnings field to track requested funds
            }
        });

        // Send Emails
        try {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (user && user.email) {
                const { subject, body } = EmailTemplates.payoutRequested(`$${amount.toFixed(2)}`, method);
                await sendEmail(user.email, subject, body);

                // Notify Admins
                const admins = await prisma.user.findMany({
                    where: { userType: { in: [UserType.ADMIN, UserType.SUPER_ADMIN] }, status: 'ACTIVE' },
                    select: { email: true }
                });

                const adminNotification = EmailTemplates.adminPayoutNotification(
                    `${user.firstName} ${user.lastName}`,
                    `$${amount.toFixed(2)}`,
                    method,
                    'Investor'
                );

                for (const admin of admins) {
                    if (admin.email) {
                        try {
                            await sendEmail(admin.email, adminNotification.subject, adminNotification.body);
                        } catch (sendErr) {
                            console.error(`Failed to send investor payout notification to admin ${admin.email}:`, sendErr);
                        }
                    }
                }
            }
        } catch (emailError) {
            console.error('Failed to send payout request emails:', emailError);
        }

        return payout;
    }

    /**
     * Get Payouts History
     */
    static async getPayouts(userId: number) {
        const investor = await prisma.investor.findUnique({ where: { userId } });
        if (!investor) throw new AppError('Investor profile not found', 404);

        return await prisma.investorPayout.findMany({
            where: { investorId: investor.id },
            orderBy: { createdAt: 'desc' }
        });
    }

    /**
     * Admin: Get All Payouts
     */
    static async getAllPayouts() {
        return await prisma.investorPayout.findMany({
            include: {
                investor: {
                    include: {
                        user: { select: { firstName: true, lastName: true, email: true } }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    // --- Admin Methods ---

    /**
     * Admin: Get All Investors
     */
    static async getAllInvestors() {
        return await prisma.investor.findMany({
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        username: true
                    }
                }
            },
            orderBy: { joinedAt: 'desc' }
        });
    }

    /**
     * Admin: Update Investor Settings
     */
    static async updateInvestorSettings(investorId: number, commissionType: string, commissionValue: number, status: string) {
        return await prisma.investor.update({
            where: { id: investorId },
            data: {
                commissionType,
                commissionValue: new Prisma.Decimal(commissionValue),
                status
            }
        });
    }

    /**
     * Admin: Approve Payout
     */
    static async approvePayout(payoutId: number, transactionId: string) {
        return await prisma.$transaction(async (tx) => {
            const payout = await tx.investorPayout.findUnique({ where: { id: payoutId } });
            if (!payout || payout.status !== 'PENDING') throw new AppError('Invalid payout request', 400);

            // Mark as PAID
            await tx.investorPayout.update({
                where: { id: payoutId },
                data: { status: 'PAID', transactionId, processedAt: new Date() }
            });

            // Update Investor stats
            await tx.investor.update({
                where: { id: payout.investorId },
                data: {
                    pendingEarnings: { decrement: payout.amount },
                    paidEarnings: { increment: payout.amount }
                }
            });

            // Send Emails
            try {
                const fullPayout = await tx.investorPayout.findUnique({
                    where: { id: payoutId },
                    include: { investor: { include: { user: true } } }
                });

                if (fullPayout?.investor?.user?.email) {
                    const { subject, body } = EmailTemplates.payoutProcessed(
                        `$${payout.amount.toFixed(2)}`,
                        'PAID',
                        `Transaction ID: ${transactionId}`
                    );
                    await sendEmail(fullPayout.investor.user.email, subject, body);

                    // Notify Admins
                    const admins = await tx.user.findMany({
                        where: { userType: { in: [UserType.ADMIN, UserType.SUPER_ADMIN] }, status: 'ACTIVE' },
                        select: { email: true }
                    });

                    const adminNotification = EmailTemplates.adminTransitionNotification(
                        'Payout Processed (Investor)',
                        `Investor: ${fullPayout.investor.user.firstName} ${fullPayout.investor.user.lastName}\nAmount: $${payout.amount.toFixed(2)}\nStatus: PAID\nTransaction: ${transactionId}`
                    );

                    for (const admin of admins) {
                        if (admin.email) {
                            try {
                                await sendEmail(admin.email, adminNotification.subject, adminNotification.body);
                            } catch (sendErr) {
                                console.error(`Failed to send investor payout approval notification to admin ${admin.email}:`, sendErr);
                            }
                        }
                    }
                }
            } catch (emailError) {
                console.error('Failed to send payout approval emails:', emailError);
            }

            return payout;
        });
    }

    /**
     * Admin: Reject Payout
     */
    static async rejectPayout(payoutId: number, reason: string) {
        return await prisma.$transaction(async (tx) => {
            const payout = await tx.investorPayout.findUnique({ where: { id: payoutId } });
            if (!payout || payout.status !== 'PENDING') throw new AppError('Invalid payout request', 400);

            // Mark as REJECTED
            await tx.investorPayout.update({
                where: { id: payoutId },
                data: { status: 'REJECTED', details: `${payout.details} | Rejection Reason: ${reason}` }
            });

            // Refund to Wallet
            await tx.investor.update({
                where: { id: payout.investorId },
                data: {
                    walletBalance: { increment: payout.amount },
                    pendingEarnings: { decrement: payout.amount }
                }
            });

            // Send Emails
            try {
                const fullPayout = await tx.investorPayout.findUnique({
                    where: { id: payoutId },
                    include: { investor: { include: { user: true } } }
                });

                if (fullPayout?.investor?.user?.email) {
                    const { subject, body } = EmailTemplates.payoutProcessed(
                        `$${payout.amount.toFixed(2)}`,
                        'REJECTED',
                        reason
                    );
                    await sendEmail(fullPayout.investor.user.email, subject, body);
                }
            } catch (emailError) {
                console.error('Failed to send payout rejection email:', emailError);
            }

            return payout;
        });
    }
}
