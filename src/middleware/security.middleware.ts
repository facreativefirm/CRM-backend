import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from './error.middleware';

/**
 * Middleware to block banned IP addresses
 */
export const blockBannedIPs = async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress;

    if (!ip) return next();

    try {
        const banner = await prisma.bannedIP.findUnique({
            where: { ipAddress: ip }
        });

        if (banner) {
            // Check expiry if set
            if (banner.expiresAt && new Date() > banner.expiresAt) {
                // Ban expired, we could delete it here or just let it pass
                await prisma.bannedIP.delete({ where: { id: banner.id } });
                return next();
            }

            return next(new AppError(`Access denied: Your IP address (${ip}) has been banned. Reason: ${banner.reason || 'No reason provided'}`, 403));
        }
    } catch (err) {
        // If DB is down, log it but don't block the request/crash the app
        console.error('[Security] Error checking banned IPs:', err instanceof Error ? err.message : err);
    }

    next();
};
