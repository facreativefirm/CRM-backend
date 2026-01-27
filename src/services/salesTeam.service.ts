import prisma from '../config/database';
import {
    ProspectStatus,
    VerificationStatus,
    PointTransactionType,
    WithdrawalStatus,
    SalesTeamStatus,
    ProofType,
    UserType
} from '@prisma/client';
import { AppError } from '../middleware/error.middleware';
import { sendEmail, EmailTemplates } from './email.service';

export class SalesTeamService {
    // --- Points System Constants ---
    static readonly POINTS_PER_PROSPECT = 1;
    static readonly POINTS_PER_CONVERSION = 10;
    static readonly POINTS_FRAUD_PENALTY = 10;

    /**
     * Calculate and award points for a verified prospect
     */
    async awardProspectPoints(prospectId: number, verifierId?: number, txClient?: any) {
        const prismaClient = txClient || prisma;
        const logic = async (tx: any) => {
            const prospect = await tx.prospectClient.findUnique({
                where: { id: prospectId },
                include: { salesMember: true }
            });

            if (!prospect) throw new AppError('Prospect not found', 404);
            if (prospect.pointsAwarded.toNumber() > 0) {
                throw new AppError('Points already awarded for this prospect', 400);
            }

            // Update prospect status
            await tx.prospectClient.update({
                where: { id: prospectId },
                data: {
                    verificationStatus: VerificationStatus.APPROVED,
                    verifiedById: verifierId,
                    verifiedAt: new Date(),
                    status: ProspectStatus.VERIFIED,
                    pointsAwarded: SalesTeamService.POINTS_PER_PROSPECT
                }
            });

            // Create transaction
            await tx.pointTransaction.create({
                data: {
                    salesMemberId: prospect.salesMemberId,
                    prospectId: prospect.id,
                    transactionType: PointTransactionType.PROSPECT_ENTRY,
                    points: SalesTeamService.POINTS_PER_PROSPECT,
                    balanceBefore: prospect.salesMember.availablePoints,
                    balanceAfter: Number(prospect.salesMember.availablePoints) + SalesTeamService.POINTS_PER_PROSPECT,
                    reason: 'Prospect Verification Approved',
                    processedById: verifierId
                }
            });

            // Update Member Points
            await tx.salesTeamMember.update({
                where: { id: prospect.salesMemberId },
                data: {
                    totalPoints: { increment: SalesTeamService.POINTS_PER_PROSPECT },
                    availablePoints: { increment: SalesTeamService.POINTS_PER_PROSPECT },
                    totalProspects: { increment: 1 } // Increment valid prospects count
                }
            });

            return true;
        };
        return txClient ? await logic(txClient) : await prisma.$transaction(logic);
    }

    /**
     * Award points when a prospect converts to a client
     */
    async awardConversionBonus(prospectId: number, clientId: number, txClient?: any) {
        const prismaClient = txClient || prisma;
        const logic = async (tx: any) => {
            const prospect = await tx.prospectClient.findUnique({
                where: { id: prospectId },
                include: { salesMember: true }
            });

            if (!prospect) throw new AppError('Prospect not found', 404);
            if (prospect.conversionPointsAwarded.toNumber() > 0) return; // Already awarded

            // Update prospect
            await tx.prospectClient.update({
                where: { id: prospectId },
                data: {
                    status: ProspectStatus.CONVERTED,
                    convertedToClientId: clientId,
                    convertedAt: new Date(),
                    conversionPointsAwarded: SalesTeamService.POINTS_PER_CONVERSION
                }
            });

            // Create transaction
            await tx.pointTransaction.create({
                data: {
                    salesMemberId: prospect.salesMemberId,
                    prospectId: prospect.id,
                    transactionType: PointTransactionType.CONVERSION_BONUS,
                    points: SalesTeamService.POINTS_PER_CONVERSION,
                    balanceBefore: prospect.salesMember.availablePoints,
                    balanceAfter: Number(prospect.salesMember.availablePoints) + SalesTeamService.POINTS_PER_CONVERSION,
                    reason: 'Prospect Converted to Client'
                }
            });

            // Update Member Stats
            const member = await tx.salesTeamMember.update({
                where: { id: prospect.salesMemberId },
                data: {
                    totalPoints: { increment: SalesTeamService.POINTS_PER_CONVERSION },
                    availablePoints: { increment: SalesTeamService.POINTS_PER_CONVERSION },
                    totalConversions: { increment: 1 }
                }
            });

            // Recalculate conversion rate
            if (member.totalProspects > 0) {
                const rate = (member.totalConversions / member.totalProspects) * 100;
                await tx.salesTeamMember.update({
                    where: { id: member.id },
                    data: { conversionRate: rate }
                });
            }

            return true;
        };
        return txClient ? await logic(txClient) : await prisma.$transaction(logic);
    }

