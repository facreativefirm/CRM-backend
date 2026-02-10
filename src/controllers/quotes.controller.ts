import { Request, Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { UserType } from '@prisma/client';
import { sendEmail, EmailTemplates } from '../services/email.service';
import * as invoiceService from '../services/invoiceService';
import * as notificationService from '../services/notificationService';

/**
 * Create a new Quote
 */
export const createQuote = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    try {
        const { clientId, subject, items, validUntil, terms, notes } = r.body;

        const subtotal = items.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice), 0);
        // Assuming tax logic similar to invoices? For now simple 0 or manual. 
        // We'll calculate tax later or assume it's included/excluded based on client settings.
        // For MVP, let's keep it simple: subtotal = total.
        const totalAmount = subtotal;

        // Generate Quote Number (QT-YYYYMMDD-XXXX)
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const random = Math.floor(1000 + Math.random() * 9000);
        const quoteNumber = `QT-${date}-${random}`;

        const quote = await (prisma as any).quote.create({
            data: {
                quoteNumber,
                clientId: parseInt(clientId as string),
                subject,
                validUntil: new Date(validUntil as string),
                subtotal,
                totalAmount,
                terms,
                notes,
                items: {
                    create: items.map((item: any) => ({
                        description: item.description,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        amount: item.quantity * item.unitPrice,
                        productId: item.productId ? parseInt(item.productId) : null,
                        billingCycle: item.billingCycle || null,
                        domainName: item.domainName || null
                    }))
                }
            },
            include: { items: true, client: { include: { user: true } } }
        });

        res.status(201).json({ status: 'success', data: { quote } });
    } catch (error: any) {
        console.error('[CreateQuote Error]:', error);
        res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
    }
};

/**
 * Get all Quotes
 */
export const getQuotes = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    try {
        if (!r.user) throw new AppError('Unauthorized', 401);

        const where: any = {};

        // Client restriction
        if (r.user.userType === UserType.CLIENT) {
            where.client = { userId: r.user.id };
        }

        const quotes = await prisma.quote.findMany({
            where,
            include: {
                client: {
                    include: { user: { select: { firstName: true, lastName: true, email: true } } }
                },
                items: true
            },
            orderBy: { createdAt: 'desc' }
        });

        res.status(200).json({ status: 'success', data: { quotes } });
    } catch (error: any) {
        console.error('[GetQuotes Error]:', error);
        res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
    }
};

/**
 * Get Single Quote
 */
export const getQuote = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    try {
        const { id } = r.params;
        const quote = await (prisma as any).quote.findUnique({
            where: { id: parseInt(id as string) },
            include: {
                items: true,
                client: { include: { user: true } },
                invoice: true
            }
        });

        if (!quote) throw new AppError('Quote not found', 404);

        // Security check for clients
        if (r.user?.userType === UserType.CLIENT && quote.client.userId !== r.user.id) {
            throw new AppError('Unauthorized', 403);
        }

        res.status(200).json({ status: 'success', data: { quote } });
    } catch (error: any) {
        console.error('[GetQuote Error]:', error);
        res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
    }
};

/**
 * Update Quote (Draft only)
 */
export const updateQuote = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    try {
        const { id } = r.params;
        const { subject, items, validUntil, terms, notes } = r.body;

        const existing = await prisma.quote.findUnique({ where: { id: parseInt(id as string) } });
        if (!existing) throw new AppError('Quote not found', 404);
        if (existing.status !== 'DRAFT') throw new AppError('Cannot edit non-draft quote', 400);

        // Recalculate totals
        const subtotal = items.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice), 0);
        const totalAmount = subtotal;

        // Transaction to replace items
        const updated = await prisma.$transaction(async (tx) => {
            // Delete old items
            await (tx as any).quoteItem.deleteMany({ where: { quoteId: parseInt(id as string) } });

            // Update quote and create new items
            return await (tx as any).quote.update({
                where: { id: parseInt(id as string) },
                data: {
                    subject,
                    validUntil: new Date(validUntil),
                    subtotal,
                    totalAmount,
                    terms,
                    notes,
                    items: {
                        create: items.map((item: any) => ({
                            description: item.description,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            amount: item.quantity * item.unitPrice,
                            productId: item.productId ? parseInt(item.productId) : null,
                            billingCycle: item.billingCycle || null,
                            domainName: item.domainName || null
                        }))
                    }
                },
                include: { items: true }
            });
        });

        res.status(200).json({ status: 'success', data: { quote: updated } });
    } catch (error: any) {
        console.error('[UpdateQuote Error]:', error);
        res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
    }
};

