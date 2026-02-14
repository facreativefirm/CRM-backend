import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { UserType, UserStatus } from '@prisma/client';
import { sendEmail, EmailTemplates } from '../services/email.service';

const signToken = (id: number) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'secret', {
        expiresIn: '7d',
    });
};

export const register = async (req: Request, res: Response) => {
    const { username, email, password, firstName, lastName, phoneNumber, whatsAppNumber, userType, resellerId } = req.body;

    // Check for existing user (including guests)
    const existingUser = await prisma.user.findFirst({
        where: {
            OR: [{ email }, { username }],
        },
        include: { client: true }
    }) as any;

    let userToUpdate = null;

    if (existingUser) {
        // Migration Logic: If the existing account is a GUEST account, we allow "migration"
        // provided the email matches. If username matches but it's another person's guest account, we still block.
        if (existingUser.client?.isGuest && existingUser.email === email) {
            userToUpdate = existingUser;
        } else {
            throw new AppError('User with this email or username already exists', 400);
        }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Check if this is the first user
    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;

    let user;
    if (userToUpdate) {
        // 1. Migrate Guest to Full Client
        user = await prisma.user.update({
            where: { id: userToUpdate.id },
            data: {
                username, // Update to their chosen username
                passwordHash,
                firstName,
                lastName,
                phoneNumber,
                whatsAppNumber,
                userType: isFirstUser ? UserType.SUPER_ADMIN : ((userType as UserType) || UserType.CLIENT),
                status: UserStatus.ACTIVE,
                client: {
                    update: {
                        isGuest: false, // No longer a guest
                        resellerId: resellerId ? parseInt(resellerId.toString()) : null
                    }
                }
            }
        });
    } else {
        // 2. Standard Registration
        // If first user, make SUPER_ADMIN and skip client record
        if (isFirstUser) {
            user = await prisma.user.create({
                data: {
                    username,
                    email,
                    passwordHash,
                    firstName,
                    lastName,
                    phoneNumber,
                    whatsAppNumber,
                    userType: UserType.SUPER_ADMIN,
                    status: UserStatus.ACTIVE
                }
            });
        } else {
            user = await prisma.user.create({
                data: {
                    username,
                    email,
                    passwordHash,
                    firstName,
                    lastName,
                    phoneNumber,
                    whatsAppNumber,
                    userType: (userType as UserType) || UserType.CLIENT,
                    status: UserStatus.ACTIVE,
                    client: {
                        create: {
                            resellerId: resellerId ? parseInt(resellerId.toString()) : null
                        }
                    }
                }
            });
        }
    }

    const newUser = user;
    const clientRecord = await prisma.client.findUnique({ where: { userId: newUser.id } });
    if (clientRecord) {
        // Sales Team Tracking: Link prospect to client if matches
        try {
            const { salesTeamService } = await import('../services/salesTeam.service');
            await salesTeamService.linkProspectToClient(email, phoneNumber, clientRecord.id);
        } catch (err) {
            console.error('[SalesTeam] Failed to link prospect:', err);
        }
    }

    // Send Emails
    try {
        const { subject, body } = EmailTemplates.welcome(firstName);
        await sendEmail(email, subject, body);

        // Notify Admins
        const admins = await prisma.user.findMany({
            where: { userType: { in: [UserType.ADMIN, UserType.SUPER_ADMIN] }, status: 'ACTIVE' },
            select: { email: true }
        });

        const adminNotification = EmailTemplates.adminTransitionNotification(
            'New User Registration',
            `User: ${firstName} ${lastName} (${email})\nType: ${userType || 'CLIENT'}\nUsername: ${username}`
        );

        for (const admin of admins) {
            if (admin.email) {
                try {
                    await sendEmail(admin.email, adminNotification.subject, adminNotification.body);
                } catch (sendErr) {
                    console.error(`Failed to send registration email to admin ${admin.email}:`, sendErr);
                }
            }
        }
    } catch (emailError) {
        console.error('Registration email failed:', emailError);
    }

    const token = signToken(newUser.id);

    res.status(201).json({
        status: 'success',
        token,
        data: {
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                userType: newUser.userType,
                status: newUser.status,
                whatsAppNumber: newUser.whatsAppNumber
            },
        },
    });
};

export const login = async (req: Request, res: Response) => {
    console.log('[Auth] Login attempt received:', { identifier: req.body.identifier });
    const { identifier, password } = req.body;

    if (!identifier || !password) {
        throw new AppError('Please provide email/username and password', 400);
    }

    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { email: identifier },
                { username: identifier }
            ]
        }
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        throw new AppError('Incorrect email or password', 401);
    }

    if (user.status !== UserStatus.ACTIVE) {
        throw new AppError(`Your account is ${user.status}. Please contact support.`, 403);
    }

    // Update last login
    await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
    });

    // Generate JWT token
    const token = signToken(user.id);

    // Create session in database
    const sessionToken = jwt.sign(
        { userId: user.id, timestamp: Date.now() },
        process.env.JWT_SECRET || 'secret'
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    await prisma.session.create({
        data: {
            userId: user.id,
            sessionToken,
            ipAddress: req.ip || req.socket.remoteAddress || null,
            userAgent: req.headers['user-agent'] || null,
            expiresAt,
        },
    });

    res.status(200).json({
        status: 'success',
        token,
        data: {
            sessionToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                phoneNumber: user.phoneNumber,
                whatsAppNumber: user.whatsAppNumber,
                userType: user.userType,
                status: user.status,
            },
        },
    });
};

export const me = async (req: any, res: Response) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
            client: true,
            staff: true,
            salesTeamMember: true,
        },
    });

    res.status(200).json({
        status: 'success',
        data: {
            user,
        },
    });
};

export const logout = async (req: any, res: Response) => {
    const sessionToken = req.headers['x-session-token'] as string;

    if (sessionToken) {
        // Delete the session from database
        await prisma.session.deleteMany({
            where: { sessionToken },
        });
    }

    // Also delete all sessions for this user if requested
    const logoutAll = req.body.logoutAll;
    if (logoutAll && req.user) {
        await prisma.session.deleteMany({
            where: { userId: req.user.id },
        });
    }

    res.status(200).json({
        status: 'success',
        message: 'Logged out successfully',
    });
};

export const updateMe = async (req: any, res: Response) => {
    const { firstName, lastName, phoneNumber, whatsAppNumber, currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Fetch user
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);

    const updateData: any = {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(phoneNumber !== undefined && { phoneNumber }),
        ...(whatsAppNumber !== undefined && { whatsAppNumber }),
    };

    // Password Update Logic
    if (newPassword) {
        if (!currentPassword) {
            throw new AppError('Please provide your current password to set a new one', 400);
        }

        const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isMatch) {
            throw new AppError('The current password you provided is incorrect', 400);
        }

        updateData.passwordHash = await bcrypt.hash(newPassword, 12);
    }

    const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
            id: true,
            username: true,
            email: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            whatsAppNumber: true,
            userType: true,
            status: true,
        }
    });

    res.status(200).json({
        status: 'success',
        data: { user: updatedUser },
    });
};
