import { Request, Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { UserType, Prisma } from '@prisma/client';

/**
 * Affiliate Management
 */
export const joinAffiliateProgram = async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const client = await prisma.client.findUnique({ where: { userId: req.user.id } });
    if (!client) throw new AppError('Only clients can join the affiliate program', 400);

    const existing = await prisma.affiliate.findUnique({ where: { clientId: client.id } });
    if (existing) throw new AppError('You are already an affiliate', 400);

    const referralCode = `REF-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const affiliate = await prisma.affiliate.create({
        data: {
            clientId: client.id,
            referralCode,
            commissionRate: 10.00, // Default 10%
        }
    });

    res.status(201).json({
        status: 'success',
        data: { affiliate },
    });
};

export const getAffiliateStats = async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const affiliate = await prisma.affiliate.findFirst({
        where: { client: { userId: req.user.id } },
        include: {
            referrals: {
                include: { referredClient: { include: { user: true } } },
                orderBy: { referralDate: 'desc' }
            }
        }
    });

    if (!affiliate) throw new AppError('Affiliate account not found', 404);

    res.status(200).json({
        status: 'success',
        data: { affiliate },
    });
};

/**
 * Promotion/Coupon Management (Admin)
 */
export const getPromotions = async (req: Request, res: Response) => {
    const promotions = await prisma.promotion.findMany();
    res.status(200).json({
        status: 'success',
        data: { promotions },
    });
};

export const createPromotion = async (req: Request, res: Response) => {
    const promotion = await prisma.promotion.create({ data: req.body });
    res.status(201).json({
        status: 'success',
        data: { promotion },
    });
};

export const deletePromotion = async (req: Request, res: Response) => {
    await prisma.promotion.delete({ where: { id: parseInt(req.params.id) } });
    res.status(204).send();
};
/**
 * Link Campaign Tracking
 */
export const trackCampaign = async (req: Request, res: Response) => {
    const { campaign, source, medium } = req.query;
    if (!campaign) throw new AppError('Campaign name is required', 400);

    // In a real app, this would redirect or set a cookie
    // For API, we just log it
    const link = await prisma.linkTracking.findFirst({
        where: {
            campaign: campaign as string,
            source: source as string,
            medium: medium as string
        }
    });

    if (link) {
        await prisma.linkTracking.update({
            where: { id: link.id },
            data: { clicks: { increment: 1 } }
        });
    } else {
        await prisma.linkTracking.create({
            data: {
                url: req.headers.referer || '/',
                campaign: campaign as string,
                source: source as string,
                medium: medium as string,
                clicks: 1
            }
        });
    }

    res.status(200).json({ status: 'success' });
};
