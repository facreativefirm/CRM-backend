import { Request, Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { UserType } from '@prisma/client';

/**
 * Banned IP Management
 */
export const getBannedIPs = async (req: Request, res: Response) => {
    const bans = await prisma.bannedIP.findMany({
        orderBy: { bannedAt: 'desc' }
    });

    res.status(200).json({
        status: 'success',
        data: { bans },
    });
};

export const banIP = async (req: AuthRequest, res: Response) => {
    const { ipAddress, reason, expiresAt } = req.body;

    if (!ipAddress) throw new AppError('IP Address is required', 400);

    const ban = await prisma.bannedIP.create({
        data: {
            ipAddress,
            reason,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            bannedBy: req.user?.id
        }
    });

    res.status(201).json({
        status: 'success',
        data: { ban },
    });
};

export const unbanIP = async (req: Request, res: Response) => {
    const { id } = req.params;

    await prisma.bannedIP.delete({
        where: { id: parseInt(id as string) }
    });

    res.status(200).json({
        status: 'success',
        message: 'IP unbanned successfully'
    });
};

/**
 * Security Questions
 */
export const getSecurityQuestions = async (req: Request, res: Response) => {
    const questions = await prisma.securityQuestion.findMany({
        orderBy: { question: 'asc' }
    });

    res.status(200).json({
        status: 'success',
        data: { questions },
    });
};

export const createSecurityQuestion = async (req: Request, res: Response) => {
    const { question } = req.body;

    if (!question) throw new AppError('Question text is required', 400);

    const securityQuestion = await prisma.securityQuestion.create({
        data: { question }
    });

    res.status(201).json({
        status: 'success',
        data: { securityQuestion },
    });
};

export const deleteSecurityQuestion = async (req: Request, res: Response) => {
    const { id } = req.params;

    await prisma.securityQuestion.delete({
        where: { id: parseInt(id as string) }
    });

    res.status(200).json({
        status: 'success',
        message: 'Security question deleted'
    });
};

/**
 * Client Security Selection
 */
export const updateClientSecurityQuestion = async (req: AuthRequest, res: Response) => {
    const { questionId, answer } = req.body;

    if (!req.user) throw new AppError('Unauthorized', 401);

    const client = await prisma.client.findUnique({ where: { userId: req.user.id } });
    if (!client) throw new AppError('Client profile not found', 404);

    // In a real production app, we would hash the answer
    const answerHash = answer; // Placeholder for hashing logic

    // Check if question already exists for this client
    let clientQuestion = await prisma.clientSecurityQuestion.findFirst({
        where: {
            clientId: client.id,
            questionId: parseInt(questionId as string)
        }
    });

    if (clientQuestion) {
        // Update existing
        clientQuestion = await prisma.clientSecurityQuestion.update({
            where: { id: clientQuestion.id },
            data: { answerHash }
        });
    } else {
        // Create new
        clientQuestion = await prisma.clientSecurityQuestion.create({
            data: {
                clientId: client.id,
                questionId: parseInt(questionId as string),
                answerHash
            }
        });
    }

    res.status(200).json({
        status: 'success',
        data: { clientQuestion },
    });
};