    /**
     * Link a newly registered client to a prospect by email or phone
     */
    async linkProspectToClient(email: string, phone: string, clientId: number, adminId?: number) {
        if (!email) return null;
        const normalizedEmail = email.trim();
        const normalizedPhone = phone ? phone.trim() : undefined;

        console.log(`[SalesTeam] Attempting to link prospect for Client ID ${clientId}. Email: ${normalizedEmail}, Phone: ${normalizedPhone}`);

        // Find a prospect that matches email or phone
        // We pick up both PENDING and APPROVED prospects to ensure rewards are triggered.
        const prospect = await prisma.prospectClient.findFirst({
            where: {
                OR: [
                    { email: normalizedEmail },
                    ...(normalizedPhone ? [{ phone: normalizedPhone }] : [])
                ],
                status: { not: ProspectStatus.CONVERTED },
                verificationStatus: { in: [VerificationStatus.PENDING, VerificationStatus.APPROVED] }
            }
        });

        if (prospect) {
            console.log(`[SalesTeam] MATCH FOUND! Linking Prospect ${prospect.id} to Client ${clientId}`);

            // 1. If it was PENDING, auto-verify it (awards 1 point)
            if (prospect.verificationStatus === VerificationStatus.PENDING) {
                console.log(`[SalesTeam] Auto-verifying prospect ${prospect.id} during matching`);
                try {
                    await this.awardProspectPoints(prospect.id, adminId);
                } catch (e) {
                    console.error(`[SalesTeam] Auto-verification failed:`, e);
                }
            }

            // 2. Update Link and Status
            await prisma.prospectClient.update({
                where: { id: prospect.id },
                data: {
                    convertedToClientId: clientId,
                    status: ProspectStatus.CONTACTED
                }
            });
            return prospect;
        }
        console.log(`[SalesTeam] No matching prospect found for Client ID ${clientId}`);
        return null;
    }

    /**
     * Process order and award conversion bonus if client was a prospect
     */
    async processOrderConversion(orderId: number, tx: any) {
        const order = await tx.order.findUnique({
            where: { id: orderId },
            include: { client: true }
        });

        if (!order) return;

        // Find if this client is a linked prospect
        const prospect = await tx.prospectClient.findUnique({
            where: { convertedToClientId: order.clientId }
        });

        if (prospect && prospect.status !== ProspectStatus.CONVERTED) {
            console.log(`[SalesTeam] Awarding conversion bonus for order ${orderId} (Client ${order.clientId}, Prospect ${prospect.id})`);
            // Award the bonus points
            await this.awardConversionBonus(prospect.id, order.clientId, tx);
        }
    }

