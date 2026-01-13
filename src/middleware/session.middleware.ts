import { Request, Response, NextFunction } from 'express';
import { AppError } from './error.middleware';
import prisma from '../config/database';
import { AuthRequest } from './auth.middleware';

export const validateSession = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const sessionToken = req.headers['x-session-token'] as string;

    if (!sessionToken) {
        return next(); // Continue with JWT validation
    }

    try {
        // Find session in database
        const session = await prisma.session.findUnique({
            where: { sessionToken },
            include: { user: true },
        });

        if (!session) {
            throw new AppError('Invalid session', 401);
        }

        // Check if session has expired
        if (new Date() > session.expiresAt) {
            // Delete expired session
            await prisma.session.delete({ where: { id: session.id } });
            throw new AppError('Session expired. Please log in again.', 401);
        }

        // Attach user to request
        req.user = {
            id: session.user.id,
            email: session.user.email,
            userType: session.user.userType,
            resellerId: null,
        };

        // Update session activity
        await prisma.session.update({
            where: { id: session.id },
            data: { updatedAt: new Date() },
        });

        next();
    } catch (err) {
        next(err);
    }
};

// Cleanup expired sessions (can be run as a cron job)
export const cleanupExpiredSessions = async () => {
    try {
        const result = await prisma.session.deleteMany({
            where: {
                expiresAt: {
                    lt: new Date(),
                },
            },
        });
        console.log(`Cleaned up ${result.count} expired sessions`);
        return result.count;
    } catch (error) {
        console.error('Error cleaning up sessions:', error);
        return 0;
    }
};
