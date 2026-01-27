import { Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export const initiateGuestSupport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { name, email, phone, subject, message } = req.body;

        // Input validation
        if (!name || !email || !subject || !message) {
            throw new AppError('Missing required fields: name, email, subject, and message are required.', 400);
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new AppError('Invalid email format.', 400);
        }

        // Validate name (no special characters, reasonable length)
        if (name.length < 2 || name.length > 100 || /[<>{}\[\]\\]/.test(name)) {
            throw new AppError('Invalid name format. Name must be between 2-100 characters and contain no special symbols.', 400);
        }

        // Validate subject and message length
        if (subject.length < 3 || subject.length > 200) {
            throw new AppError('Subject must be between 3-200 characters.', 400);
        }

        if (message.length < 10 || message.length > 5000) {
            throw new AppError('Message must be between 10-5000 characters.', 400);
        }

        // Basic spam detection - check for excessive URLs or suspicious patterns
        const urlPattern = /(https?:\/\/[^\s]+)/g;
        const urlMatches = message.match(urlPattern) || [];
        if (urlMatches.length > 3) {
            throw new AppError('Message contains too many links. Please remove some links and try again.', 400);
        }

        // Check for repeated characters (spam indicator)
        const repeatedCharsPattern = /(.)\1{10,}/;
        if (repeatedCharsPattern.test(message) || repeatedCharsPattern.test(subject)) {
            throw new AppError('Message contains suspicious patterns. Please rephrase and try again.', 400);
        }

        // Validate phone if provided
        if (phone && (phone.length < 7 || phone.length > 20 || /[<>{}\[\]\\]/.test(phone))) {
            throw new AppError('Invalid phone number format.', 400);
        }

        // Get IP address from request
        const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
            || req.headers['x-real-ip'] as string
            || req.socket.remoteAddress
            || 'unknown';

        const userAgent = (req.headers['user-agent'] as string) || 'unknown';

        // Rate limiting check: Max 3 tickets per IP in 24 hours
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const recentActivities = await (prisma as any).guestActivity.count({
            where: {
                ipAddress,
                activityType: 'TICKET_INITIATION',
                createdAt: { gte: twentyFourHoursAgo }
            }
        });

        if (recentActivities >= 3) {
            throw new AppError('Rate limit exceeded. You can only create 3 support tickets per 24 hours. Please try again later or contact us directly.', 429);
        }

        // Check if user already exists with this email
        let user = await prisma.user.findUnique({
            where: { email },
            include: { client: true } as any
        });

        let client: any;
        let isNewGuest = false;

        if (!user) {
            // Create new guest user
            const randomPassword = Math.random().toString(36).slice(-12);
            const hashedPassword = await bcrypt.hash(randomPassword, 10);

            const newUser = await prisma.user.create({
                data: {
                    email,
                    username: email,
                    passwordHash: hashedPassword,
                    firstName: name.split(' ')[0] || name,
                    lastName: name.split(' ').slice(1).join(' ') || '',
                    phoneNumber: phone,
                    userType: 'CLIENT',
                    status: 'ACTIVE',
                    client: {
                        create: {
                            status: 'ACTIVE',
                            isGuest: true,
                            guestIpAddress: ipAddress,
                            language: 'en',
                            currency: 'USD'
                        } as any
                    }
                },
                include: { client: true } as any
            });

            user = newUser;
            client = (newUser as any).client;
            isNewGuest = true;
        } else {
            client = (user as any).client;

            // If the user exists but has no client record, create one (this shouldn't happen normally)
            if (!client) {
                client = await prisma.client.create({
                    data: {
                        userId: user.id,
                        status: 'ACTIVE',
                        isGuest: true,
                        guestIpAddress: ipAddress
                    } as any
                });
            }
        }

        if (!client) {
            throw new AppError('Failed to create or find client record', 500);
        }

        // Get default department or create one if none exists
        let department = await prisma.ticketDepartment.findFirst();

        if (!department) {
            console.log('[GuestSupport] No departments found, creating default "General Support"');
            department = await prisma.ticketDepartment.create({
                data: {
                    name: 'General Support',
                    email: 'support@example.com',
                    autoresponderEnabled: true
                }
            });
        }

        // Create support ticket
        const ticketNumber = `TKT-${Math.floor(100000 + Math.random() * 900000)}`;

        const ticket = await (prisma as any).supportTicket.create({
            data: {
                ticketNumber,
                clientId: client.id,
                subject,
                priority: 'MEDIUM',
                departmentId: department.id,
                status: 'OPEN',
                assignedToId: department.assignedSupportId || null,
                replies: {
                    create: {
                        userId: user!.id,
                        message
                    }
                }
            },
            include: {
                replies: {
                    include: { user: true }
                },
                department: true
            }
        });

        // Log guest activity
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

        await (prisma as any).guestActivity.create({
            data: {
                ipAddress,
                email,
                name,
                phone,
                ticketId: ticket.id,
                activityType: 'TICKET_INITIATION',
                userAgent,
                expiresAt
            }
        });

        // Generate short random session token (prevents truncation in DB and 401 errors)
        const sessionToken = crypto.randomBytes(32).toString('hex');

        // Create session in database
        await prisma.session.create({
            data: {
                userId: user!.id,
                sessionToken,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
                ipAddress,
                userAgent,
                activeTicketId: ticket.id
            } as any
        });

        // Notify admins about new guest ticket
        try {
            const { notifyAdmins } = await import('../services/socketService');
            // Socket Notification (Real-time)
            notifyAdmins('new_ticket', ticket);

            // Existing Log/DB notification logic
            const notificationService = await import('../services/notificationService');
            await notificationService.broadcastToAdmins(
                'INFO',
                `New Guest Ticket: #${ticketNumber}`,
                `A guest user has opened a support ticket: ${subject}`,
                `/admin/support/${ticket.id}`
            );
        } catch (err) {
            console.error('Failed to notify admins about guest ticket:', err);
        }

        res.status(201).json({
            status: 'success',
            message: isNewGuest
                ? 'Support ticket created successfully. You can now chat with our team.'
                : 'Welcome back! Your support ticket has been created.',
            data: {
                ticket,
                sessionToken,
                user: {
                    id: user!.id,
                    email: user!.email,
                    username: user!.username,
                    userType: user!.userType,
                    status: user!.status,
                    firstName: user!.firstName,
                    lastName: user!.lastName
                }
            }
        });

    } catch (error) {
        // Forward error to global error handler
        if (error instanceof AppError) {
            next(error);
        } else {
            console.error('[GuestSupport] Unexpected error:', error);
            next(new AppError('An unexpected error occurred while creating your ticket.', 500));
        }
    }
};

