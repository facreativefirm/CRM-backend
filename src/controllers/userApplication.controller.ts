import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { UserType, ApplicationStatus, UserStatus } from '@prisma/client';
import emailService from '../services/email.service';

export const submitApplication = async (req: Request, res: Response) => {
    const {
        firstName,
        lastName,
        email,
        username,
        password,
        phoneNumber,
        userType,
        reason
    } = req.body;

    // Basic validation
    if (!firstName || !lastName || !email || !username || !password || !userType) {
        throw new AppError('Missing required fields', 400);
    }

    // Check if user already exists in User table
    const existingUser = await prisma.user.findFirst({
        where: { OR: [{ email }, { username }] }
    });
    if (existingUser) {
        throw new AppError('A user with this email or username already exists.', 400);
    }

    // Check if there is already a pending application with this email/username
    const existingApp = await prisma.userApplication.findFirst({
        where: {
            OR: [{ email }, { username }],
            status: ApplicationStatus.PENDING
        }
    });
    if (existingApp) {
        throw new AppError('You already have a pending application.', 400);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const application = await prisma.userApplication.create({
        data: {
            firstName,
            lastName,
            email,
            username,
            passwordHash,
            phoneNumber,
            userType: userType as UserType,
            reason,
            status: ApplicationStatus.PENDING
        }
    });

    res.status(201).json({
        status: 'success',
        message: 'Application submitted successfully. You will be notified via email once reviewed.',
        data: { applicationId: application.id }
    });
};

export const getApplications = async (req: Request, res: Response) => {
    const status = req.query.status as ApplicationStatus;
    const applications = await prisma.userApplication.findMany({
        where: status ? { status } : {},
        orderBy: { createdAt: 'desc' }
    });

    res.json({
        status: 'success',
        results: applications.length,
        data: applications
    });
};

export const processApplication = async (req: any, res: Response) => {
    const { id } = req.params;
    const { status, adminNotes } = req.body;
    const adminId = req.user.id;

    if (![ApplicationStatus.APPROVED, ApplicationStatus.REJECTED].includes(status)) {
        throw new AppError('Invalid status update', 400);
    }

    const application = await prisma.userApplication.findUnique({
        where: { id: parseInt(id as string) }
    });

    if (!application) throw new AppError('Application not found', 404);
    if (application.status !== ApplicationStatus.PENDING) {
        throw new AppError('This application has already been processed.', 400);
    }

    if (status === ApplicationStatus.APPROVED) {
        await prisma.$transaction(async (tx) => {
            // Create the User
            const newUser = await tx.user.create({
                data: {
                    username: application.username,
                    email: application.email,
                    passwordHash: application.passwordHash,
                    firstName: application.firstName,
                    lastName: application.lastName,
                    phoneNumber: application.phoneNumber,
                    userType: application.userType,
                    status: UserStatus.ACTIVE
                }
            });

            // Create specific profiles based on type
            if (application.userType === UserType.STAFF || application.userType === UserType.ADMIN) {
                await tx.staff.create({
                    data: { userId: newUser.id }
                });
            } else if (application.userType === UserType.RESELLER) {
                // Basic reseller profile
                // You might want to create a Reseller record here if you have one, 
                // but usually Reseller is just a UserType. 
                // If there is a "Reseller" model, initialize it here.
            } else if (application.userType === UserType.INVESTOR) {
                // Initialize Investor Profile with defaults
                await tx.investor.create({
                    data: {
                        userId: newUser.id,
                        commissionValue: 5.00, // Default 5%
                        commissionType: 'PERCENTAGE',
                        status: 'ACTIVE'
                    }
                });
            }

            // If it's for Sales (which we use STAFF for usually, or we can check if it's SALES)
            // The user mentioned "sells department". 
            // If they are STAFF, we might also want to add them to SalesTeamMember if that's the intention.
            // Let's assume STAFF for sales department needs a SalesTeamMember profile.
            if (application.reason?.toLowerCase().includes('sales') || application.reason?.toLowerCase().includes('sells')) {
                await tx.salesTeamMember.create({
                    data: { userId: newUser.id }
                });
            }

            // Update application
            await tx.userApplication.update({
                where: { id: application.id },
                data: {
                    status: ApplicationStatus.APPROVED,
                    adminNotes,
                    processedAt: new Date(),
                    processedById: adminId
                }
            });

            // Send Approval Email
            try {
                await emailService.sendEmail(
                    application.email,
                    'Your Account Application has been Approved',
                    `<h1>Account Approved</h1><p>Hello ${application.firstName},</p><p>Your application for a <strong>${application.userType}</strong> account has been approved.</p><p>You can now log in using your username: <strong>${application.username}</strong></p>`
                );
            } catch (err) {
                console.error('Failed to send approval email:', err);
            }
        });

        res.json({ status: 'success', message: 'Application approved and user created.' });
    } else {
        // REJECTED
        await prisma.userApplication.update({
            where: { id: application.id },
            data: {
                status: ApplicationStatus.REJECTED,
                adminNotes,
                processedAt: new Date(),
                processedById: adminId
            }
        });

        // Send Rejection Email
        try {
            await emailService.sendEmail(
                application.email,
                'Update on Your Account Application',
                `<h1>Application Status Update</h1><p>Hello ${application.firstName},</p><p>We regret to inform you that your application for a <strong>${application.userType}</strong> account has been rejected.</p><p><strong>Admin Notes:</strong> ${adminNotes || 'No specific reason provided.'}</p>`
            );
        } catch (err) {
            console.error('Failed to send rejection email:', err);
        }

        res.json({ status: 'success', message: 'Application rejected.' });
    }
};
