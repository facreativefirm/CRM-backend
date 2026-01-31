import { Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { ClientStatus, UserType, ContactType, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { WebhookService } from '../services/webhook.service';

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
    const clientId = parseInt(req.params.id as string);

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
    try {
        const isReseller = req.user?.userType === UserType.RESELLER;
        const clientId = parseInt(req.params.id as string);

        // 1. Check existence and permission
        const existingClient = await prisma.client.findUnique({
            where: { id: clientId },
            include: { user: true, contacts: { where: { isPrimary: true } } }
        });

        if (!existingClient || (isReseller && existingClient.resellerId !== req.user?.id)) {
            throw new AppError('Client not found or access denied', 404);
        }

        const {
            firstName, lastName, email, whatsAppNumber, password,
            companyName, businessType, taxId, status, currency, notes, groupId,
            phone, address1, address2, city, state, zip, country
        } = req.body;

        // 2. Perform updates in a transaction
        const updatedClient = await prisma.$transaction(async (tx) => {
            // Map Client status to User status for nested update
            let userStatus: UserStatus = UserStatus.ACTIVE;
            if (status === 'INACTIVE' || status === 'CLOSED') userStatus = UserStatus.INACTIVE;

            // Prepare User Nested Update Data
            const userUpdateData: any = {
                ...(firstName && { firstName }),
                ...(lastName && { lastName }),
                ...(email && { email }),
                ...(whatsAppNumber !== undefined && { whatsAppNumber }),
                ...(status && { status: userStatus }),
            };

            // Add passwordHash if password is provided
            if (password && typeof password === 'string' && password.trim().length >= 8) {
                userUpdateData.passwordHash = await bcrypt.hash(password, 12);
            }

            // Update or Create Primary Contact
            const primaryContact = existingClient.contacts[0];
            const contactData = {
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
            };

            if (primaryContact) {
                await tx.clientContact.update({
                    where: { id: primaryContact.id },
                    data: contactData
                });
            } else if (Object.keys(contactData).length > 0) {
                await tx.clientContact.create({
                    data: {
                        ...contactData,
                        clientId,
                        contactType: ContactType.PRIMARY,
                        isPrimary: true,
                        firstName: firstName || existingClient.user.firstName || 'Client',
                        lastName: lastName || existingClient.user.lastName || 'Profile',
                        email: email || existingClient.user.email,
                    } as any
                });
            }

            // Update Client Profile with Nested User Update
            return await tx.client.update({
                where: { id: clientId },
                data: {
                    ...(companyName && { companyName }),
                    ...(businessType && { businessType }),
                    ...(taxId && { taxId }),
                    ...(status && { status: status as ClientStatus }),
                    ...(currency && { currency }),
                    ...(notes !== undefined && { notes }),
                    ...(groupId !== undefined && {
                        group: groupId ? { connect: { id: parseInt(groupId as string) } } : { disconnect: true }
                    }),
                    // NESTED USER UPDATE
                    user: {
                        update: userUpdateData
                    }
                },
                include: { user: true, contacts: true }
            });
        });

        res.status(200).json({
            status: 'success',
            data: { client: updatedClient },
        });

        // Webhook Dispatch
        WebhookService.dispatch('client.updated', updatedClient).catch(e => console.error("Webhook dispatch failed", e));

    } catch (error: any) {
        console.error('[UpdateClient Error]:', error);
        res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
    }
};

/**
 * Client Contacts Management
 */
export const createContact = async (req: AuthRequest, res: Response) => {
    const clientId = parseInt(req.params.clientId as string);

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
        where: { clientId: parseInt(req.params.clientId as string) }
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
        username, email, password, firstName, lastName, whatsAppNumber,
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
                whatsAppNumber,
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
                groupId: groupId ? parseInt(groupId as string) : undefined,
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

    // 4. Sales Team Tracking: Link prospect to client if matches (automatically awards points)
    try {
        const { salesTeamService } = await import('../services/salesTeam.service');
        await salesTeamService.linkProspectToClient(email, phone, result.client.id, req.user?.id);
    } catch (err) {
        console.error('[SalesTeam] Failed to link manual prospect:', err);
    }

    // Webhook Dispatch
    WebhookService.dispatch('client.created', result.client).catch(e => console.error("Webhook dispatch failed", e));


    res.status(201).json({
        status: 'success',
        data: result
    });
};

/**
 * Manually trigger a consolidated renewal notice for potentially expiring services/domains
 */
export const sendConsolidatedRenewalNotice = async (req: AuthRequest, res: Response) => {
    const clientId = parseInt(req.params.id as string);

    // 1. Fetch the client
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        include: { user: true }
    });

    if (!client) throw new AppError('Client not found', 404);

    // 2. Fetch potentially expiring items (expiring in next 30 days)
    const itemsToRenew: { type: 'SERVICE' | 'DOMAIN', itemId: number }[] = [];

    // Services
    const services = await prisma.service.findMany({
        where: {
            clientId,
            status: 'ACTIVE',
            nextDueDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
        }
    });
    for (const s of services) itemsToRenew.push({ type: 'SERVICE', itemId: s.id });

    // Domains
    const domains = await prisma.domain.findMany({
        where: {
            clientId,
            status: 'ACTIVE',
            expiryDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
        }
    });
    for (const d of domains) itemsToRenew.push({ type: 'DOMAIN', itemId: d.id });

    if (itemsToRenew.length === 0) {
        return res.status(200).json({
            status: 'success',
            message: 'No items currently qualify for renewal notice (nothing expiring in 30 days).'
        });
    }

    // 3. Trigger the consolidated invoice and notification logic
    const { createConsolidatedRenewalInvoice } = await import('../services/invoiceService');
    const invoice = await createConsolidatedRenewalInvoice(clientId, itemsToRenew);

    if (!invoice) {
        return res.status(200).json({
            status: 'success',
            message: 'A consolidated invoice for these items either already exists or could not be generated.'
        });
    }

    res.status(200).json({
        status: 'success',
        message: 'Consolidated renewal invoice generated and client notified.',
        data: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, itemCount: itemsToRenew.length }
    });
};
