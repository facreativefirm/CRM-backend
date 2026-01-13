import { Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { UserType } from '@prisma/client';

/**
 * Billable Items
 */
export const getBillableItems = async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const items = await prisma.billableItem.findMany({
        where: {
            ...(req.user.userType === UserType.CLIENT ? { clientId: (await prisma.client.findUnique({ where: { userId: req.user.id } }))?.id } : {}),
        },
    });
    res.status(200).json({ status: 'success', data: { items } });
};

export const createBillableItem = async (req: AuthRequest, res: Response) => {
    const item = await prisma.billableItem.create({ data: req.body });
    res.status(201).json({ status: 'success', data: { item } });
};

/**
 * Quotes
 */
export const getQuotes = async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const isClient = req.user.userType === UserType.CLIENT;
    const quotes = await prisma.quote.findMany({
        where: {
            ...(isClient ? { clientId: (await prisma.client.findUnique({ where: { userId: req.user.id } }))?.id } : {}),
        }
    });
    res.status(200).json({ status: 'success', data: { quotes } });
};

export const createQuote = async (req: AuthRequest, res: Response) => {
    const quote = await prisma.quote.create({
        data: {
            ...req.body,
            quoteNumber: `QT-${Date.now()}`,
        }
    });
    res.status(201).json({ status: 'success', data: { quote } });
};
