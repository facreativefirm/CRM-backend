import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { UserType, UserStatus } from '@prisma/client';

const signToken = (id: number) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'secret', {
        expiresIn: '7d',
    });
};

export const register = async (req: Request, res: Response) => {
    const { username, email, password, firstName, lastName, phoneNumber, userType } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
        where: {
            OR: [{ email }, { username }],
        },
    });

    if (existingUser) {
        throw new AppError('User with this email or username already exists', 400);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const newUser = await prisma.user.create({
        data: {
            username,
            email,
            passwordHash,
            firstName,
            lastName,
            phoneNumber,
            userType: (userType as UserType) || UserType.CLIENT,
            status: UserStatus.ACTIVE,
        },
    });

    // If it's a client, create an empty client profile
    if (newUser.userType === UserType.CLIENT) {
        await prisma.client.create({
            data: {
                userId: newUser.id,
            },
        });
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
