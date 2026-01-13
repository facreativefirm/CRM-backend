import { Request, Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';

export const getGroups = async (req: Request, res: Response) => {
    const groups = await prisma.clientGroup.findMany();
    res.status(200).json({
        status: 'success',
        data: { groups },
    });
};

export const createGroup = async (req: Request, res: Response) => {
    const group = await prisma.clientGroup.create({
        data: req.body,
    });
    res.status(201).json({
        status: 'success',
        data: { group },
    });
};

export const updateGroup = async (req: Request, res: Response) => {
    const group = await prisma.clientGroup.update({
        where: { id: parseInt(req.params.id) },
        data: req.body,
    });
    res.status(200).json({
        status: 'success',
        data: { group },
    });
};

export const deleteGroup = async (req: Request, res: Response) => {
    await prisma.clientGroup.delete({
        where: { id: parseInt(req.params.id) },
    });
    res.status(204).json({
        status: 'success',
        data: null,
    });
};