/**
 * Get Guest Activity Stats (Admin Only)
 */
export const getGuestActivityStats = async (req: AuthRequest, res: Response) => {
    const { ipAddress, hours = 24 } = req.query;

    const timeAgo = new Date(Date.now() - Number(hours) * 60 * 60 * 1000);

    const where: any = {
        createdAt: { gte: timeAgo }
    };

    if (ipAddress) {
        where.ipAddress = ipAddress as string;
    }

    const [totalActivities, uniqueIPs, ticketsCreated] = await Promise.all([
        (prisma as any).guestActivity.count({ where }),
        (prisma as any).guestActivity.groupBy({
            by: ['ipAddress'],
            where,
            _count: { id: true }
        }),
        (prisma as any).guestActivity.count({
            where: {
                ...where,
                ticketId: { not: null }
            }
        })
    ]);

    // Find IPs that hit the rate limit
    const rateLimitedIPs = uniqueIPs.filter((ip: any) => ip._count.id >= 3);

    res.status(200).json({
        status: 'success',
        data: {
            totalActivities,
            uniqueIPCount: uniqueIPs.length,
            ticketsCreated,
            rateLimitedIPs: rateLimitedIPs.map((ip: any) => ({
                ipAddress: ip.ipAddress,
                activityCount: ip._count.id
            })),
            timeRange: `Last ${hours} hours`
        }
    });
};

/**
 * Clean up expired guest activities (Cron job)
 */
export const cleanupExpiredGuestActivities = async () => {
    const now = new Date();

    const result = await (prisma as any).guestActivity.deleteMany({
        where: {
            expiresAt: { lt: now }
        }
    });

    console.log(`[Guest Cleanup] Removed ${result.count} expired guest activity records`);
    return result.count;
};

/**
 * Purge old guest data (Users, Clients, Tickets, Replies, Sessions) older than 7 days
 */
export const purgeOldGuestData = async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    try {
        // 1. Find all guest clients older than 7 days
        const oldGuestClients = await prisma.client.findMany({
            where: {
                isGuest: true,
                createdAt: { lt: sevenDaysAgo }
            },
            include: {
                user: true
            }
        });

        if (oldGuestClients.length === 0) {
            console.log('[Guest Purge] No old guest data to remove.');
            return 0;
        }

        const clientIds = oldGuestClients.map(c => c.id);
        const userIds = oldGuestClients.map(c => c.userId);
        const emails = oldGuestClients.map(c => c.user.email);

        console.log(`[Guest Purge] Starting purge for ${oldGuestClients.length} guest accounts...`);

        // 2. Cascading cleanup (manual to avoid FK constraint issues)

        // Delete Ticket Replies created by these users
        await (prisma as any).ticketReply.deleteMany({
            where: { userId: { in: userIds } }
        });

        // Delete Guest Activities for these tickets/emails
        await (prisma as any).guestActivity.deleteMany({
            where: {
                OR: [
                    { email: { in: emails } },
                    { ticket: { clientId: { in: clientIds } } }
                ]
            }
        });

        // Delete Support Tickets for these clients
        await (prisma as any).supportTicket.deleteMany({
            where: { clientId: { in: clientIds } }
        });

        // Delete Sessions for these users
        await prisma.session.deleteMany({
            where: { userId: { in: userIds } }
        });

        // Delete Clients
        await prisma.client.deleteMany({
            where: { id: { in: clientIds } }
        });

        // Finally, Delete Users
        const result = await prisma.user.deleteMany({
            where: { id: { in: userIds } }
        });

        console.log(`[Guest Purge] Successfully removed ${result.count} guest accounts and all associated records.`);
        return result.count;
    } catch (err) {
        console.error('[Guest Purge] Critical error during data purge:', err);
        return 0;
    }
};
