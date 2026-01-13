import { Request, Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { ProvisioningService } from '../services/provisioningService';
import { UserType, ServiceStatus } from '@prisma/client';
import { sendEmail, EmailTemplates } from '../services/email.service';
import * as invoiceService from '../services/invoiceService';
import * as notificationService from '../services/notificationService';

/**
 * List Services with isolation
 */
export const getServices = async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const { status, clientId } = req.query;
    const isReseller = req.user.userType === UserType.RESELLER;

    const services = await prisma.service.findMany({
        where: {
            ...(status && { status: status as ServiceStatus }),
            ...(clientId && { clientId: parseInt(clientId as string) }),
            ...(isReseller ? { client: { resellerId: req.user.id } } : {}),
            ...(req.user.userType === UserType.CLIENT ? { clientId: (await prisma.client.findUnique({ where: { userId: req.user.id } }))?.id } : {}),
        },
        include: {
            client: { include: { user: true } },
            product: { include: { productService: true } },
            server: true,
            expiryNotificationRecords: {
                orderBy: { sentAt: 'desc' },
                take: 1
            }
        },
        orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
        status: 'success',
        results: services.length,
        data: { services },
    });
};

/**
 * Create a new Service (Manual Provisioning)
 */
export const createService = async (req: AuthRequest, res: Response) => {
    // Data is pre-validated and transformed by createServiceSchema
    const {
        clientId, productId, serverId, billingCycle, domain,
        status, amount, nextDueDate, username, password, ipAddress
    } = req.body;

    const service = await prisma.service.create({
        data: {
            clientId,
            productId,
            serverId: serverId || null,
            billingCycle,
            domain,
            status: status || 'PENDING',
            amount: amount || 0,
            nextDueDate: nextDueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            username,
            passwordHash: password,
            ipAddress
        }
    });

    res.status(201).json({
        status: 'success',
        data: { service },
    });
};

/**
 * Get Single Service
 */
export const getService = async (req: AuthRequest, res: Response) => {
    const service = await prisma.service.findUnique({
        where: { id: parseInt(req.params.id) },
        include: {
            client: { include: { user: true } },
            product: { include: { productService: true } },
            server: true,
        },
    });

    if (!service) throw new AppError('Service not found', 404);

    // Isolation check
    if (!req.user) throw new AppError('Unauthorized', 401);
    if (req.user.userType === UserType.CLIENT) {
        const client = await prisma.client.findUnique({ where: { userId: req.user.id } });
        if (service.clientId !== client?.id) throw new AppError('Access denied', 403);
    }

    res.status(200).json({
        status: 'success',
        data: { service },
    });
};

/**
 * Update Service details (Admin Only)
 */
export const updateService = async (req: AuthRequest, res: Response) => {
    const serviceId = parseInt(req.params.id);
    const {
        clientId, productId, serverId, amount, nextDueDate,
        password, ...otherData
    } = req.body;

    // 1. Prepare data for Prisma, mapping frontend fields to DB fields
    const updateData: any = {
        ...otherData,
        ...(clientId && { clientId: parseInt(clientId) }),
        ...(productId && { productId: parseInt(productId) }),
        ...(serverId !== undefined && { serverId: serverId ? parseInt(serverId) : null }),
        ...(amount !== undefined && { amount: parseFloat(amount) }),
        ...(nextDueDate && { nextDueDate: new Date(nextDueDate) }),
        ...(password && { passwordHash: password }), // Map password to passwordHash
    };

    // 2. Perform the update
    try {
        const updated = await prisma.service.update({
            where: { id: serviceId },
            data: updateData,
            include: { product: true, server: true }
        });

        res.status(200).json({
            status: 'success',
            data: { service: updated },
        });
    } catch (error: any) {
        console.error("Update Service Error:", error);
        throw new AppError(error.message || 'Failed to update service', 500);
    }
};

/**
 * Change Service Password (Client/Reseller)
 */