    /**
     * Flag a prospect as fraud and deduct points
     */
    async flagFraud(prospectId: number, reason: string, adminId: number) {
        return await prisma.$transaction(async (tx) => {
            const prospect = await tx.prospectClient.findUnique({
                where: { id: prospectId },
                include: { salesMember: true }
            });

            if (!prospect) throw new AppError('Prospect not found', 404);

            // Mark as fraud
            await tx.prospectClient.update({
                where: { id: prospectId },
                data: {
                    status: ProspectStatus.FRAUD,
                    fraudFlag: true,
                    fraudReason: reason,
                    verificationStatus: VerificationStatus.REJECTED,
                    verifiedById: adminId,
                    verifiedAt: new Date()
                }
            });

            // Deduct points (Penalty)
            const penalty = SalesTeamService.POINTS_FRAUD_PENALTY;

            await tx.pointTransaction.create({
                data: {
                    salesMemberId: prospect.salesMemberId,
                    prospectId: prospect.id,
                    transactionType: PointTransactionType.FRAUD_DEDUCTION,
                    points: -penalty,
                    balanceBefore: prospect.salesMember.availablePoints,
                    balanceAfter: Number(prospect.salesMember.availablePoints) - penalty,
                    reason: `Fraud Penalty: ${reason}`,
                    processedById: adminId
                }
            });

            // Update Member Stats
            await tx.salesTeamMember.update({
                where: { id: prospect.salesMemberId },
                data: {
                    availablePoints: { decrement: penalty },
                    fraudCount: { increment: 1 }
                }
            });

            return true;
        });
    }

    /**
     * Create a withdrawal request
     */
    async createWithdrawalRequest(memberId: number, points: number, paymentMethod: string, paymentDetails: any) {
        return await prisma.$transaction(async (tx) => {
            const member = await tx.salesTeamMember.findUnique({
                where: { id: memberId }
            });

            if (!member) throw new AppError('Member not found', 404);
            if (Number(member.availablePoints) < points) {
                throw new AppError('Insufficient points balance', 400);
            }

            // Calculate amount (Assuming 1 Point = 1 Unit Currency for simplicity, can be configurable)
            const currencyRate = 1;
            const amount = points * currencyRate;

            const request = await tx.withdrawalRequest.create({
                data: {
                    requestNumber: `WDR-${Date.now()}-${member.id}`,
                    salesMemberId: memberId,
                    pointsRequested: points,
                    amountInCurrency: amount,
                    paymentMethod,
                    paymentDetails: JSON.stringify(paymentDetails),
                    status: WithdrawalStatus.PENDING
                }
            });

            // Deduct from available points immediately to lock funds.
            // We do NOT increment 'withdrawnPoints' yet; that happens only when PAID.

            await tx.pointTransaction.create({
                data: {
                    salesMemberId: memberId,
                    transactionType: PointTransactionType.WITHDRAWAL,
                    points: -points,
                    balanceBefore: member.availablePoints,
                    balanceAfter: Number(member.availablePoints) - points,
                    reason: `Withdrawal Request ${request.requestNumber}`,
                    metadata: JSON.stringify({ withdrawalId: request.id })
                }
            });

            await tx.salesTeamMember.update({
                where: { id: memberId },
                data: {
                    availablePoints: { decrement: points },
                }
            });

            // Send Emails
            try {
                const user = await tx.user.findUnique({ where: { id: member.userId } });
                if (user && user.email) {
                    const { subject, body } = EmailTemplates.payoutRequested(`${amount.toFixed(2)}`, paymentMethod);
                    await sendEmail(user.email, subject, body);

                    // Notify Admins
                    const admins = await tx.user.findMany({
                        where: { userType: { in: [UserType.ADMIN, UserType.SUPER_ADMIN] }, status: 'ACTIVE' },
                        select: { email: true }
                    });

                    const adminNotification = EmailTemplates.adminPayoutNotification(
                        `${user.firstName} ${user.lastName}`,
                        `${amount.toFixed(2)}`,
                        paymentMethod,
                        'Sales Team Member'
                    );

                    for (const admin of admins) {
                        if (admin.email) {
                            try {
                                await sendEmail(admin.email, adminNotification.subject, adminNotification.body);
                            } catch (sendErr) {
                                console.error(`Failed to send sales team payout request email to admin ${admin.email}:`, sendErr);
                            }
                        }
                    }
                }
            } catch (emailError) {
                console.error('Failed to send sales team payout request emails:', emailError);
            }

            return request;
        });
    }

