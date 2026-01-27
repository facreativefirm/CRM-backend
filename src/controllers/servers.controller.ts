import { Request, Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';

/**
 * Server Management
 */
export const getServers = async (req: Request, res: Response) => {
    const servers = await prisma.server.findMany({
        include: {
            _count: { select: { services: true } }
        }
    });
    res.status(200).json({ status: 'success', data: { servers } });
};

export const createServer = async (req: Request, res: Response) => {
    const server = await prisma.server.create({ data: req.body });
    res.status(201).json({ status: 'success', data: { server } });
};

export const updateServer = async (req: Request, res: Response) => {
    const server = await prisma.server.update({
        where: { id: parseInt(req.params.id as string) },
        data: req.body,
    });
    res.status(200).json({ status: 'success', data: { server } });
};

export const deleteServer = async (req: Request, res: Response) => {
    await prisma.server.delete({ where: { id: parseInt(req.params.id as string) } });
    res.status(204).send();
};
