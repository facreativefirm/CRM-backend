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
        // 1. Try Session Authentication (Header or Query)
        const sessionToken = (req.headers['x-session-token'] || req.query.sessionToken || req.query.token) as string;

        if (sessionToken) {
            logger.debug(`[Auth] Checking session token: ${sessionToken.substring(0, 10)}...`);
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

            if (session) {
                logger.debug(`[Auth] Session found for user ${session.user.email}`);
                // Check if session has expired
                if (new Date() > session.expiresAt) {
                    logger.warn('[Auth] Session has expired');
                    await prisma.session.delete({ where: { id: session.id } }).catch(() => { });
                    throw new AppError('Session expired. Please log in again.', 401);
                }

                // Check if user is active
                if (session.user.status !== 'ACTIVE') {
                    logger.warn('[Auth] User is not active:', session.user.status);
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
                }).catch(() => { });

                return next();
            }
        }

        // 2. Fallback to JWT Validation (Stateless)
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
            logger.debug('[Auth] Found Bearer token');
        } else if (req.query.token) {
            token = req.query.token as string;
            logger.debug('[Auth] Found token in query parameters');
        }

        if (!token) {
            logger.warn('[Auth] No token found in headers or query');
            throw new AppError('You are not logged in. Please log in to get access.', 401);
        }

        const jwtSecret = process.env.JWT_SECRET || 'secret';

        try {
            const decoded: any = jwt.verify(token, jwtSecret);
            logger.debug(`[Auth] JWT verified for ID: ${decoded.id || decoded.userId}`);

            const userId = decoded.id || decoded.userId;

            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: { client: true }
            });

            if (!user) {
                logger.warn('[Auth] User belonging to JWT not found');
                throw new AppError('The user belonging to this token no longer exists.', 401);
            }

            if (user.status !== 'ACTIVE') {
                logger.warn('[Auth] JWT User is not active:', user.status);
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
        } catch (jwtErr) {
            logger.error(`[Auth] JWT Verification failed: ${jwtErr instanceof Error ? jwtErr.message : 'Unknown error'}`);
            if (jwtErr instanceof jwt.TokenExpiredError) {
                throw new AppError('Token expired. Please log in again.', 401);
            }
            throw new AppError('Invalid token. Please log in again.', 401);
        }
    } catch (err) {
        if (err instanceof AppError) {
            next(err);
        } else {
            logger.error(`[Auth] Unexpected failure: ${err instanceof Error ? err.message : 'Unknown error'}`);
            next(new AppError('Invalid authentication. Please log in again.', 401));
        }
    }
};

export const restrictTo = (...roles: UserType[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.userType)) {
            logger.warn(`[Auth] Permission denied for user ${req.user?.email}. Role: ${req.user?.userType}, Required: ${roles.join(', ')}`);
            throw new AppError('You do not have permission to perform this action', 403);
        }
        next();
    };
};