    /**
     * Process/Approve Withdrawal
     */
    async processWithdrawal(requestId: number, adminId: number, status: WithdrawalStatus, notes?: string, transactionRef?: string) {
        return await prisma.$transaction(async (tx) => {
            const request = await tx.withdrawalRequest.findUnique({
                where: { id: requestId },
                include: { salesMember: true }
            });

            if (!request) throw new AppError('Request not found', 404);
            if (request.status !== WithdrawalStatus.PENDING && request.status !== WithdrawalStatus.PROCESSING) {
                throw new AppError('Request is not in a processable state', 400);
            }

            const updateData: any = {
                status,
                updatedAt: new Date()
            };

            if (status === WithdrawalStatus.PROCESSING || status === WithdrawalStatus.APPROVED) {
                updateData.processedById = adminId;
                updateData.processedAt = new Date();
                if (notes) updateData.processingNotes = notes;
            }

            if (status === WithdrawalStatus.PAID) {
                updateData.paidById = adminId;
                updateData.paidAt = new Date();
                if (transactionRef) updateData.transactionReference = transactionRef;

                // Now we increment the total withdrawn points stat
                await tx.salesTeamMember.update({
                    where: { id: request.salesMemberId },
                    data: {
                        withdrawnPoints: { increment: request.pointsRequested }
                    }
                });
            }

            if (status === WithdrawalStatus.REJECTED) {
                updateData.rejectionReason = notes;
                // Refund points to available balance
                await tx.pointTransaction.create({
                    data: {
                        salesMemberId: request.salesMemberId,
                        transactionType: PointTransactionType.ADMIN_ADJUSTMENT, // Refund
                        points: request.pointsRequested,
                        balanceBefore: request.salesMember.availablePoints,
                        balanceAfter: Number(request.salesMember.availablePoints) + Number(request.pointsRequested),
                        reason: `Refund for Rejected Withdrawal ${request.requestNumber}`
                    }
                });

                await tx.salesTeamMember.update({
                    where: { id: request.salesMemberId },
                    data: {
                        availablePoints: { increment: request.pointsRequested }
                    }
                });
            }

            const updatedRequest = await tx.withdrawalRequest.update({
                where: { id: requestId },
                data: updateData
            });

            // Send Emails
            try {
                const user = await tx.user.findUnique({ where: { id: request.salesMember.userId } });
                if (user && user.email) {
                    const { subject, body } = EmailTemplates.payoutProcessed(
                        `${request.amountInCurrency.toFixed(2)}`,
                        status,
                        notes || transactionRef ? `Notes: ${notes || ''}\nRef: ${transactionRef || ''}` : undefined
                    );
                    await sendEmail(user.email, subject, body);

                    if (status === WithdrawalStatus.PAID) {
                        // Notify Admins
                        const admins = await tx.user.findMany({
                            where: { userType: { in: [UserType.ADMIN, UserType.SUPER_ADMIN] }, status: 'ACTIVE' },
                            select: { email: true }
                        });

                        const adminNotification = EmailTemplates.adminTransitionNotification(
                            'Payout Processed (Sales Team)',
                            `Member: ${user.firstName} ${user.lastName}\nAmount: ${request.amountInCurrency.toFixed(2)}\nStatus: ${status}\nTransaction Ref: ${transactionRef || 'N/A'}`
                        );

                        for (const admin of admins) {
                            if (admin.email) {
                                try {
                                    await sendEmail(admin.email, adminNotification.subject, adminNotification.body);
                                } catch (sendErr) {
                                    console.error(`Failed to send sales team payout notification to admin ${admin.email}:`, sendErr);
                                }
                            }
                        }
                    }
                }
            } catch (emailError) {
                console.error('Failed to send sales team payout processing emails:', emailError);
            }

            return updatedRequest;
        });
    }

    async getLeaderboard(limit = 10) {
        return await prisma.salesTeamMember.findMany({
            take: limit,
            orderBy: [
                { totalPoints: 'desc' },
                { totalConversions: 'desc' }
            ],
            include: {
                user: {
                    select: { firstName: true, lastName: true, email: true }
                }
            }
        });
    }

    async getTerritoryPerformance() {
        const members = await prisma.salesTeamMember.groupBy({
            by: ['territory'],
            _sum: {
                totalPoints: true,
                totalConversions: true,
                totalProspects: true
            },
            _count: {
                id: true
            },
            where: {
                territory: { not: null }
            }
        });
        return members;
    }
}

export const salesTeamService = new SalesTeamService();
