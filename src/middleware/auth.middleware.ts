import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './error.middleware';
import prisma from '../config/database';
import { UserType } from '@prisma/client';

export interface AuthRequest extends Request {
    user?: {
        id: number;
        email: string;
        userType: UserType;
        resellerId?: number | null;
        activeTicketId?: number | null;
        isGuest?: boolean;
    };
}

import logger from '../utils/logger';

export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        // First, try to get session token from header
        const sessionToken = req.headers['x-session-token'] as string;

        if (sessionToken) {
            logger.debug('[AuthMiddleware] Validating session token from header');
            // Validate session from database
            const session = await prisma.session.findUnique({
                where: { sessionToken },
                include: {
                    user: {
                        include: {
                            client: true,
                            staff: true,
                        }
                    }
                },
            });

            if (!session) {
                logger.warn('[AuthMiddleware] No session found in database for provided token');
                throw new AppError('Invalid session. Please log in again.', 401);
            }

            // Check if session has expired
            if (new Date() > session.expiresAt) {
                logger.warn('[AuthMiddleware] Session has expired');
                // Delete expired session
                await prisma.session.delete({ where: { id: session.id } });
                throw new AppError('Session expired. Please log in again.', 401);
            }

            // Check if user is active
            if (session.user.status !== 'ACTIVE') {
                logger.warn('[AuthMiddleware] User is not active:', session.user.status);
                throw new AppError('This user account is no longer active.', 403);
            }

            // Attach user to request
            req.user = {
                id: session.user.id,
                email: session.user.email,
                userType: session.user.userType,
                resellerId: session.user.client?.resellerId || null,
                activeTicketId: session.activeTicketId,
                isGuest: session.user.client?.isGuest || false,
            };

            // Update session activity
            await prisma.session.update({
                where: { id: session.id },
                data: { updatedAt: new Date() },
            });

            return next();
        }

        // Fallback to JWT validation (for backward compatibility)
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
            logger.debug('[AuthMiddleware] Found Bearer token');
        }

        if (!token) {
            throw new AppError('You are not logged in. Please log in to get access.', 401);
        }

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret && process.env.NODE_ENV === 'production') {
            logger.error('[AuthMiddleware] JWT_SECRET is missing in production environment!');
            throw new AppError('Server configuration error.', 500);
        }

        const decoded: any = jwt.verify(token, jwtSecret || 'secret');

        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            include: { client: true }
        });

        if (!user) {
            logger.warn('[AuthMiddleware] User belonging to JWT not found');
            throw new AppError('The user belonging to this token no longer exists.', 401);
        }

        if (user.status !== 'ACTIVE') {
            logger.warn('[AuthMiddleware] JWT User is not active:', user.status);
            throw new AppError('This user account is no longer active.', 403);
        }

        req.user = {
            id: user.id,
            email: user.email,
            userType: user.userType,
            resellerId: user.client?.resellerId || null,
            isGuest: user.client?.isGuest || false,
            activeTicketId: (decoded as any)?.ticketId || null
        };

        next();
    } catch (err) {
        if (!(err instanceof AppError)) {
            logger.error(`[AuthMiddleware] Auth failure: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
        if (err instanceof AppError) {
            next(err);
        } else {
            next(new AppError('Invalid authentication. Please log in again.', 401));
        }
    }
};

export const restrictTo = (...roles: UserType[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.userType)) {
            throw new AppError('You do not have permission to perform this action', 403);
        }
        next();
    };
};
