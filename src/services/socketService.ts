import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';
import prisma from '../config/database';

interface AuthenticatedSocket extends Socket {
    user?: any;
    isGuest?: boolean;
}

let io: Server;

export const initSocketService = (httpServer: HttpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.ALLOWED_ORIGINS?.split(',') || "*",
            methods: ["GET", "POST"],
            credentials: true
        },
        path: '/socket.io'
    });

    // Middleware for Authentication
    io.use(async (socket: AuthenticatedSocket, next) => {
        try {
            let token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

            if (!token) {
                logger.debug(`[Socket] New connection attempt without token (Guest)`);
                socket.isGuest = true;
                return next();
            }

            // Strip Bearer prefix if provided
            if (token.startsWith('Bearer ')) {
                token = token.slice(7);
            }

            let authenticatedUser = null;

            // 1. Try JWT validation (for Registered Users/Admins)
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
                authenticatedUser = await prisma.user.findUnique({
                    where: { id: decoded.id },
                    select: { id: true, userType: true, username: true, email: true }
                });
            } catch (jwtErr) {
                // 2. If JWT fails, check for a valid DB Session (for Guests)
                const session = await prisma.session.findUnique({
                    where: { sessionToken: token },
                    include: {
                        user: {
                            select: { id: true, userType: true, username: true, email: true }
                        }
                    }
                });

                if (session && session.user) {
                    authenticatedUser = session.user;
                }
            }

            if (authenticatedUser) {
                socket.user = authenticatedUser;
                socket.isGuest = false;
                return next();
            }

            // If neither works, it's a guest or invalid token
            logger.warn(`[Socket] Authentication failed for token. Marking as guest.`);
            socket.isGuest = true;
            next();
        } catch (err) {
            logger.error(`[Socket] Critical Auth Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
            next(); // Still allow connection as guest if everything fails
        }
    });

    io.on('connection', (socket: AuthenticatedSocket) => {
        logger.info(`[Socket] User connected: ${socket.id} (User: ${socket.user?.username || 'Guest'})`);

        // Join user-specific room for private notifications
        if (socket.user) {
            const userRoom = `user_${socket.user.id}`;
            socket.join(userRoom);
            logger.debug(`[Socket] ${socket.user.username} joined room: ${userRoom}`);

            // If Admin/Staff, join admin room
            if (['ADMIN', 'SUPER_ADMIN', 'STAFF'].includes(socket.user.userType)) {
                socket.join('admin_alerts');
                logger.debug(`[Socket] ${socket.user.username} joined room: admin_alerts`);
            }
        }

        // Event: Join Ticket Room
        socket.on('join_ticket', async (ticketId: number | string) => {
            if (!ticketId) return;
            const roomName = `ticket_${ticketId}`;
            socket.join(roomName);
            logger.debug(`[Socket] Socket ${socket.id} joined ticket room: ${roomName}`);
        });

        // Event: Leave Ticket Room
        socket.on('leave_ticket', (ticketId: number | string) => {
            if (!ticketId) return;
            const roomName = `ticket_${ticketId}`;
            socket.leave(roomName);
            logger.debug(`[Socket] Socket ${socket.id} left ticket room: ${roomName}`);
        });

        socket.on('disconnect', () => {
            logger.debug(`[Socket] User disconnected: ${socket.id}`);
        });
    });

    logger.info('✅ Socket.IO Service Initialized');
    return io;
};

// Helper to notify a specific user (User-specific room)
export const notifyUser = (userId: number, event: string, data: any) => {
    try {
        if (io) {
            const roomName = `user_${userId}`;
            io.to(roomName).emit(event, data);
            logger.info(`[Socket] Sent '${event}' to user ${userId}`);
        }
    } catch (e) {
        logger.error(`[Socket] Failed to notify user: ${e}`);
    }
};

// Helper to notify a specific ticket room (New Message)
export const notifyTicketUpdate = (ticketId: number, event: string, data: any) => {
    try {
        if (io) {
            const roomName = `ticket_${ticketId}`;
            io.to(roomName).emit(event, data);
            logger.info(`[Socket] Broadcast '${event}' to room '${roomName}' (Payload ID: ${data.reply?.id || 'N/A'})`);
        } else {
            logger.warn(`[Socket] Cannot emit '${event}' - IO not initialized`);
        }
    } catch (e) {
        logger.error(`[Socket] Failed to emit ticket update: ${e}`);
    }
};

// Helper to notify admins (New Ticket Created)
export const notifyAdmins = (event: string, data: any) => {
    try {
        if (io) {
            io.to('admin_alerts').emit(event, data);
            logger.info(`[Socket] Broadcast '${event}' to admin_alerts`);
        }
    } catch (e) {
        logger.error(`[Socket] Failed to notify admins: ${e}`);
    }
};
