import { Response, NextFunction } from 'express';
import { AppError } from './error.middleware';
import { AuthRequest } from './auth.middleware';
import logger from '../utils/logger';
import jwt from 'jsonwebtoken';

/**
 * Middleware to validate guest session scope
 * Ensures guest users can only access their specific ticket
 */
export const validateGuestScope = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        // Only apply if user is a guest
        if (!req.user || !req.user.isGuest) {
            return next();
        }

        const path = req.path;
        const method = req.method;

        // Allow access to support ticket endpoints
        // Note: 'path' in sub-routers is relative to the mount point (e.g., /support)
        const isSupportPath =
            path === '/' ||
            path === '/tickets' ||
            path === '/departments' ||
            path.includes('/tickets/') ||
            path.includes('/support/tickets/') ||
            path.includes('/presence') ||
            path.includes('/reply') ||
            path.startsWith('/support/tickets');

        if (!isSupportPath) {
            logger.warn(`[GuestScope] Guest user ${req.user.id} attempted to access unauthorized path: ${path}`);
            throw new AppError('You do not have permission to access this resource. Guest access is limited to your support tickets.', 403);
        }

        // We allow the request to proceed; the support controllers (getTicket, replyTicket, etc.)
        // already verify that the ticket belongs to the authenticated user's client record.
        logger.debug(`[GuestScope] Guest user ${req.user.id} accessing allowed support path: ${path}`);
        next();
    } catch (error) {
        if (error instanceof AppError) {
            next(error);
        } else {
            logger.error('[GuestScope] Error in guest scope validation:', error);
            next(new AppError('An error occurred while validating your session.', 500));
        }
    }
};
