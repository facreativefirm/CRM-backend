
import prisma from '../config/database';
import { UserType } from '@prisma/client';

export type NotificationType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export const createNotification = async (
    userId: number | null, // null for broadcast to all admins? Or specific logic
    type: NotificationType,
    title: string,
    message: string,
    link?: string
) => {
    return await prisma.notification.create({
        data: {
            userId,
            type,
            title,
            message,
            link,
            isRead: false
        }
    });
};

export const broadcastToAdmins = async (
    type: NotificationType,
    title: string,
    message: string,
    link?: string
) => {
    // Find all admins
    const admins = await prisma.user.findMany({
        where: {
            userType: {
                in: [UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF]
            }
        },
        select: { id: true }
    });

    const notifications = admins.map(admin => ({
        userId: admin.id,
        type,
        title,
        message,
        link,
        isRead: false
    }));

    if (notifications.length > 0) {
        return await prisma.notification.createMany({
            data: notifications
        });
    }
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
