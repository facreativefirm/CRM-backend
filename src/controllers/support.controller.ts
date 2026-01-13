import { Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { UserType, TicketPriority, Prisma } from '@prisma/client';
import * as notificationService from '../services/notificationService';

/**
 * List Support Tickets with isolation
 */
export const getTickets = async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const { status, priority, departmentId } = req.query;
    const isClient = req.user.userType === UserType.CLIENT;
    const isReseller = req.user.userType === UserType.RESELLER;

    const tickets = await prisma.supportTicket.findMany({
        where: {
            ...(status && { status: status as string }),
            ...(priority && { priority: priority as TicketPriority }),
            ...(departmentId && { departmentId: parseInt(departmentId as string) }),
            ...(isClient ? { clientId: (await prisma.client.findUnique({ where: { userId: req.user.id } }))?.id } : {}),
            ...(isReseller ? { client: { resellerId: req.user.id } } : {}),
        },
        include: {
            client: { include: { user: true } },
            department: true,
            assignedTo: true,
        },
        orderBy: { lastReplyDate: 'desc' },
    });

    res.status(200).json({
        status: 'success',
        results: tickets.length,
        data: { tickets },
    });
};

/**
 * Open a New Ticket
 */
export const openTicket = async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const { subject, priority, departmentId, message } = req.body;
    let { serviceId } = req.body;

    // Handle serviceId if passed as empty string or null
    const parsedServiceId = (serviceId === '' || serviceId === null || serviceId === undefined) ? undefined : parseInt(serviceId as string);

    let clientId;
    if (req.user.userType === UserType.CLIENT) {
        clientId = (await prisma.client.findUnique({ where: { userId: req.user.id } }))?.id;
    } else {
        clientId = req.body.clientId; // Admin opening ticket for client
    }

    if (!clientId) throw new AppError('Client ID required', 400);

    const ticketNumber = `TKT-${Math.floor(100000 + Math.random() * 900000)}`;

    // Fetch Department for auto-assignment
    const department = await prisma.ticketDepartment.findUnique({
        where: { id: departmentId },
        select: { assignedSupportId: true }
    });

    const ticket = await prisma.supportTicket.create({
        data: {
            ticketNumber,
            clientId,
            subject,
            priority,
            departmentId,
            serviceId: parsedServiceId,
            status: 'OPEN',
            assignedToId: department?.assignedSupportId || null,
            replies: {
                create: {
                    userId: req.user.id,
                    message,
                }
            }
        },
        include: {
            replies: true
        }
    });

    // 1. Notify assigned support if present
    if (department?.assignedSupportId) {
        try {
            await notificationService.createNotification(
                department.assignedSupportId,
                'INFO',
                `New Ticket Assigned: #${ticketNumber}`,
                `You have been automatically assigned to ticket: ${subject}`,
                `/admin/support/${ticket.id}`
            );
        } catch (e) {
            console.error("Failed to notify assignee", e);
        }
    }

    // 2. Broadcast to all admins that a new ticket was opened (if it's a client or reseller opening it)
    if (req.user.userType === UserType.CLIENT || req.user.userType === UserType.RESELLER) {
        try {
            await notificationService.broadcastToAdmins(
                'INFO',
                `New Ticket: #${ticketNumber}`,
                `A new support ticket has been opened: ${subject}`,
                `/admin/support/${ticket.id}`
            );
        } catch (e) {
            console.error("Failed to broadcast new ticket notification", e);
        }
    } else {
        // Admin/Staff opened the ticket for the client -> Notify the client
        try {
            const clientUser = await prisma.client.findUnique({
                where: { id: clientId },
                select: { userId: true }
            });
            if (clientUser) {
                await notificationService.createNotification(
                    clientUser.userId,
                    'INFO',
                    `New Support Ticket: #${ticketNumber}`,
                    `An administrator has opened a new support ticket for you: ${subject}`,
                    `/support/${ticket.id}`
                );
            }
        } catch (e) {
            console.error("Failed to notify client about admin-initiated ticket", e);
        }
    }

    res.status(201).json({
        status: 'success',
        data: { ticket },
    });
};

/**
 * Get Single Ticket with Replies
 */
export const getTicket = async (req: AuthRequest, res: Response) => {
    const ticket = await prisma.supportTicket.findUnique({
        where: { id: parseInt(req.params.id) },
        include: {
            client: { include: { user: true } },
            department: true,
            replies: {
                include: { user: true },
                orderBy: { timestamp: 'asc' }
            },
            assignedTo: true,
        }
    });

    if (!ticket) throw new AppError('Ticket not found', 404);

    // Isolation check
    if (!req.user) throw new AppError('Unauthorized', 401);
    if (req.user.userType === UserType.CLIENT) {
        const client = await prisma.client.findUnique({ where: { userId: req.user.id } });
        if (ticket.clientId !== client?.id) throw new AppError('Access denied', 403);
    }

    // Privacy Filter: Filter out internal notes for Clients/Resellers
    if (req.user.userType === UserType.CLIENT || req.user.userType === UserType.RESELLER) {
        ticket.replies = (ticket.replies || []).filter((r: any) => !r.isInternalNote);
    }

    res.status(200).json({
        status: 'success',
        data: { ticket },
    });
}

/**
 * Update Ticket Presence (Heartbeat)
 */
