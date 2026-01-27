import { Request, Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { salesTeamService } from '../services/salesTeam.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { UserType, VerificationStatus, WithdrawalStatus } from '@prisma/client';

export const registerMember = async (req: AuthRequest, res: Response) => {
    try {
        const { userId, employeeId, territory, department } = req.body;

        const existingUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!existingUser) throw new AppError('User not found', 404);

        // Check if member exists, might throw if table doesn't exist yet
        let existingMember;
        try {
            existingMember = await prisma.salesTeamMember.findUnique({ where: { userId } });
        } catch (e) { existingMember = null; }

        if (existingMember) throw new AppError('User is already a sales team member', 400);

        const member = await prisma.salesTeamMember.create({
            data: {
                userId,
                employeeId,
                territory,
                department
            }
        });

        res.status(201).json({ status: 'success', data: member });
    } catch (err) {
        console.error(err);
        if (err instanceof AppError) throw err;
        throw new AppError('Failed to register member', 500);
    }
};

export const getMyStats = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) throw new AppError('User not authenticated', 401);

        const member = await prisma.salesTeamMember.findUnique({
            where: { userId },
            include: { user: { select: { firstName: true, lastName: true, email: true } } }
        });

        if (!member) throw new AppError('Member profile not found', 404);

        res.json({ status: 'success', data: member });
    } catch (err) {
        console.error(err);
        if (err instanceof AppError) throw err;
        throw new AppError('Failed to fetch member stats', 500);
    }
};

export const getMemberStats = async (req: AuthRequest, res: Response) => {
    try {
        const memberId = parseInt(req.params.id as string);

        // Security check: only allow self or admin
        if (req.user?.userType !== UserType.SUPER_ADMIN && req.user?.userType !== UserType.ADMIN) {
            const currentUserMember = await prisma.salesTeamMember.findUnique({ where: { userId: req.user?.id } });
            if (!currentUserMember || currentUserMember.id !== memberId) {
                throw new AppError('Unauthorized access to stats', 403);
            }
        }

        const member = await prisma.salesTeamMember.findUnique({
            where: { id: memberId },
            include: { user: { select: { firstName: true, lastName: true, email: true } } }
        });

        if (!member) throw new AppError('Member not found', 404);

        res.json({ status: 'success', data: member });
    } catch (err) {
        console.error(err);
        if (err instanceof AppError) throw err;
        throw new AppError('Failed to fetch member stats', 500);
    }
};

export const submitProspect = async (req: AuthRequest, res: Response) => {
    try {
        const {
            companyName, contactPerson, email, phone,
            address, gpsLatitude, gpsLongitude,
            surveys, proofs
        } = req.body;

        const userId = req.user?.id;
        if (!userId) throw new AppError('User not authenticated', 401);

        const member = await prisma.salesTeamMember.findUnique({ where: { userId } });
        if (!member) throw new AppError('You are not a registered sales team member', 403);

        const result = await prisma.$transaction(async (tx) => {
            // Create Prospect
            const prospect = await tx.prospectClient.create({
                data: {
                    salesMemberId: member.id,
                    companyName,
                    contactPerson,
                    email,
                    phone,
                    address,
                    gpsLatitude,
                    gpsLongitude,
                    ...surveys
                }
            });

            // Create Proofs
            if (proofs && Array.isArray(proofs)) {
                await tx.proofSubmission.createMany({
                    data: proofs.map((p: any) => ({
                        prospectId: prospect.id,
                        submittedById: member.id,
                        proofType: p.type,
                        fileUrl: p.url,
                        gpsLatitude: p.gpsLatitude || gpsLatitude,
                        gpsLongitude: p.gpsLongitude || gpsLongitude,
                        metadata: JSON.stringify(p.metadata)
                    }))
                });
            }
            return prospect;
        });

        res.status(201).json({ status: 'success', data: result });
    } catch (err) {
        console.error(err);
        if (err instanceof AppError) throw err;
        throw new AppError('Failed to submit prospect', 500);
    }
};

export const getMyProspects = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) throw new AppError('User not authenticated', 401);

        const member = await prisma.salesTeamMember.findUnique({ where: { userId } });
        if (!member) throw new AppError('You are not a registered sales team member', 403);

        const prospects = await prisma.prospectClient.findMany({
            where: { salesMemberId: member.id },
            orderBy: { createdAt: 'desc' },
            include: {
                proofSubmissions: {
                    select: { id: true, proofType: true, fileUrl: true }
                }
            }
        });

        res.json({ status: 'success', data: prospects });
    } catch (err) {
        console.error(err);
        if (err instanceof AppError) throw err;
        throw new AppError('Failed to fetch prospects', 500);
    }
};

export const getMyTransactions = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) throw new AppError('User not authenticated', 401);

        const member = await prisma.salesTeamMember.findUnique({ where: { userId } });
        if (!member) throw new AppError('Member not found', 404);

        const transactions = await prisma.pointTransaction.findMany({
            where: { salesMemberId: member.id },
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        res.json({ status: 'success', data: transactions });
    } catch (err) {
        console.error(err);
        if (err instanceof AppError) throw err;
        throw new AppError('Failed to fetch transactions', 500);
    }
};

