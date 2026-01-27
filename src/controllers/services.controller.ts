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
    const userClient = await prisma.client.findUnique({ where: { userId: req.user.id } });
    const userClientId = userClient?.id;

    const services = await prisma.service.findMany({
        where: {
            ...(status && { status: status as any }),
            ...(clientId && { clientId: parseInt(clientId as string) }),
            // If not admin, only see personal services
            ...(req.user.userType !== UserType.ADMIN && req.user.userType !== UserType.SUPER_ADMIN && req.user.userType !== UserType.STAFF
                ? { clientId: userClientId }
                : {}),
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
/**
 * Create a new Service (Manual Provisioning - Invoice First)
 */
export const createService = async (req: AuthRequest, res: Response) => {
    // Data is pre-validated and transformed by createServiceSchema
    const {
        clientId, productId, serverId, billingCycle, domain,
        amount, nextDueDate, username, password, ipAddress
    } = req.body;

    // 1. Fetch Product details to get price/name if not provided
    const product = await prisma.product.findUnique({ where: { id: parseInt(productId) } });
    if (!product) throw new AppError('Product not found', 404);

    let price = amount ? parseFloat(amount) : Number(product.monthlyPrice);
    if (billingCycle === 'annually') price = amount ? parseFloat(amount) : Number(product.annualPrice);

    const service = await prisma.service.create({
        data: {
            clientId: parseInt(clientId),
            productId: parseInt(productId),
            serverId: serverId ? parseInt(serverId) : null,
            billingCycle: billingCycle || 'monthly',
            domain,
            status: 'PENDING',
            amount: price,
            nextDueDate: nextDueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            username,
            passwordHash: password,
            ipAddress
        }
    });

    // 2. Create Invoice for this Service
    const invoice = await prisma.invoice.create({
        data: {
            clientId: parseInt(clientId),
            invoiceNumber: `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            status: 'UNPAID',
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            subtotal: price,
            totalAmount: price,
            items: {
                create: [{
                    description: `New Service - ${product.name} (${billingCycle || 'Monthly'}) - ${domain || ''}`,
                    quantity: 1,
                    unitPrice: price,
                    totalAmount: price,
                    serviceId: service.id, // Linking serviceId allows automatic activation on payment
                    metadata: JSON.stringify({ type: 'new_service', period: 1 })
                }]
            }
        }
    });

    // 3. Email Notification (Optional, non-blocking)
    try {
        const client = await prisma.client.findUnique({ where: { id: parseInt(clientId) }, include: { user: true } });
        if (client?.user?.email) {
            const { subject, body } = EmailTemplates.invoiceCreated(invoice.invoiceNumber, invoice.dueDate.toLocaleDateString(), invoice.totalAmount.toString());
            await sendEmail(client.user.email, subject, body);
        }
    } catch (e) { console.error("Failed to send service creation email", e); }

    res.status(201).json({
        status: 'success',
        message: 'Service created (Pending). Invoice generated.',
        data: { service, invoice },
    });
};

/**
 * Get Single Service
 */
export const getService = async (req: AuthRequest, res: Response) => {
    const service = await prisma.service.findUnique({
        where: { id: parseInt(req.params.id as string) },
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
    const serviceId = parseInt(req.params.id as string);
    const {
        clientId, productId, serverId, amount, nextDueDate,
        password, ...otherData
    } = req.body;

    // 1. Prepare data for Prisma, mapping frontend fields to DB fields
    const updateData: any = {
        ...otherData,
        ...(clientId && { clientId: parseInt(clientId as string) }),
        ...(productId && { productId: parseInt(productId as string) }),
        ...(serverId !== undefined && { serverId: serverId ? parseInt(serverId as string) : null }),
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
    const serviceId = parseInt(req.params.id as string);
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
    const serviceId = parseInt(req.params.id as string);

    // Strict Business Logic: Prevent activation of unpaid services
    if (action === 'activate') {
        const serviceWithBilling = await prisma.service.findUnique({
            where: { id: serviceId },
            include: {
                invoiceItems: {
                    include: {
                        invoice: {
                            include: { transactions: { where: { status: 'SUCCESS' } } }
                        }
                    }
                },
                order: {
                    include: {
                        invoices: {
                            include: { transactions: { where: { status: 'SUCCESS' } } }
                        }
                    }
                }
            }
        });

        if (!serviceWithBilling) throw new AppError('Service not found', 404);

        const isFree = Number(serviceWithBilling.amount) === 0;
        const allInvoices = [
            ...(serviceWithBilling.order?.invoices || []),
            ...serviceWithBilling.invoiceItems.map(item => item.invoice)
        ];

        const hasPaidInvoice = allInvoices.some(inv => inv.status === 'PAID');
        const hasSuccessfulTransaction = allInvoices.some(inv => inv.transactions.length > 0);

        if (!isFree && !hasPaidInvoice && !hasSuccessfulTransaction) {
            throw new AppError('Payment verification failed. No paid invoice or successful transaction found for this service. Please ensure the associated invoice is marked as PAID or has a valid transaction record before activation.', 400);
        }
    }

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
    const serviceId = parseInt(id as string);

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

    try {
        await sendEmail(service.client.user.email, subject, body);
    } catch (emailErr) {
        console.error('Failed to send manual service expiration notification email:', emailErr);
    }

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
                id: parseInt(id as string),
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

/**
 * Bulk Provision Services
 */
export const bulkProvision = async (req: AuthRequest, res: Response) => {
    const { clientId, items } = req.body;

    // Validate request
    if (!clientId || !items || !Array.isArray(items) || items.length === 0) {
        throw new AppError('Invalid request data', 400);
    }

    const client = await prisma.client.findUnique({
        where: { id: clientId },
        include: { user: true }
    });

    if (!client) throw new AppError('Client not found', 404);

    // Process logic
    try {
        const result = await prisma.$transaction(async (tx) => {
            const createdServices = [];
            const invoiceItems = [];
            let totalAmount = 0;

            for (const item of items) {
                const { productId, domain, billingCycle, priceOverride, registerDomain } = item;
                const product = await tx.product.findUnique({ where: { id: productId } });

                if (!product) throw new AppError(`Product ID ${productId} not found`, 404);

                let price = priceOverride !== null ? priceOverride : (product.monthlyPrice || 0);
                if (billingCycle === 'annually') price = priceOverride !== null ? priceOverride : (product.annualPrice || 0);

                // Create Service
                const service = await tx.service.create({
                    data: {
                        clientId,
                        productId,
                        domain: domain || null,
                        billingCycle: billingCycle || 'monthly',
                        status: 'PENDING',
                        amount: price,
                        nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
                    }
                });

                createdServices.push(service);

                let domainPrice = 0;

                // Create Domain Record if provided
                if (domain) {
                    // Check pricing if registering
                    if (registerDomain) {
                        const extension = domain.split('.').pop();
                        const tld = await tx.domainTLD.findUnique({ where: { tld: '.' + extension } });
                        if (tld) {
                            domainPrice = Number(tld.registrationPrice);
                            // Override provided? Not for domain yet, using system price.
                        }
                    }

                    await tx.domain.create({
                        data: {
                            client: { connect: { id: clientId } },
                            domainName: domain,
                            status: 'PENDING',
                            registrar: 'Manual',
                            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 Year Default
                            registrationDate: new Date(),
                        }
                    });
                }

                // Prepare Invoice Items
                // 1. Service
                invoiceItems.push({
                    description: `${product.name} - ${domain || 'No Domain'} (${billingCycle})`,
                    quantity: 1,
                    unitPrice: price,
                    totalAmount: price,
                    serviceId: service.id
                });
                totalAmount += Number(price);

                // 2. Domain Registration (if requested)
                if (registerDomain && domain && domainPrice > 0) {
                    invoiceItems.push({
                        description: `Domain Registration - ${domain} (1 Year)`,
                        quantity: 1,
                        unitPrice: domainPrice,
                        totalAmount: domainPrice,
                        serviceId: service.id // Link to service for reference, or null if schema allows
                    });
                    totalAmount += Number(domainPrice);
                }
            }

            // Create Consolidated Invoice
            const invoice = await tx.invoice.create({
                data: {
                    clientId,
                    invoiceNumber: `INV-${Date.now()}`,
                    status: 'UNPAID',
                    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 Days due
                    subtotal: totalAmount,
                    totalAmount: totalAmount,
                    items: {
                        create: invoiceItems
                    }
                }
            });

            return { createdServices, invoice };
        });

        // Notifications (Outside transaction to avoid blocking)
        try {
            const { subject, body } = EmailTemplates.invoiceCreated(result.invoice);
            await sendEmail(client.user.email, subject, body);

            await notificationService.createNotification(
                client.userId,
                'INFO',
                'Bulk Services Provisioned',
                `New services added via bulk provisioning. Invoice #${result.invoice.invoiceNumber} generated.`
            );
        } catch (emailErr) {
            console.error("Failed to send bulk provisioning emails", emailErr);
        }

        res.status(201).json({
            status: 'success',
            message: 'Services provisioned and invoice created',
            data: result
        });

    } catch (error: any) {
        console.error("Bulk Provision Error:", error);
        throw new AppError(error.message || 'Bulk provisioning failed', 500);
    }
};
