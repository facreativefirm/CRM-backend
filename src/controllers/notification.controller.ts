
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as notificationService from '../services/notificationService';
import { AppError } from '../middleware/error.middleware';

/**
 * Get unread notifications for the current user
 */
export const getMyNotifications = async (req: AuthRequest, res: Response) => {
    if (!req.user) {
        throw new AppError('Unauthorized', 401);
    }

    const { page, limit, all } = req.query;

    if (all === 'true' || page || limit) {
        // Fetch paginated (read & unread)
        const result = await notificationService.getNotifications(
            req.user.id,
            page ? parseInt(page as string) : 1,
            limit ? parseInt(limit as string) : 20
        );

        // Also fetch unread count for the badge
        const unreadList = await notificationService.getUnreadNotifications(req.user.id);
        const unreadCount = unreadList.length;

        res.status(200).json({
            status: 'success',
            data: {
                ...result,
                unreadCount
            }
        });
    } else {
        // Default behavior: just unread (legacy/simple)
        const notifications = await notificationService.getUnreadNotifications(req.user.id);
        res.status(200).json({
            status: 'success',
            data: {
                notifications,
                unreadCount: notifications.length
            }
        });
    }
};

/**
 * Mark a notification as read
 */
export const markRead = async (req: AuthRequest, res: Response) => {
    if (!req.user) {
        throw new AppError('Unauthorized', 401);
    }

    const { id } = req.params;
    const notificationId = parseInt(id as string);

    if (isNaN(notificationId)) {
        throw new AppError('Invalid notification ID', 400);
    }

    await notificationService.markAsRead(notificationId, req.user.id);

    res.status(200).json({
        status: 'success',
        message: 'Notification marked as read'
    });
};

/**
 * Mark all notifications as read
 */
export const markAllRead = async (req: AuthRequest, res: Response) => {
    if (!req.user) {
        throw new AppError('Unauthorized', 401);
    }

    await notificationService.markAllAsRead(req.user.id);

    res.status(200).json({
        status: 'success',
        message: 'All notifications marked as read'
    });
};
