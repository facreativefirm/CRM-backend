import { Request, Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import * as invoiceService from '../services/invoiceService';
import { PaymentGatewayService } from '../services/gatewayService';
import { UserType, InvoiceStatus, OrderStatus, Prisma } from '@prisma/client';
import * as notificationService from '../services/notificationService';
import emailService from '../services/email.service';
import { InvestorService } from '../services/investor.service';
import * as orderService from '../services/orderService';
import * as settingsService from '../services/settingsService';
import { generateInvoicePDF } from '../services/pdfService';

/**
 * List Invoices with reseller isolation
 */
export const getInvoices = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    try {
        if (!r.user) throw new AppError('Unauthorized', 401);
        const { status, clientId } = r.query;
        const userClient = await prisma.client.findUnique({ where: { userId: r.user.id } });
        const userClientId = userClient?.id;

        const invoices = await prisma.invoice.findMany({
            where: {
                ...(status && { status: status as InvoiceStatus }),
                ...(clientId && { clientId: parseInt(clientId as string) }),
                // If not admin, they only see their own personal invoices
                ...(r.user.userType !== UserType.ADMIN && r.user.userType !== UserType.SUPER_ADMIN && r.user.userType !== UserType.STAFF
                    ? { clientId: userClientId }
                    : {}),
                isDeleted: false,
            },
            include: {
                client: {
                    include: {
                        user: true,
                        contacts: { where: { isPrimary: true } }
                    }
                },
            },
            orderBy: { dueDate: 'desc' },
        });

        res.status(200).json({
            status: 'success',
            results: invoices.length,
            data: { invoices },
        });
    } catch (error: any) {
        console.error('[GetInvoices Error]:', error);
        res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
    }
};

/**
 * Create a new Invoice (Manual)
 */
export const createInvoice = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    try {
        if (!r.user || (r.user.userType !== UserType.ADMIN && r.user.userType !== UserType.SUPER_ADMIN)) {
            throw new AppError('Unauthorized', 403);
        }

        const { clientId, date, dueDate, notes, adminNotes, items } = r.body;

        const client = await (prisma as any).client.findUnique({ where: { id: parseInt(clientId as string) } });
        if (!client) throw new AppError('Client not found', 404);

        const totalAmount = items.reduce((sum: number, item: any) => sum + (parseFloat(item.amount) || 0), 0);

        const invoice = await (prisma as any).invoice.create({
            data: {
                clientId: parseInt(clientId as string),
                invoiceNumber: `INV-${Date.now()}`, // Temporary gen
                invoiceDate: new Date(date),
                dueDate: new Date(dueDate),
                subtotal: totalAmount,
                totalAmount: totalAmount,
                status: 'UNPAID',
                notes: notes,
                adminNotes: adminNotes,
                items: {
                    create: items.map((item: any) => ({
                        description: item.description,
                        quantity: 1,
                        unitPrice: parseFloat(item.amount),
                        totalAmount: parseFloat(item.amount)
                    }))
                }
            },
            include: {
                items: true
            }
        });

        res.status(201).json({
            status: 'success',
            data: { invoice },
        });
    } catch (error: any) {
        console.error('[CreateInvoice Error]:', error);
        res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
    }
};

/**
 * Get Single Invoice
 */
export const getInvoice = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    try {
        const id = parseInt(r.params.id);
        if (isNaN(id)) {
            throw new AppError('Invalid invoice ID', 400);
        }

        const invoice = await prisma.invoice.findUnique({
            where: { id },
            include: {
                client: {
                    include: {
                        user: true,
                        contacts: { where: { isPrimary: true } }
                    }
                },
                items: true,
                transactions: true,
            },
        });

        if (!invoice) throw new AppError('Invoice not found', 404);

        // Isolation check
        if (!r.user) throw new AppError('Unauthorized', 401);
        if (r.user.userType === UserType.CLIENT) {
            const client = await prisma.client.findUnique({ where: { userId: r.user.id } });
            if (invoice.clientId !== client?.id) throw new AppError('Access denied', 403);
        }

        res.status(200).json({
            status: 'success',
            data: { invoice },
        });
    } catch (error: any) {
        console.error('[GetInvoice Error]:', error);
        res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
    }
};