export const updateTicketPresence = async (req: AuthRequest, res: Response) => {
    if (!req.user || !req.headers['x-session-token']) {
        return res.status(200).json({ status: 'success' }); // Silent fail
    }

    const ticketId = parseInt(req.params.id);
    const sessionToken = req.headers['x-session-token'] as string;

    await prisma.session.update({
        where: { sessionToken },
        data: {
            activeTicketId: ticketId,
            lastPresenceAt: new Date()
        }
    });

    res.status(200).json({ status: 'success' });
};

/**
 * Reply to a Ticket
 */
export const replyTicket = async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const { message, isInternalNote } = req.body;
    const ticketId = parseInt(req.params.id);

    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new AppError('Ticket not found', 404);

    const reply = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // 1. Create Reply
        const newReply = await tx.ticketReply.create({
            data: {
                ticketId,
                userId: req.user!.id,
                message,
                attachments: req.body.attachments ? JSON.stringify(req.body.attachments) : null,
                isInternalNote: isInternalNote || false,
            }
        });

        // 2. Update Ticket Status & Last Reply Date
        const newStatus = req.user!.userType === UserType.CLIENT ? 'OPEN' : 'ANSWERED';
        await tx.supportTicket.update({
            where: { id: ticketId },
            data: {
                status: newStatus,
                lastReplyDate: new Date(),
            }
        });

        return newReply;
    });

    // 3. Send Notification (Only if user is NOT currently viewing the ticket)
    try {
        const isClientReply = req.user.userType === UserType.CLIENT || req.user.userType === UserType.RESELLER;

        if (isClientReply) {
            // Notify Admins/Staff who are NOT currently viewing this ticket
            const admins = await prisma.user.findMany({
                where: {
                    userType: { in: [UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF] }
                },
                select: { id: true }
            });

            for (const admin of admins) {
                // Check if admin has an active session on this ticket
                const activeSession = await prisma.session.findFirst({
                    where: {
                        userId: admin.id,
                        activeTicketId: ticketId,
                        lastPresenceAt: {
                            gte: new Date(Date.now() - 30 * 1000) // Active in last 30s
                        }
                    }
                });

                if (!activeSession) {
                    await notificationService.createNotification(
                        admin.id,
                        'INFO',
                        `New Ticket Reply #${ticket.ticketNumber}`,
                        `Client replied to ticket: ${ticket.subject}`,
                        `/admin/support/${ticketId}`
                    );
                }
            }
        } else {
            // Admin replied -> Notify Client if they are NOT viewing
            if (!isInternalNote) {
                const client = await prisma.client.findUnique({
                    where: { id: ticket.clientId },
                    select: { userId: true }
                });

                if (client && client.userId) {
                    const activeSession = await prisma.session.findFirst({
                        where: {
                            userId: client.userId,
                            activeTicketId: ticketId,
                            lastPresenceAt: {
                                gte: new Date(Date.now() - 30 * 1000)
                            }
                        }
                    });

                    if (!activeSession) {
                        await notificationService.createNotification(
                            client.userId,
                            'INFO',
                            `Ticket Reply #${ticket.ticketNumber}`,
                            `Admin replied to your ticket: ${ticket.subject}`,
                            `/support/${ticketId}`
                        );
                    }
                }
            }
        }
    } catch (err) {
        console.error("Failed to send notification for ticket reply:", err);
    }

    res.status(201).json({
        status: 'success',
        data: { reply },
    });
};

/**
 * Update Ticket Status/Priority/Assignee (Admin Only)
 */
export const updateTicket = async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const ticketId = parseInt(req.params.id);

    // Isolation check
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new AppError('Ticket not found', 404);

    if (req.user.userType === UserType.CLIENT) {
        const client = await prisma.client.findUnique({ where: { userId: req.user.id } });
        if (ticket.clientId !== client?.id) throw new AppError('Access denied', 403);
    }
    // Reseller check could be added here if needed

    const updated = await prisma.supportTicket.update({
        where: { id: ticketId },
        data: req.body,
    });

    // Notify other party if ticket is solved (CLOSED)
    if (req.body.status === 'CLOSED' && ticket.status !== 'CLOSED') {
        try {
            const isStaff = ([UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF] as string[]).includes(req.user.userType as string);

            if (isStaff) {
                // Admin closed it -> Notify Client
                const client = await prisma.client.findUnique({
                    where: { id: ticket.clientId },
                    select: { userId: true }
                });

                if (client && client.userId) {
                    await notificationService.createNotification(
                        client.userId,
                        'SUCCESS',
                        `Ticket Resolved: #${ticket.ticketNumber}`,
                        `Your support ticket has been marked as resolved by our team: ${ticket.subject}`,
                        `/support/${ticket.id}`
                    );
                }
            } else {
                // Client/Reseller closed it -> Notify Admins/Staff
                await notificationService.broadcastToAdmins(
                    'SUCCESS',
                    `Ticket Solved: #${ticket.ticketNumber}`,
                    ` The client has marked their support ticket as resolved: ${ticket.subject}`,
                    `/admin/support/${ticket.id}`
                );
            }
        } catch (err) {
            console.error("Failed to send status change notification:", err);
        }
    }

    res.status(200).json({
        status: 'success',
        data: { ticket: updated },
    });
};
