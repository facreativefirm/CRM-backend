import { Request, Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { UserStatus, UserType } from '@prisma/client';

/**
 * List all users with filtering
 */
export const getUsers = async (req: any, res: Response) => {
    const { type, status, reseller } = req.query;

    const users = await prisma.user.findMany({
        where: {
            ...(type && { userType: type as UserType }),
            ...(status && { status: status as UserStatus }),
        },
        include: {
            client: true,
            staff: true,
        },
        orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
        status: 'success',
        results: users.length,
        data: { users },
    });
};

/**
 * Get single user by ID
 */
export const getUser = async (req: Request, res: Response) => {
    const user = await prisma.user.findUnique({
        where: { id: parseInt(req.params.id) },
        include: {
            client: true,
            staff: true,
        },
    });

    if (!user) {
        throw new AppError('No user found with that ID', 404);
    }

    res.status(200).json({
        status: 'success',
        data: { user },
    });
};

/**
 * Update user basic info and status
 */
export const updateUser = async (req: Request, res: Response) => {
    const { firstName, lastName, status, userType, resellerType, commissionRate } = req.body;

    const user = await prisma.user.update({
        where: { id: parseInt(req.params.id) },
        data: {
            firstName,
            lastName,
            status,
            userType,
            resellerType,
            commissionRate,
        },
    });

    res.status(200).json({
        status: 'success',
        data: { user },
    });
};

/**
 * Delete user (soft or hard depending on requirements, here hard delete)
 */
export const deleteUser = async (req: Request, res: Response) => {
    await prisma.user.delete({
        where: { id: parseInt(req.params.id) },
    });

    res.status(204).json({
        status: 'success',
        data: null,
    });
};
