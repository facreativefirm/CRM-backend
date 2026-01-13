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
    };
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        // First, try to get session token from header
        const sessionToken = req.headers['x-session-token'] as string;

        if (sessionToken) {
            console.log('[AuthMiddleware] Validating session token from header');
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
                console.log('[AuthMiddleware] No session found in database for provided token');
                throw new AppError('Invalid session. Please log in again.', 401);
            }

            // Check if session has expired
            if (new Date() > session.expiresAt) {
                console.log('[AuthMiddleware] Session has expired');
                // Delete expired session
                await prisma.session.delete({ where: { id: session.id } });
                throw new AppError('Session expired. Please log in again.', 401);
            }

            // Check if user is active
            if (session.user.status !== 'ACTIVE') {
                console.log('[AuthMiddleware] User is not active:', session.user.status);
                throw new AppError('This user account is no longer active.', 403);
            }

            // Attach user to request
            req.user = {
                id: session.user.id,
                email: session.user.email,
                userType: session.user.userType,
                resellerId: session.user.client?.resellerId || null,
            };

            // Update session activity
            await prisma.session.update({
                where: { id: session.id },
                data: { updatedAt: new Date() },
            });

            return next();
        }

        console.log('[AuthMiddleware] No session token found in headers');

        // Fallback to JWT validation (for backward compatibility)
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
            console.log('[AuthMiddleware] Found Bearer token');
        }

        if (!token) {
            console.log('[AuthMiddleware] No authentication mechanism found');
            throw new AppError('You are not logged in. Please log in to get access.', 401);
        }

        const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'secret');

        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            include: { client: true }
        });

        if (!user) {
            console.log('[AuthMiddleware] User belonging to JWT not found');
            throw new AppError('The user belonging to this token no longer exists.', 401);
        }

        if (user.status !== 'ACTIVE') {
            console.log('[AuthMiddleware] JWT User is not active:', user.status);
            throw new AppError('This user account is no longer active.', 403);
        }

        req.user = {
            id: user.id,
            email: user.email,
            userType: user.userType,
            resellerId: user.client?.resellerId || null
        };

        next();
    } catch (err) {
        console.error('[AuthMiddleware] Auth failure:', err);
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