export const changeServicePassword = async (req: AuthRequest, res: Response) => {
    const serviceId = parseInt(req.params.id);
    const { password } = req.body;

    if (!password || password.length < 6) {
        throw new AppError('Password must be at least 6 characters', 400);
    }

    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) throw new AppError('Service not found', 404);

    // Ownership check
    if (req.user?.userType === UserType.CLIENT || req.user?.userType === UserType.RESELLER) {
        const client = await prisma.client.findUnique({ where: { userId: req.user.id } });
        if (service.clientId !== client?.id) throw new AppError('Access denied', 403);
    }

    await prisma.service.update({
        where: { id: serviceId },
        data: { passwordHash: password } // In a real app, hash this!
    });

    res.status(200).json({
        status: 'success',
        message: 'Password updated successfully'
    });
};

/**
 * Provisioning Actions
 */
export const performAction = async (req: AuthRequest, res: Response) => {
    const { action } = req.body;
    const serviceId = parseInt(req.params.id);

    let result;
    switch (action) {
        case 'activate':
            result = await ProvisioningService.activateService(serviceId);
            break;
        case 'suspend':
            result = await ProvisioningService.suspendService(serviceId, req.body.reason || 'Manual suspension');
            break;
        case 'terminate':
            result = await ProvisioningService.terminateService(serviceId);
            break;
        default:
            throw new AppError('Invalid action', 400);
    }

    res.status(200).json({
        status: 'success',
        data: { service: result },
    });
};

/**
 * Cancellation Requests
 */
export const requestCancellation = async (req: AuthRequest, res: Response) => {
    const { serviceId, reason, type } = req.body;

    const request = await prisma.cancellationRequest.create({
        data: {
            clientId: (await prisma.client.findFirst({ where: { userId: req.user?.id } }))?.id || 0,
            serviceId,
            reason,
            type,
            status: 'PENDING',
        }
    });

    res.status(201).json({
        status: 'success',
        data: { request },
    });
};

/**
 * Notify Client about Service Expiration (Manual Trigger)
 * Creates real renewal invoice if not exists
 */
export const notifyServiceExpiration = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const serviceId = parseInt(id);

    const service = await prisma.service.findUnique({
        where: { id: serviceId },
        include: {
            client: { include: { user: true } },
            product: true
        }
    });

    if (!service) throw new AppError('Service not found', 404);

    // 1. Create Invoice via Service
    const invoice = await invoiceService.createRenewalInvoice('SERVICE', serviceId);

    // 2. Already sent email in createRenewalInvoice, but we can send an extra custom one or just return success
    // Actually, createRenewalInvoice already sends the "Invoice Created" email. 
    // We can send the "Expiration Reminder" email as well here if we want to be more specific.

    const expiryDateStr = service.nextDueDate?.toLocaleDateString() || 'N/A';
    const daysLeft = service.nextDueDate ? Math.ceil((service.nextDueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;

    const { subject, body } = EmailTemplates.serviceExpirationReminder(
        service.product.name,
        expiryDateStr,
        daysLeft
    );

    await sendEmail(service.client.user.email, subject, body);

    // 3. System Notification
    await notificationService.createNotification(
        service.client.userId,
        'WARNING',
        `Renewal Notice: ${service.product.name}`,
        `Your service is expiring in ${daysLeft} days. An invoice (#${invoice.invoiceNumber}) has been generated.`,
        `/services/${serviceId}`
    );

    // 4. Record the notification
    await prisma.expiryNotificationRecord.create({
        data: {
            serviceId,
            userId: service.client.userId,
            notificationType: 'MANUAL_EXPIRY_WARNING',
            daysToExpiry: daysLeft,
        }
    });

    res.status(200).json({ status: 'success', message: 'Invoice generated and client notified' });
};

/**
 * Request Service Renewal (Client)
 */
export const requestServiceRenewal = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { period } = req.body;
        const userId = req.user!.id;

        const service = await prisma.service.findFirst({
            where: {
                id: parseInt(id),
                client: { userId }
            }
        });

        if (!service) throw new AppError('Service not found or unauthorized', 404);

        // Generate renewal invoice
        const invoice = await invoiceService.createRenewalInvoice('SERVICE', service.id, period || 1);

        res.status(200).json({
            status: 'success',
            message: 'Renewal invoice generated',
            data: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber }
        });
    } catch (error: any) {
        console.error('[RequestServiceRenewal Error]:', error);
        res.status(error.statusCode || 500).json({
            status: 'error',
            message: error.message || 'Internal Server Error'
        });
    }
};
