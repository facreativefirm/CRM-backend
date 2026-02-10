import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { UserType } from '@prisma/client';

export class PromotionsController {
    /**
     * Create a new promotion
     */
    async create(req: AuthRequest, res: Response) {
        if (!req.user || (req.user.userType !== UserType.ADMIN && req.user.userType !== UserType.SUPER_ADMIN)) {
            throw new AppError('Unauthorized', 403);
        }

        const { code, type, value, validFrom, validUntil, usageLimit, minimumOrderAmount, recurrence, applicableProducts } = req.body;

        const promotion = await prisma.promotion.create({
            data: {
                code,
                type, // 'percentage' or 'fixed'
                value,
                validFrom: new Date(validFrom),
                validUntil: validUntil ? new Date(validUntil) : null,
                usageLimit: usageLimit ? parseInt(usageLimit) : null,
                minimumOrderAmount,
                recurrence: recurrence ? parseInt(recurrence) : null,
                applicableProducts: applicableProducts ? JSON.stringify(applicableProducts) : null
            }
        });

        res.status(201).json({
            status: 'success',
            data: { promotion }
        });
    }

    /**
     * List all promotions
     */
    async getAll(req: AuthRequest, res: Response) {
        if (!req.user || (req.user.userType !== UserType.ADMIN && req.user.userType !== UserType.SUPER_ADMIN)) {
            throw new AppError('Unauthorized', 403);
        }

        const promotions = await prisma.promotion.findMany({
            orderBy: { createdAt: 'desc' }
        });

        res.status(200).json({
            status: 'success',
            data: { promotions }
        });
    }

    /**
     * Get single promotion
     */
    async getOne(req: AuthRequest, res: Response) {
        if (!req.user || (req.user.userType !== UserType.ADMIN && req.user.userType !== UserType.SUPER_ADMIN)) {
            throw new AppError('Unauthorized', 403);
        }

        const id = parseInt(req.params.id as string);
        const promotion = await prisma.promotion.findUnique({
            where: { id }
        });

        if (!promotion) throw new AppError('Promotion not found', 404);

        res.status(200).json({
            status: 'success',
            data: { promotion }
        });
    }

    /**
     * Update promotion
     */
    async update(req: AuthRequest, res: Response) {
        if (!req.user || (req.user.userType !== UserType.ADMIN && req.user.userType !== UserType.SUPER_ADMIN)) {
            throw new AppError('Unauthorized', 403);
        }

        const id = parseInt(req.params.id as string);
        const data = req.body;

        if (data.validFrom) data.validFrom = new Date(data.validFrom);
        if (data.validUntil) data.validUntil = new Date(data.validUntil);
        if (data.applicableProducts) data.applicableProducts = JSON.stringify(data.applicableProducts);

        const promotion = await prisma.promotion.update({
            where: { id },
            data
        });

        res.status(200).json({
            status: 'success',
            data: { promotion }
        });
    }

    /**
     * Delete promotion
     */
    async delete(req: AuthRequest, res: Response) {
        if (!req.user || (req.user.userType !== UserType.ADMIN && req.user.userType !== UserType.SUPER_ADMIN)) {
            throw new AppError('Unauthorized', 403);
        }

        const id = parseInt(req.params.id as string);

        await prisma.promotion.delete({
            where: { id }
        });

        res.status(204).json({
            status: 'success',
            data: null
        });
    }

    /**
     * Validate a promo code (Public Helper)
     */
    async validate(req: AuthRequest, res: Response) {
        const { code, cartTotal, cartItems } = req.body;

        if (!code) throw new AppError('Promo code is required', 400);

        const promotion = await prisma.promotion.findUnique({
            where: { code }
        });

        if (!promotion) {
            return res.status(200).json({
                status: 'error',
                message: 'Invalid promo code'
            });
        }

        // Checks
        const now = new Date();
        if (promotion.validFrom > now) {
            return res.status(200).json({ status: 'error', message: 'Promo code not yet valid' });
        }
        if (promotion.validUntil && promotion.validUntil < now) {
            return res.status(200).json({ status: 'error', message: 'Promo code expired' });
        }
        if (promotion.usageLimit && promotion.usedCount >= promotion.usageLimit) {
            return res.status(200).json({ status: 'error', message: 'Promo code usage limit reached' });
        }
        if (promotion.minimumOrderAmount && cartTotal < Number(promotion.minimumOrderAmount)) {
            return res.status(200).json({ status: 'error', message: `Minimum order amount of ${promotion.minimumOrderAmount} required` });
        }

        // If specific products required
        if (promotion.applicableProducts) {
            try {
                const allowedIds = JSON.parse(promotion.applicableProducts);
                if (Array.isArray(allowedIds) && allowedIds.length > 0 && cartItems) {
                    const hasValidItem = cartItems.some((item: any) => allowedIds.includes(item.productId));
                    if (!hasValidItem) {
                        return res.status(200).json({ status: 'error', message: 'Promo code not applicable to items in cart' });
                    }
                }
            } catch (e) { }
        }

        res.status(200).json({
            status: 'success',
            data: {
                code: promotion.code,
                type: promotion.type,
                value: promotion.value,
                recurrence: promotion.recurrence,
                message: 'Promo code applied successfully'
            }
        });
    }
}

export default new PromotionsController();