/**
 * Send Quote (Email)
 */
export const sendQuote = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    try {
        const { id } = r.params;
        const quote = await prisma.quote.findUnique({
            where: { id: parseInt(id as string) },
            include: { client: { include: { user: true } } }
        }) as any;

        if (!quote) throw new AppError('Quote not found', 404);

        // Update status if it was draft
        if (quote.status === 'DRAFT') {
            await prisma.quote.update({
                where: { id: quote.id },
                data: { status: 'SENT' }
            });
        }

        // Send Email
        // Send Email
        const emailContent = EmailTemplates.quoteProposal(
            quote.quoteNumber,
            Number(quote.totalAmount).toFixed(2),
            new Date(quote.validUntil).toLocaleDateString(),
            `${process.env.FRONTEND_URL || 'http://localhost:3000'}/client/quotes/${quote.id}`
        );

        try {
            await sendEmail(quote.client.user.email, emailContent.subject, emailContent.body);
        } catch (emailErr) {
            console.error('Failed to send quote proposal email:', emailErr);
        }

        // Add In-App Notification for Client
        await notificationService.createNotification(
            quote.client.userId,
            'INFO',
            'New Quote Proposal',
            `A new quote #${quote.quoteNumber} (${quote.subject}) has been prepared for you.`,
            `/client/quotes/${quote.id}`
        );

        res.status(200).json({ status: 'success', message: 'Quote sent successfully' });
    } catch (error: any) {
        console.error('[SendQuote Error]:', error);
        res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
    }
};

/**
 * Accept Quote -> Convert to Invoice
 */