/**
 * Initialize Payment (bKash/Nagad)
 */
export const initializePayment = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    try {
        const { invoiceId, gateway } = r.body;

        const invoice = await (prisma as any).invoice.findUnique({
            where: { id: parseInt(invoiceId as string) },
        });

        if (!invoice) throw new AppError('Invoice not found', 404);
        if (invoice.status === InvoiceStatus.PAID) throw new AppError('Invoice already paid', 400);

        let result;
        if (gateway === 'BKASH') {
            result = await PaymentGatewayService.initBKashPayment(Number(invoice.totalAmount), invoice.invoiceNumber);
        } else if (gateway === 'NAGAD') {
            result = await PaymentGatewayService.initNagadPayment(Number(invoice.totalAmount), invoice.invoiceNumber);
        } else {
            throw new AppError('Unsupported gateway', 400);
        }

        res.status(200).json({
            status: 'success',
            data: result,
        });
    } catch (error: any) {
        console.error('[InitializePayment Error]:', error);
        res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
    }
};

/**
 * Submit Manual Payment Proof
 */
export const submitManualPayment = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    try {
        const { invoiceId, gateway, transactionId, senderNumber } = r.body;

        if (!invoiceId || isNaN(parseInt(invoiceId as string))) {
            throw new AppError('Invalid Invoice ID', 400);
        }

        const invId = parseInt(invoiceId as string);

        const invoice = await prisma.invoice.findUnique({
            where: { id: invId },
        });

        if (!invoice) throw new AppError('Invoice not found', 404);

        // Check for duplicate transaction ID
        if (transactionId) {
            const existingTx = await prisma.transaction.findUnique({
                where: { transactionId: transactionId }
            });
            if (existingTx) {
                throw new AppError('This Transaction ID has already been submitted.', 400);
            }
        }

        const transaction = await prisma.transaction.create({
            data: {
                invoiceId: invId,
                gateway: gateway || 'manual',
                amount: invoice.totalAmount,
                status: 'PENDING',
                transactionId: transactionId,
                gatewayResponse: JSON.stringify({ senderNumber: senderNumber, manual: true }),
            }
        });

        // Notify Admins about Pending Transaction
        try {
            await notificationService.broadcastToAdmins(
                'WARNING',
                'New Payment Proof',
                `Manual payment submitted by client for Invoice #${invoice.invoiceNumber}. Amount: ${invoice.totalAmount}`,
                `/admin/billing?tab=transactions`
            );

            // Fetch Client Names (since req.user might be minimal)
            const clientUser = await prisma.user.findUnique({
                where: { id: r.user.id },
                select: { firstName: true, lastName: true }
            });

            // Send Admin Email
            const admins = await prisma.user.findMany({
                where: {
                    userType: { in: [UserType.ADMIN, UserType.SUPER_ADMIN] },
                    status: 'ACTIVE'
                },
                select: { email: true }
            });

            console.log(`[ManualPayment] Notifying ${admins.length} admins: ${admins.map(a => a.email).join(', ')}`);

            const adminNotification = emailService.EmailTemplates.adminManualPayment(
                invoice.invoiceNumber,
                `${clientUser?.firstName || 'Client'} ${clientUser?.lastName || ''}`,
                invoice.totalAmount.toString(),
                gateway,
                transactionId,
                senderNumber
            );

            for (const admin of admins) {
                if (admin.email) {
                    try {
                        await emailService.sendEmail(admin.email, adminNotification.subject, adminNotification.body);
                        console.log(`[ManualPayment] Successfully sent to: ${admin.email}`);
                    } catch (sendErr: any) {
                        console.error(`[ManualPayment] Failed to send to ${admin.email}:`, sendErr);
                    }
                }
            }
        } catch (error: any) {
            console.error("[ManualPayment Notification Error]:", error);
        }

        res.status(200).json({
            status: 'success',
            message: 'Payment proof submitted. Waiting for verification.',
            data: { transaction }
        });
    } catch (error: any) {
        console.error('[SubmitManualPayment Error]:', error);
        res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
    }
};

/**
 * Payment Webhook / Callback
 */
