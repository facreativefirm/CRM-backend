import prisma from '../config/database';
import { UserType } from '@prisma/client';
import { notifyUser, notifyAdmins } from './socketService';

export type NotificationType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export const createNotification = async (
    userId: number | null,
    type: NotificationType,
    title: string,
    message: string,
    link?: string
) => {
    const notification = await prisma.notification.create({
        data: {
            userId,
            type,
            title,
            message,
            link,
            isRead: false
        }
    });

    // Real-time: Notify user
    if (userId) {
        notifyUser(userId, 'new_notification', notification);
    }

    return notification;
};

export const broadcastToAdmins = async (
    type: NotificationType,
    title: string,
    message: string,
    link?: string
) => {
    // 1. Find all admins and staff
    const admins = await prisma.user.findMany({
        where: {
            userType: {
                in: [UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF]
            }
        },
        select: { id: true }
    });

    if (admins.length === 0) return;

    // 2. We use a loop to ensure each admin gets a specific notification record with its own ID
    // This allows them to mark as read immediately from the UI without refreshing
    const results = [];
    for (const admin of admins) {
        try {
            const notification = await createNotification(
                admin.id,
                type,
                title,
                message,
                link
            );
            results.push(notification);
        } catch (err) {
            console.error(`Failed to create broadcast notification for admin ${admin.id}:`, err);
        }
    }

    return results;
};

export const getUnreadNotifications = async (userId: number) => {
    return await prisma.notification.findMany({
        where: {
            userId,
            isRead: false
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
};

export const getNotifications = async (userId: number, page: number = 1, limit: number = 20) => {
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip
        }),
        prisma.notification.count({ where: { userId } })
    ]);

    return { notifications, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const markAsRead = async (id: number, userId: number) => {
    return await prisma.notification.updateMany({
        where: {
            id,
            userId
        },
        data: {
            isRead: true
        }
    });
};

export const markAllAsRead = async (userId: number) => {
    return await prisma.notification.updateMany({
        where: {
            userId,
            isRead: false
        },
        data: {
            isRead: true
        }
    });
};