export const acceptQuote = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    try {
        const { id } = r.params;

        const quote = await prisma.quote.findUnique({
            where: { id: parseInt(id as string) },
            include: {
                items: { include: { product: true } },
                client: { include: { user: true, group: true } }
            }
        }) as any;

        if (!quote) throw new AppError('Quote not found', 404);
        if (quote.status === 'ACCEPTED' || quote.invoiceId) throw new AppError('Quote already accepted', 400);

        // Security check: Client can accept their own quote
        if (r.user?.userType === UserType.CLIENT && quote.client.userId !== r.user.id) {
            throw new AppError('Unauthorized', 403);
        }

        // Create Invoice via prisma transaction
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create Invoice
            // We replicate invoice generation manually here because it's from custom quote items, not predefined products
            const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const random = Math.floor(1000 + Math.random() * 9000);
            const invoiceNumber = `INV-${date}-${random}`;

            // Calculate Tax
            const { getTaxRate } = await import('../services/settingsService');
            const taxRate = await getTaxRate();
            const taxAmount = quote.client.group?.taxExempt ? 0 : Number(quote.subtotal) * taxRate;
            const totalAmount = Number(quote.subtotal) + taxAmount;

            // 1. Prepare Invoice Items and Services/Domains
            const invoiceItems = [];
            for (const item of quote.items) {
                let serviceId = null;
                let domainId = null;
                let metadata = null;

                const product = item.product;

                if (item.productId && product?.productType === 'DOMAIN') {
                    // 1. Create Domain Record
                    const domain = await tx.domain.create({
                        data: {
                            clientId: quote.clientId,
                            domainName: item.domainName || 'pending.dom',
                            registrationDate: new Date(),
                            expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
                            status: 'PENDING' as any,
                            registrar: 'Internal'
                        }
                    });
                    domainId = domain.id;
                    metadata = JSON.stringify({ type: 'new_domain', period: 1 });
                } else if (item.productId) {
                    // 2. Create Service Record
                    const service = await tx.service.create({
                        data: {
                            clientId: quote.clientId,
                            productId: item.productId,
                            domain: item.domainName,
                            amount: item.unitPrice,
                            billingCycle: item.billingCycle || 'monthly',
                            status: 'PENDING' as any
                        }
                    });
                    serviceId = service.id;
                    metadata = JSON.stringify({ type: 'new_service', period: 1 });
                } else if (item.domainName) {
                    // 3. Create Domain (Manual/No Product)
                    const domain = await tx.domain.create({
                        data: {
                            clientId: quote.clientId,
                            domainName: item.domainName,
                            registrationDate: new Date(),
                            expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
                            status: 'PENDING' as any,
                            registrar: 'Internal'
                        }
                    });
                    domainId = domain.id;
                    metadata = JSON.stringify({ type: 'new_domain', period: 1 });
                }

                invoiceItems.push({
                    description: item.description,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    totalAmount: item.amount,
                    serviceId,
                    domainId,
                    metadata
                });
            }

            const invoice = await (tx as any).invoice.create({
                data: {
                    invoiceNumber,
                    clientId: (quote as any).clientId,
                    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    subtotal: (quote as any).subtotal,
                    taxAmount: taxAmount,
                    totalAmount: totalAmount,
                    status: 'UNPAID' as any,
                    items: {
                        create: invoiceItems
                    },
                    quote: { connect: { id: (quote as any).id } }
                }
            });

            // 2. Update Quote Status
            await (tx as any).quote.update({
                where: { id: (quote as any).id },
                data: {
                    status: 'ACCEPTED',
                    invoiceId: invoice.id
                }
            });

            return invoice;
        });

        // 3. Sales Team Reward: Award conversion bonus if this client was a prospect
        try {
            const prospect = await prisma.prospectClient.findFirst({
                where: {
                    convertedToClientId: (quote as any).clientId,
                    status: { not: 'CONVERTED' }
                }
            });

            if (prospect) {
                console.log(`[SalesTeam] Quote accepted for linked prospect ${prospect.id}. Awarding conversion bonus.`);
                const { salesTeamService } = await import('../services/salesTeam.service');
                await salesTeamService.awardConversionBonus(prospect.id, (quote as any).clientId);
            }
        } catch (err) {
            console.error('[SalesTeam] Failed to award conversion bonus on quote acceptance:', err);
        }

        // 4. Send Notification/Confirmation (outside transaction)
        const emailContent = EmailTemplates.quoteAccepted((quote as any).quoteNumber, (result as any).invoiceNumber);
        try {
            await sendEmail(
                (quote as any).client.user.email,
                emailContent.subject,
                emailContent.body
            );
        } catch (emailErr) {
            console.error('Failed to send quote acceptance confirmation email:', emailErr);
        }

        // Add In-App Notification for Admin
        await notificationService.broadcastToAdmins(
            'SUCCESS',
            'Quote Accepted',
            `Client has accepted Quote #${(quote as any).quoteNumber}. Invoice #${(result as any).invoiceNumber} generated.`,
            `/admin/billing/quotes/${(quote as any).id}`
        );

        // Notify Admins by Email
        try {
            const admins = await prisma.user.findMany({
                where: { userType: { in: [UserType.ADMIN, UserType.SUPER_ADMIN] }, status: 'ACTIVE' },
                select: { email: true }
            });

            const adminNotification = EmailTemplates.adminTransitionNotification(
                'Quote Accepted',
                `Quote: #${quote.quoteNumber}\nSubject: ${quote.subject}\nClient: ${quote.client.user.firstName} ${quote.client.user.lastName}\nGenerated Invoice: #${result.invoiceNumber}`
            );

            for (const admin of admins) {
                if (admin.email) {
                    await sendEmail(admin.email, adminNotification.subject, adminNotification.body);
                }
            }
        } catch (adminEmailError) {
            console.error('Failed to send admin quote acceptance email:', adminEmailError);
        }

        res.status(200).json({ status: 'success', data: { invoiceId: (result as any).id } });
    } catch (error: any) {
        console.error('[AcceptQuote Error]:', error);
        res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
    }
};

/**
 * Reject Quote
 */
export const rejectQuote = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    try {
        const { id } = r.params;
        const quote = await prisma.quote.findUnique({
            where: { id: parseInt(id as string) },
            include: { client: true }
        }) as any;

        if (!quote) throw new AppError('Quote not found', 404);

        // Security check
        if (r.user?.userType === UserType.CLIENT && quote.client.userId !== r.user.id) {
            throw new AppError('Unauthorized', 403);
        }

        await prisma.quote.update({
            where: { id: quote.id },
            data: { status: 'REJECTED' }
        });

        // Add In-App Notification for Admin
        await notificationService.broadcastToAdmins(
            'WARNING',
            'Quote Rejected',
            `Client has rejected Quote #${quote.quoteNumber} (${quote.subject}).`,
            `/admin/billing/quotes/${quote.id}`
        );

        res.status(200).json({ status: 'success', message: 'Quote rejected' });
    } catch (error: any) {
        console.error('[RejectQuote Error]:', error);
        res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
    }
};

/**
 * Delete Quote
 */
export const deleteQuote = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    try {
        const { id } = r.params;
        await prisma.quote.delete({ where: { id: parseInt(id as string) } });
        res.status(200).json({ status: 'success', message: 'Quote deleted' });
    } catch (error: any) {
        console.error('[DeleteQuote Error]:', error);
        res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
    }
};