export const handlePaymentCallback = async (req: Request, res: Response) => {
    const { invoiceId, trxID, status, amount, gateway } = req.body;

    if (status === 'SUCCESS' || status === 'Completed') {
        console.log(`[PAYMENT CALLBACK] Processing successful payment for Invoice #${invoiceId}`);

        const result = await invoiceService.recordPayment(
            parseInt(invoiceId as string),
            new Prisma.Decimal(amount),
            gateway,
            trxID,
            req.body
        );

        console.log(`[PAYMENT CALLBACK] Payment recorded. Invoice status: ${result.updatedInvoice.status}, Order ID: ${result.updatedInvoice.orderId}`);

        // Order activation is now handled atomically inside invoiceService.recordPayment
        console.log(`[PAYMENT CALLBACK] Processed successful payment for Invoice #${invoiceId}`);
    }

    res.status(200).json({ status: 'received' });
};

/**
 * Trigger Generation of Due Invoices (Admin Only)
 */
export const generateDueInvoices = async (req: Request, res: Response) => {
    const results = await invoiceService.generateRecurringInvoices();
    res.status(200).json({
        status: 'success',
        message: `${results.length} invoices generated.`,
        data: { results }
    });
};

/**
 * Admin: Update Invoice Status (e.g. Mark as Paid)
 */
export const updateInvoiceStatus = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    try {
        const { status } = r.body;
        const { id } = r.params;
        const invoiceId = parseInt(id as string);

        // Fetch existing invoice with transactions to verify
        const existingInvoice = await (prisma as any).invoice.findUnique({
            where: { id: invoiceId },
            include: { transactions: true }
        });

        if (!existingInvoice) {
            throw new AppError('Invoice not found', 404);
        }

        // If marking as PAID, ensure at least one transaction exists
        if (status === InvoiceStatus.PAID) {
            const hasTransactions = existingInvoice.transactions && existingInvoice.transactions.length > 0;
            if (!hasTransactions) {
                throw new AppError('Cannot mark as paid: No bills or transaction records found for this invoice. Please ensure a payment method is recorded first.', 400);
            }
        }

        const invoice = await (prisma as any).invoice.update({
            where: { id: invoiceId },
            data: {
                status: status as InvoiceStatus,
                ...(status === InvoiceStatus.PAID ? { paidDate: new Date() } : {}),
                ...(status === InvoiceStatus.UNPAID ? { paidDate: null, amountPaid: 0 } : {})
            }
        });

        if (status === InvoiceStatus.PAID) {
            const inv = await (prisma as any).invoice.findUnique({
                where: { id: invoiceId },
                include: {
                    client: {
                        include: { user: true }
                    }
                }
            });

            if (inv) {
                const pendingTransactions = await (prisma as any).transaction.findMany({
                    where: {
                        invoiceId: inv.id,
                        status: 'PENDING'
                    },
                    orderBy: { createdAt: 'desc' }
                });

                const updateData: any = {};

                if (inv.amountPaid.equals(0)) {
                    updateData.amountPaid = inv.totalAmount;
                }

                if (pendingTransactions.length > 0 && !inv.paymentMethod) {
                    updateData.paymentMethod = pendingTransactions[0].gateway;
                }

                if (Object.keys(updateData).length > 0) {
                    await (prisma as any).invoice.update({
                        where: { id: inv.id },
                        data: updateData
                    });
                }

                if (pendingTransactions.length > 0) {
                    await (prisma as any).transaction.updateMany({
                        where: {
                            invoiceId: inv.id,
                            status: 'PENDING'
                        },
                        data: { status: 'SUCCESS' }
                    });
                }

                try {
                    if (inv.client.user.email) {
                        const emailData = emailService.EmailTemplates.invoicePaid(inv.invoiceNumber);
                        await emailService.sendEmail(inv.client.user.email, emailData.subject, emailData.body);
                    }

                    if (inv.client.user.id) {
                        await notificationService.createNotification(
                            inv.client.user.id,
                            'SUCCESS',
                            'Invoice Paid',
                            `Invoice #${inv.invoiceNumber} has been marked as paid by admin.`,
                            `/client/invoices/${inv.id}`
                        );
                    }
                } catch (error) {
                    console.error("Failed to send manual invoice payment notifications", error);
                }

                if (status === InvoiceStatus.PAID) {
                    if (inv.orderId) {
                        await orderService.updateOrderStatus(
                            inv.orderId,
                            OrderStatus.COMPLETED,
                            r.user?.email || 'Admin',
                            'Invoice marked as paid manually'
                        );
                    }
                    await invoiceService.processInvoiceRenewals(inv.id);
                    // Distribute Investor Commissions call
                    await InvestorService.distributeCommissions(inv.id, inv.subtotal);
                }
            }
        }

        res.status(200).json({
            status: 'success',
            data: { invoice }
        });
    } catch (error: any) {
        console.error('[UpdateInvoiceStatus Error]:', error);
        res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
    }
};

