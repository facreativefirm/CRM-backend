import { Request, Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

/**
 * List all TLDs
 */
export const getTLDs = async (req: Request, res: Response) => {
    const tlds = await prisma.domainTLD.findMany({
        orderBy: { tld: 'asc' }
    });
    res.status(200).json({ status: 'success', data: { tlds } });
};

/**
 * Create a new TLD
 */
export const createTLD = async (req: AuthRequest, res: Response) => {
    const tld = await prisma.domainTLD.create({
        data: req.body
    });
    res.status(201).json({ status: 'success', data: { tld } });
};

/**
 * Update TLD pricing/settings
 */
export const updateTLD = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const tld = await prisma.domainTLD.update({
        where: { id: parseInt(id as string) },
        data: req.body
    });
    res.status(200).json({ status: 'success', data: { tld } });
};

/**
 * Delete a TLD
 */
export const deleteTLD = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    await prisma.domainTLD.delete({
        where: { id: parseInt(id as string) }
    });
    res.status(204).json({ status: 'success', data: null });
};
