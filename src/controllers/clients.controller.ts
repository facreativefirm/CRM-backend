import { Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { ClientStatus, UserType, ContactType, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * List clients with reseller isolation
 */
export const getClients = async (req: AuthRequest, res: Response) => {
    const isReseller = req.user?.userType === UserType.RESELLER;

    const clients = await prisma.client.findMany({
        where: {
            ...(isReseller ? { resellerId: req.user?.id } : {}),
        },
        include: {
            user: {
                select: {
                    username: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    status: true,
                }
            },
            group: true,
        },
        orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
        status: 'success',
        results: clients.length,
        data: { clients },
    });
};

/**
 * Get single client with detail
 */
export const getClient = async (req: AuthRequest, res: Response) => {
    const isReseller = req.user?.userType === UserType.RESELLER;
    const clientId = parseInt(req.params.id);

    const client = await prisma.client.findUnique({
        where: { id: clientId },
        include: {
            user: true,
            contacts: true,
            group: true,
            services: {
                include: { product: true }
            },
            invoices: true,
            tickets: true,
            domains: true,
            customFieldValues: {
                include: { field: true }
            }
        }
    });

    if (!client) {
        throw new AppError('No client found with that ID', 404);
    }

    // Isolation check
    if (isReseller && client.resellerId !== req.user?.id) {
        throw new AppError('You do not have permission to access this client', 403);
    }

    res.status(200).json({
        status: 'success',
        data: { client },
    });
};

/**
 * Update client details
 */
export const updateClient = async (req: AuthRequest, res: Response) => {
    const isReseller = req.user?.userType === UserType.RESELLER;
    const clientId = parseInt(req.params.id);

    // 1. Check existence and permission
    const existingClient = await prisma.client.findUnique({
        where: { id: clientId },
        include: { user: true, contacts: { where: { isPrimary: true } } }
    });

    if (!existingClient || (isReseller && existingClient.resellerId !== req.user?.id)) {
        throw new AppError('Client not found or access denied', 404);
    }

    const {
        firstName, lastName, email,
        companyName, status, currency, notes, groupId,
        phone, address1, address2, city, state, zip, country
    } = req.body;

    // 2. Perform updates in a transaction
    const updatedClient = await prisma.$transaction(async (tx) => {
        // Update User if needed
        if (firstName || lastName || email) {
            await tx.user.update({
                where: { id: existingClient.userId },
                data: {
                    ...(firstName && { firstName }),
                    ...(lastName && { lastName }),
                    ...(email && { email }),
                }
            });
        }

        // Update Primary Contact if needed
        const primaryContact = existingClient.contacts[0];
        if (primaryContact && (firstName || lastName || email || phone || address1 || address2 || city || state || zip || country)) {
            await tx.clientContact.update({
                where: { id: primaryContact.id },
                data: {
                    ...(firstName && { firstName }),
                    ...(lastName && { lastName }),
                    ...(email && { email }),
                    ...(phone && { phone }),
                    ...(address1 && { address1 }),
                    ...(address2 && { address2 }),
                    ...(city && { city }),
                    ...(state && { state }),
                    ...(zip && { zip }),
                    ...(country && { country }),
                }
            });
        }

        // Update Client Profile
        return await tx.client.update({
            where: { id: clientId },
            data: {
                ...(companyName && { companyName }),
                ...(status && { status }),
                ...(currency && { currency }),
                ...(notes !== undefined && { notes }),
                ...(groupId && { groupId }),
            },
            include: { user: true, contacts: true }
        });
    });

    res.status(200).json({
        status: 'success',
        data: { client: updatedClient },
    });
};

/**
 * Client Contacts Management
 */
export const createContact = async (req: AuthRequest, res: Response) => {
    const clientId = parseInt(req.params.clientId);

    const contact = await prisma.clientContact.create({
        data: {
            ...req.body,
            clientId,
        }
    });

    res.status(201).json({
        status: 'success',
        data: { contact },
    });
};

export const getContacts = async (req: AuthRequest, res: Response) => {
    const contacts = await prisma.clientContact.findMany({
        where: { clientId: parseInt(req.params.clientId) }
    });

    res.status(200).json({
        status: 'success',
        data: { contacts },
    });
};


/**
 * Create a new client from admin panel
 */
export const createClient = async (req: AuthRequest, res: Response) => {
    const {
        username, email, password, firstName, lastName,
        companyName, businessType, taxId, currency, notes, groupId,
        address1, address2, city, state, zip, country, phone
    } = req.body;

    // 1. Check if user already exists
    const existingUser = await prisma.user.findFirst({
        where: { OR: [{ email }, { username }] }
    });

    if (existingUser) {
        throw new AppError('User with this email or username already exists', 400);
    }

    // 2. Hash password
    const passwordHash = await bcrypt.hash(password || 'Client123!', 10);

    // 3. Create everything in a transaction
    const result = await prisma.$transaction(async (tx) => {
        // Create User
        const user = await tx.user.create({
            data: {
                username,
                email,
                passwordHash,
                firstName,
                lastName,
                userType: UserType.CLIENT,
                status: UserStatus.ACTIVE,
            }
        });

        // Create Client Profile
        const client = await tx.client.create({
            data: {
                userId: user.id,
                companyName,
                businessType,
                taxId,
                currency: currency || 'USD',
                notes,
                groupId: groupId ? parseInt(groupId) : undefined,
                resellerId: req.user?.userType === UserType.RESELLER ? req.user.id : undefined,
            }
        });

        // Create Primary Contact
        await tx.clientContact.create({
            data: {
                clientId: client.id,
                contactType: ContactType.PRIMARY,
                firstName: firstName || 'Main',
                lastName: lastName || 'Contact',
                email,
                phone,
                address1,
                address2,
                city,
                state,
                zip,
                country,
                isPrimary: true
            }
        });

        return { user, client };
    });

    res.status(201).json({
        status: 'success',
        data: result
    });
};
