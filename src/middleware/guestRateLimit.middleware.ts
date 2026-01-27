import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from './error.middleware';
import logger from '../utils/logger';

interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
    message?: string;
}

/**
 * IP-based rate limiting middleware for guest support
 */
export const guestSupportRateLimit = (config: RateLimitConfig) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Extract IP address
            const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
                || req.headers['x-real-ip'] as string
                || req.socket.remoteAddress
                || 'unknown';

            if (ipAddress === 'unknown') {
                logger.warn('[GuestRateLimit] Unable to determine IP address');
                throw new AppError('Unable to process request. Please try again.', 400);
            }

            // Calculate time window
            const windowStart = new Date(Date.now() - config.windowMs);

            // Count recent activities from this IP
            const recentCount = await (prisma as any).guestActivity.count({
                where: {
                    ipAddress,
                    activityType: 'TICKET_INITIATION',
                    createdAt: { gte: windowStart }
                }
            });

            // Check if limit exceeded
            if (recentCount >= config.maxRequests) {
                logger.warn(`[GuestRateLimit] Rate limit exceeded for IP: ${ipAddress} (${recentCount}/${config.maxRequests})`);

                // Calculate time until next allowed request
                const oldestActivity = await (prisma as any).guestActivity.findFirst({
                    where: {
                        ipAddress,
                        activityType: 'TICKET_INITIATION',
                        createdAt: { gte: windowStart }
                    },
                    orderBy: { createdAt: 'asc' }
                });

                if (oldestActivity) {
                    const resetTime = new Date(oldestActivity.createdAt.getTime() + config.windowMs);
                    const minutesUntilReset = Math.ceil((resetTime.getTime() - Date.now()) / 60000);

                    throw new AppError(
                        config.message || `Rate limit exceeded. You can create ${config.maxRequests} support tickets per ${config.windowMs / 3600000} hours. Please try again in ${minutesUntilReset} minutes or contact us directly.`,
                        429
                    );
                }
            }

            // Log the attempt
            logger.debug(`[GuestRateLimit] IP ${ipAddress}: ${recentCount}/${config.maxRequests} requests in window`);

            next();
        } catch (error) {
            if (error instanceof AppError) {
                next(error);
            } else {
                logger.error('[GuestRateLimit] Error in rate limit middleware:', error);
                next(new AppError('An error occurred while processing your request.', 500));
            }
        }
    };
};

/**
 * Suspicious activity detection middleware
 */
export const detectSuspiciousActivity = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
            || req.headers['x-real-ip'] as string
            || req.socket.remoteAddress
            || 'unknown';

        const userAgent = req.headers['user-agent'] || 'unknown';

        // Check for missing or suspicious user agent
        if (userAgent === 'unknown' || userAgent.length < 10) {
            logger.warn(`[SuspiciousActivity] Suspicious user agent from IP ${ipAddress}: ${userAgent}`);
            throw new AppError('Invalid request. Please use a standard web browser.', 400);
        }

        // Check for known bot patterns in user agent
        const botPatterns = /bot|crawler|spider|scraper|curl|wget|python|java|php/i;
        if (botPatterns.test(userAgent)) {
            logger.warn(`[SuspiciousActivity] Bot detected from IP ${ipAddress}: ${userAgent}`);
            throw new AppError('Automated requests are not allowed. Please use the web interface.', 403);
        }

        // Check if this IP has been flagged for abuse in the past 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const abuseCount = await (prisma as any).guestActivity.count({
            where: {
                ipAddress,
                createdAt: { gte: sevenDaysAgo }
            }
        });

        // If more than 10 activities in 7 days, flag as potential abuse
        if (abuseCount > 10) {
            logger.warn(`[SuspiciousActivity] High activity from IP ${ipAddress}: ${abuseCount} activities in 7 days`);
            throw new AppError('Too many requests from your location. Please contact support directly if you need assistance.', 429);
        }

        next();
    } catch (error) {
        if (error instanceof AppError) {
            next(error);
        } else {
            logger.error('[SuspiciousActivity] Error in detection middleware:', error);
            next(new AppError('An error occurred while processing your request.', 500));
        }
    }
};