/**
 * Admin: Add Manual Payment Transaction
 */
export const addAdminPayment = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    try {
        const { id } = r.params;
        const { amount, gateway, transactionId } = r.body;

        const invoiceId = parseInt(id as string);
        if (isNaN(invoiceId)) throw new AppError('Invalid invoice ID', 400);

        const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
        if (!invoice) throw new AppError('Invoice not found', 404);

        if (!amount || Number(amount) <= 0) {
            throw new AppError('Amount must be positive', 400);
        }

        // Use the centralized service to record payment AND trigger logic (activations etc)
        const result = await invoiceService.recordPayment(
            invoiceId,
            new Prisma.Decimal(amount),
            gateway || 'Manual/Cash',
            transactionId || `MANUAL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            { note: 'Admin added manual payment' }
        );

        res.status(200).json({
            status: 'success',
            message: 'Payment added successfully',
            data: {
                invoice: result.updatedInvoice,
                transaction: result.transaction
            }
        });

    } catch (error: any) {
        console.error('[AddAdminPayment Error]:', error);
        res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
    }
};

/**
 * Admin: Soft Delete Invoice
 */
export const deleteInvoice = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    try {
        const { id } = r.params;

        await (prisma as any).invoice.update({
            where: { id: parseInt(id as string) },
            data: {
                isDeleted: true,
                deletedAt: new Date()
            }
        });

        res.status(204).json({
            status: 'success',
            data: null
        });
    } catch (error: any) {
        console.error('[DeleteInvoice Error]:', error);
        res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
    }
};

/**
 * Get Client Transactions
 */
export const getClientTransactions = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    try {
        if (!r.user || r.user.userType !== UserType.CLIENT) throw new AppError('Unauthorized', 401);

        const client = await (prisma as any).client.findUnique({
            where: { userId: r.user.id }
        });

        if (!client) throw new AppError('Client account not found', 404);

        const transactions = await (prisma as any).transaction.findMany({
            where: {
                invoice: { clientId: client.id }
            },
            include: {
                invoice: {
                    select: { invoiceNumber: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.status(200).json({
            status: 'success',
            data: { transactions }
        });
    } catch (error: any) {
        console.error('[GetClientTransactions Error]:', error);
        res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
    }
};

/**
 * Admin: Manually Send Invoice Email Notification
 */
export const sendInvoiceNotification = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const invoiceId = parseInt(id as string);

        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: {
                client: {
                    include: { user: true }
                },
                items: true
            }
        });

        if (!invoice) throw new AppError('Invoice not found', 404);
        if (invoice.status === InvoiceStatus.PAID) {
            throw new AppError('Cannot send notification for a paid invoice.', 400);
        }

        const appName = await settingsService.getSetting('appName', 'WHMCS CRM');
        const taxName = await settingsService.getSetting('taxName', 'Tax');
        const currencySymbol = await settingsService.getCurrencySymbol();

        const pdfBuffer = await generateInvoicePDF(invoice, appName, taxName, currencySymbol);
        const { subject, body } = emailService.EmailTemplates.invoiceCreated(
            invoice.invoiceNumber,
            invoice.dueDate.toLocaleDateString(),
            invoice.totalAmount.toString()
        );

        await emailService.sendEmail(invoice.client.user.email, subject, body, [
            { filename: `Invoice-${invoice.invoiceNumber}.pdf`, content: pdfBuffer }
        ]);

        res.status(200).json({
            status: 'success',
            message: 'Invoice notification sent successfully'
        });
    } catch (error: any) {
        console.error('[SendInvoiceNotification Error]:', error);
        res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
    }
};
