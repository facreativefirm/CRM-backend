import { Request, Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { DomainStatus, UserType } from '@prisma/client';
import { sendEmail, EmailTemplates } from '../services/email.service';
import * as invoiceService from '../services/invoiceService';
import * as notificationService from '../services/notificationService';

/**
 * List Client Domains
 */
export const getDomains = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) throw new AppError('Unauthorized', 401);

        const isAdmin = ([UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF] as UserType[]).includes(req.user.userType);

        // Build where clause based on user role
        let where: any = {};
        if (!isAdmin) {
            where = { client: { userId: req.user.id } }; // Personal data for everyone else
        }

        const domains = await prisma.domain.findMany({
            where,
            include: {
                client: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true,
                                username: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.status(200).json({
            status: 'success',
            results: domains.length,
            data: { domains }
        });
    } catch (error: any) {
        console.error('[GetDomains Error]:', error);
        res.status(error.statusCode || 500).json({
            status: 'error',
            message: error.message || 'Internal Server Error'
        });
    }
};

/**
 * Register Domain (Simplified)
 */
/**
 * Register Domain (Invoice First)
 */
export const registerDomain = async (req: AuthRequest, res: Response) => {
    try {
        const {
            clientId,
            domainName,
            regPeriod,
            registrar,
            autoRenew,
            dnsManagement,
            emailForwarding,
            idProtection,
        } = req.body;

        const period = Number(regPeriod) || 1;

        // 1. Create Domain as PENDING
        const expiryDate = new Date();
        expiryDate.setFullYear(expiryDate.getFullYear() + period);

        const domain = await prisma.domain.create({
            data: {
                clientId: parseInt(clientId),
                domainName,
                expiryDate,
                registrar: registrar || 'manual',
                status: 'PENDING',
                autoRenew: autoRenew ?? true,
                dnsManagement: dnsManagement ?? false,
                emailForwarding: emailForwarding ?? false,
                idProtection: idProtection ?? false,
                registrationDate: new Date(),
            }
        });

        // 2. Determine Price from TLD
        const parts = domainName.split('.');
        const tldExtension = '.' + parts[parts.length - 1];

        // Try exact match first, then without dot? Usually stored with dot or handled by DB
        // Let's look for both variations to be safe or just the extension
        const tldRecord = await prisma.domainTLD.findFirst({
            where: {
                tld: { in: [tldExtension, parts[parts.length - 1]] }
            }
        });

        const unitPrice = tldRecord ? Number(tldRecord.registrationPrice) : 0;
        const totalAmount = unitPrice * period;

        // 3. Create Invoice
        const invoice = await prisma.invoice.create({
            data: {
                clientId: parseInt(clientId),
                invoiceNumber: `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                status: 'UNPAID',
                dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                subtotal: totalAmount,
                totalAmount: totalAmount,
                items: {
                    create: [{
                        description: `Domain Registration - ${domainName} (${period} Year${period > 1 ? 's' : ''})`,
                        quantity: 1,
                        unitPrice: unitPrice,
                        totalAmount: totalAmount,
                        domainId: domain.id,
                        metadata: JSON.stringify({ type: 'new_domain', period })
                    }]
                }
            }
        });

        // 4. Send Email
        try {
            const { subject, body } = EmailTemplates.invoiceCreated(invoice.invoiceNumber);
            const client = await prisma.client.findUnique({ where: { id: parseInt(clientId) }, include: { user: true } });
            if (client?.user?.email) {
                await sendEmail(client.user.email, subject, body);
            }
        } catch (e) {
            console.error("Failed to send invoice email", e);
        }

        res.status(201).json({
            status: 'success',
            message: 'Domain registered (Pending). Invoice generated.',
            data: { domain, invoice }
        });

    } catch (error: any) {
        console.error('[RegisterDomain Error]:', error);
        res.status(error.statusCode || 500).json({
            status: 'error',
            message: error.message || 'Internal Server Error'
        });
    }
};

/**
 * Renew Domain
 */
export const renewDomain = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { years } = req.body;

        const domain = await prisma.domain.findUnique({ where: { id: parseInt(id as string) } });
        if (!domain) throw new AppError('Domain not found', 404);

        const newExpiry = new Date(domain.expiryDate);
        newExpiry.setFullYear(newExpiry.getFullYear() + (years || 1));

        const updated = await prisma.domain.update({
            where: { id: parseInt(id as string) },
            data: { expiryDate: newExpiry }
        });

        res.status(200).json({ status: 'success', data: { domain: updated } });
    } catch (error: any) {
        console.error('[RenewDomain Error]:', error);
        res.status(error.statusCode || 500).json({
            status: 'error',
            message: error.message || 'Internal Server Error'
        });
    }
};

/**
 * Request Domain Renewal (Client)
 */
export const requestDomainRenewal = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { period } = req.body;
        const userId = req.user!.id;

        const domain = await prisma.domain.findFirst({
            where: {
                id: parseInt(id as string),
                client: { userId }
            }
        });

        if (!domain) throw new AppError('Domain not found or unauthorized', 404);

        // Generate renewal invoice
        const invoice = await invoiceService.createRenewalInvoice('DOMAIN', domain.id, period || 1);

        res.status(200).json({
            status: 'success',
            message: 'Renewal invoice generated',
            data: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber }
        });
    } catch (error: any) {
        console.error('[RequestDomainRenewal Error]:', error);
        res.status(error.statusCode || 500).json({
            status: 'error',
            message: error.message || 'Internal Server Error'
        });
    }
};

/**
 * Update Domain Details
 */
export const updateDomain = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };

        // Remove fields that should not be updated directly via this endpoint if necessary
        delete updateData.regPeriod;

        const domain = await prisma.domain.findUnique({ where: { id: parseInt(id as string) } });
        if (!domain) throw new AppError('Domain not found', 404);

        const updated = await prisma.domain.update({
            where: { id: parseInt(id as string) },
            data: updateData
        });

        res.status(200).json({ status: 'success', data: { domain: updated } });
    } catch (error: any) {
        console.error('[UpdateDomain Error]:', error);
        res.status(error.statusCode || 500).json({
            status: 'error',
            message: error.message || 'Internal Server Error'
        });
    }
};

/**
 * Get Expiring Domains (Admin Only)
 */
export const getExpiringDomains = async (req: AuthRequest, res: Response) => {
    try {
        const days = parseInt(req.query.days as string) || 30;
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + days);

        const domains = await prisma.domain.findMany({
            where: {
                expiryDate: {
                    lte: futureDate,
                    gt: new Date(),
                },
                status: DomainStatus.ACTIVE,
            },
            include: {
                client: { include: { user: true } },
                expiryNotificationRecords: {
                    orderBy: { sentAt: 'desc' },
                    take: 1
                }
            },
            orderBy: { expiryDate: 'asc' }
        });

        res.status(200).json({ status: 'success', data: { domains } });
    } catch (error: any) {
        console.error('[GetExpiringDomains Error]:', error);
        res.status(error.statusCode || 500).json({
            status: 'error',
            message: error.message || 'Internal Server Error'
        });
    }
};

/**
 * Get Domain Details
 */
export const getDomainDetails = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const domain = await prisma.domain.findUnique({
            where: { id: parseInt(id as string) },
            include: { client: { include: { user: true } } }
        });

        if (!domain) throw new AppError('Domain not found', 404);

        res.status(200).json({ status: 'success', data: { domain } });
    } catch (error: any) {
        console.error('[GetDomainDetails Error]:', error);
        res.status(error.statusCode || 500).json({
            status: 'error',
            message: error.message || 'Internal Server Error'
        });
    }
};

/**
 * Notify Client about Domain Expiration
 */
export const notifyDomainExpiration = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const domainId = parseInt(id as string);

        const domain = await prisma.domain.findUnique({
            where: { id: domainId },
            include: { client: { include: { user: true } } }
        });

        if (!domain) throw new AppError('Domain not found', 404);

        // 1. Create renewal invoice
        const invoice = await invoiceService.createRenewalInvoice('DOMAIN', domainId);

        const expiryDateStr = domain.expiryDate.toLocaleDateString();
        const daysLeft = Math.ceil((domain.expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

        // 2. Email Reminder
        const { subject, body } = EmailTemplates.serviceExpirationReminder(domain.domainName, expiryDateStr, daysLeft);
        await sendEmail(domain.client.user.email, subject, body);

        // 3. System notification
        await notificationService.createNotification(
            domain.client.userId,
            'WARNING',
            `Domain Renewal: ${domain.domainName}`,
            `Your domain is expiring in ${daysLeft} days. An invoice (#${invoice.invoiceNumber}) has been generated for its renewal.`,
            `/domains/${domainId}`
        );

        res.status(200).json({ status: 'success', message: 'Notification sent and invoice generated' });

        // Record the notification
        await prisma.expiryNotificationRecord.create({
            data: {
                domainId: domain.id,
                userId: domain.client.userId,
                notificationType: 'MANUAL_EXPIRY_WARNING',
                daysToExpiry: daysLeft,
            }
        });
    } catch (error: any) {
        console.error('[NotifyDomainExpiration Error]:', error);
        res.status(error.statusCode || 500).json({
            status: 'error',
            message: error.message || 'Internal Server Error'
        });
    }
};

/**
 * Notify All Clients with Expiring Domains
 */
export const notifyAllExpiringDomains = async (req: AuthRequest, res: Response) => {
    try {
        const days = 60; // Standard threshold
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + days);

        const expiringDomains = await prisma.domain.findMany({
            where: {
                expiryDate: {
                    lte: futureDate,
                    gt: new Date(),
                },
                status: DomainStatus.ACTIVE,
            },
            include: { client: { include: { user: true } } }
        });

        let sentCount = 0;
        for (const domain of expiringDomains) {
            try {
                // Creates invoice and notify if needed
                await invoiceService.createRenewalInvoice('DOMAIN', domain.id);

                const expiryDateStr = domain.expiryDate.toLocaleDateString();
                const daysLeft = Math.ceil((domain.expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                const { subject, body } = EmailTemplates.serviceExpirationReminder(domain.domainName, expiryDateStr, daysLeft);

                await sendEmail(domain.client.user.email, subject, body);

                sentCount++;
            } catch (err) {
                console.error(`Failed to notify bulk ${domain.domainName}:`, err);
            }
        }

        res.status(200).json({ status: 'success', message: `${sentCount} domains processed for renewal` });
    } catch (error: any) {
        console.error('[NotifyAllExpiringDomains Error]:', error);
        res.status(error.statusCode || 500).json({
            status: 'error',
            message: error.message || 'Internal Server Error'
        });
    }
};
