import { Request, Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { UserType, CommissionStatus } from '@prisma/client';
import { ResellerService } from '../services/resellerService';

/**
 * Reseller Dashboard Stats
 */
export const getResellerStats = async (req: AuthRequest, res: Response) => {
    if (!req.user || req.user.userType !== UserType.RESELLER) {
        throw new AppError('Only resellers can access this', 403);
    }

    const stats = {
        totalClients: await prisma.client.count({ where: { resellerId: req.user.id } }),
        totalCommissions: await prisma.resellerCommission.aggregate({
            where: { resellerId: req.user.id, status: CommissionStatus.PAID },
            _sum: { commissionAmount: true }
        }),
        pendingCommissions: await prisma.resellerCommission.aggregate({
            where: { resellerId: req.user.id, status: CommissionStatus.PENDING },
            _sum: { commissionAmount: true }
        }),
        clients: await prisma.client.findMany({
            where: { resellerId: req.user.id },
            include: { user: true },
            take: 5,
            orderBy: { createdAt: 'desc' }
        })
    };

    res.status(200).json({ status: 'success', data: { stats } });
};

/**
 * List Reseller Commissions
 */
export const getCommissions = async (req: AuthRequest, res: Response) => {
    const commissions = await prisma.resellerCommission.findMany({
        where: { resellerId: req.user!.id },
        include: { order: true, client: true, product: true },
        orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ status: 'success', data: { commissions } });
};

/**
 * Request Payout (Staff/Admin can process this)
 */
export const requestPayout = async (req: AuthRequest, res: Response) => {
    const { amount, method } = req.body;
    // Logic for requesting payout
    // For now we'll just log it or rely on admin to process
    res.status(200).json({ status: 'success', message: 'Payout requested' });
};

/**
 * Update Payout Status (Admin Only)
 */
export const processPayout = async (req: Request, res: Response) => {
    const { resellerId, amount, method } = req.body;
    const payout = await ResellerService.processPayout(parseInt(resellerId), amount, method);
    res.status(200).json({ status: 'success', data: { payout } });
};