export const verifyProspect = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        const adminId = req.user?.id;

        if (!adminId) throw new AppError('Unauthorized', 401);

        if (status === 'APPROVED') {
            await salesTeamService.awardProspectPoints(parseInt(id as string), adminId);
            res.json({ status: 'success', message: 'Prospect verified and points awarded' });
        } else if (status === 'REJECTED') {
            await prisma.prospectClient.update({
                where: { id: parseInt(id as string) },
                data: {
                    verificationStatus: VerificationStatus.REJECTED,
                    verifiedById: adminId,
                    verifiedAt: new Date(),
                    notes: notes ? `Rejection Reason: ${notes}` : undefined
                }
            });
            res.json({ status: 'success', message: 'Prospect verification rejected' });
        } else {
            throw new AppError('Invalid status', 400);
        }
    } catch (err) {
        console.error(err);
        if (err instanceof AppError) throw err;
        throw new AppError('Failed to verify prospect', 500);
    }
};

export const flagFraud = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.user?.id;
        if (!adminId) throw new AppError('Unauthorized', 401);
        await salesTeamService.flagFraud(parseInt(id as string), reason, adminId);
        res.json({ status: 'success', message: 'Marked as fraud and penalty applied' });
    } catch (err) {
        console.error(err);
        if (err instanceof AppError) throw err;
        throw new AppError('Failed to flag fraud', 500);
    }
};

export const requestWithdrawal = async (req: AuthRequest, res: Response) => {
    try {
        const { points, paymentMethod, paymentDetails } = req.body;
        const userId = req.user?.id;

        const member = await prisma.salesTeamMember.findUnique({ where: { userId } });
        if (!member) throw new AppError('Member not found', 404);

        const request = await salesTeamService.createWithdrawalRequest(
            member.id,
            parseFloat(points),
            paymentMethod,
            paymentDetails
        );

        res.status(201).json({ status: 'success', data: request });
    } catch (err) {
        console.error(err);
        if (err instanceof AppError) throw err;
        throw new AppError('Failed to request withdrawal', 500);
    }
};

export const getMyWithdrawals = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) throw new AppError('User not authenticated', 401);

        const member = await prisma.salesTeamMember.findUnique({ where: { userId } });
        if (!member) throw new AppError('Member not found', 404);

        const requests = await prisma.withdrawalRequest.findMany({
            where: { salesMemberId: member.id },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ status: 'success', data: requests });
    } catch (err) {
        console.error(err);
        if (err instanceof AppError) throw err;
        throw new AppError('Failed to fetch withdrawal requests', 500);
    }
};

export const processWithdrawal = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { status, notes, transactionReference } = req.body;
        const adminId = req.user?.id;

        if (!adminId) throw new AppError('Unauthorized', 401);

        const withdrawalStatus = status as WithdrawalStatus;
        // Validate enum
        if (!Object.values(WithdrawalStatus).includes(withdrawalStatus)) {
            throw new AppError('Invalid status', 400);
        }

        const result = await salesTeamService.processWithdrawal(
            parseInt(id as string),
            adminId,
            withdrawalStatus,
            notes,
            transactionReference
        );

        res.json({ status: 'success', data: result });
    } catch (err) {
        console.error(err);
        if (err instanceof AppError) throw err;
        throw new AppError('Failed to process withdrawal', 500);
    }
};

export const getLeaderboard = async (req: AuthRequest, res: Response) => {
    try {
        // Optional: Restricted to Sales Team or Admin?
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
        const leaderboard = await salesTeamService.getLeaderboard(limit);
        res.json({ status: 'success', data: leaderboard });
    } catch (err) {
        console.error("Error in getLeaderboard:", err);
        // Fallback to empty list to prevent UI crash if DB is not ready
        res.json({ status: 'success', data: [] });
    }
};

export const getTerritoryPerformance = async (req: AuthRequest, res: Response) => {
    try {
        // Admin only
        if (req.user?.userType !== UserType.SUPER_ADMIN && req.user?.userType !== UserType.ADMIN) {
            throw new AppError('Unauthorized', 403);
        }
        const performance = await salesTeamService.getTerritoryPerformance();
        res.json({ status: 'success', data: performance });
    } catch (err) {
        console.error("Error in getTerritoryPerformance:", err);
        // Fallback to empty list to prevent UI crash if DB is not ready
        res.json({ status: 'success', data: [] });
    }
};

export const getAllProspects = async (req: AuthRequest, res: Response) => {
    try {
        if (req.user?.userType !== UserType.SUPER_ADMIN && req.user?.userType !== UserType.ADMIN) {
            throw new AppError('Unauthorized', 403);
        }

        const prospects = await prisma.prospectClient.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                salesMember: {
                    include: { user: { select: { firstName: true, lastName: true, email: true } } }
                },
                proofSubmissions: true
            }
        });

        res.json({ status: 'success', data: prospects });
    } catch (err) {
        console.error("Error in getAllProspects:", err);
        // Fallback to empty list to prevent UI crash if DB is not ready
        res.json({ status: 'success', data: [] });
    }
};

export const getAllWithdrawals = async (req: AuthRequest, res: Response) => {
    try {
        if (req.user?.userType !== UserType.SUPER_ADMIN && req.user?.userType !== UserType.ADMIN) {
            throw new AppError('Unauthorized', 403);
        }

        const requests = await prisma.withdrawalRequest.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                salesMember: {
                    include: { user: { select: { firstName: true, lastName: true, email: true } } }
                }
            }
        });

        res.json({ status: 'success', data: requests });
    } catch (err) {
        console.error("Error in getAllWithdrawals:", err);
        // Fallback to empty list to prevent UI crash if DB is not ready
        res.json({ status: 'success', data: [] });
    }
};
