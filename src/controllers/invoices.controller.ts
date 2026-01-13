import { Request, Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import * as invoiceService from '../services/invoiceService';
import { PaymentGatewayService } from '../services/gatewayService';
import { UserType, InvoiceStatus, OrderStatus, Prisma } from '@prisma/client';
import * as notificationService from '../services/notificationService';
import emailService from '../services/email.service';
import * as orderService from '../services/orderService';

/**
 * List Invoices with reseller isolation
 */
export const getInvoices = async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const { status, clientId } = req.query;
    const isReseller = req.user.userType === UserType.RESELLER;

    const invoices = await prisma.invoice.findMany({
        where: {
            ...(status && { status: status as InvoiceStatus }),
            ...(clientId && { clientId: parseInt(clientId as string) }),
            ...(isReseller ? { client: { resellerId: req.user.id } } : {}),
            ...(req.user.userType === UserType.CLIENT ? { clientId: (await prisma.client.findUnique({ where: { userId: req.user.id } }))?.id } : {}),
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
};

/**
 * Create a new Invoice (Manual)
 */
export const createInvoice = async (req: AuthRequest, res: Response) => {
    if (!req.user || (req.user.userType !== UserType.ADMIN && req.user.userType !== UserType.SUPER_ADMIN)) {
        throw new AppError('Unauthorized', 403);
    }

    const { clientId, date, dueDate, notes, adminNotes, items } = req.body;

    const client = await prisma.client.findUnique({ where: { id: parseInt(clientId) } });
    if (!client) throw new AppError('Client not found', 404);

    const totalAmount = items.reduce((sum: number, item: any) => sum + (parseFloat(item.amount) || 0), 0);

    const invoice = await prisma.invoice.create({
        data: {
            clientId: parseInt(clientId),
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
};

/**
 * Get Single Invoice
 */
export const getInvoice = async (req: AuthRequest, res: Response) => {
    const invoice = await prisma.invoice.findUnique({
        where: { id: parseInt(req.params.id) },
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
    if (!req.user) throw new AppError('Unauthorized', 401);
    if (req.user.userType === UserType.CLIENT) {
        const client = await prisma.client.findUnique({ where: { userId: req.user.id } });
        if (invoice.clientId !== client?.id) throw new AppError('Access denied', 403);
    }

    res.status(200).json({
        status: 'success',
        data: { invoice },
    });
};

/**
 * Initialize Payment (bKash/Nagad)
 */
export const initializePayment = async (req: AuthRequest, res: Response) => {
    const { invoiceId, gateway } = req.body;

    const invoice = await prisma.invoice.findUnique({
        where: { id: parseInt(invoiceId) },
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
};

/**
 * Submit Manual Payment Proof
 */
export const submitManualPayment = async (req: AuthRequest, res: Response) => {
    const { invoiceId, gateway, transactionId, senderNumber } = req.body;

    const invoice = await prisma.invoice.findUnique({
        where: { id: parseInt(invoiceId) },
    });

    if (!invoice) throw new AppError('Invoice not found', 404);

    const transaction = await prisma.transaction.create({
        data: {
            invoiceId: parseInt(invoiceId),
            gateway: gateway,
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
    } catch (error) {
        console.error("Failed to broadcasting admin payment notification", error);
    }

    res.status(200).json({
        status: 'success',
        message: 'Payment proof submitted. Waiting for verification.',
        data: { transaction }
    });
};

/**
 * Payment Webhook / Callback
 */
export const handlePaymentCallback = async (req: Request, res: Response) => {
    const { invoiceId, trxID, status, amount, gateway } = req.body;

    if (status === 'SUCCESS' || status === 'Completed') {
        console.log(`[PAYMENT CALLBACK] Processing successful payment for Invoice #${invoiceId}`);

        const result = await invoiceService.recordPayment(
            parseInt(invoiceId),
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
    const { status } = req.body;
    const { id } = req.params;
    const invoiceId = parseInt(id);

    // Fetch existing invoice with transactions to verify
    const existingInvoice = await prisma.invoice.findUnique({
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

    const invoice = await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
            status: status as InvoiceStatus,
            ...(status === InvoiceStatus.PAID ? { paidDate: new Date() } : {}),
            ...(status === InvoiceStatus.UNPAID ? { paidDate: null, amountPaid: 0 } : {})
        }
    });

    if (status === InvoiceStatus.PAID) {
        // If it was just marked as paid, we might need to update amountPaid if it was 0
        const inv = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: {
                client: {
                    include: { user: true }
                }
            }
        });

        if (inv) {
            // Find any pending transactions for this invoice
            const pendingTransactions = await prisma.transaction.findMany({
                where: {
                    invoiceId: inv.id,
                    status: 'PENDING'
                },
                orderBy: { createdAt: 'desc' }
            });

            const updateData: any = {};

            // If the invoice has no amount paid, set it to total
            if (inv.amountPaid.equals(0)) {
                updateData.amountPaid = inv.totalAmount;
            }

            // If we have pending transactions, use the most recent one's gateway as payment method
            if (pendingTransactions.length > 0 && !inv.paymentMethod) {
                updateData.paymentMethod = pendingTransactions[0].gateway;
            }

            if (Object.keys(updateData).length > 0) {
                await prisma.invoice.update({
                    where: { id: inv.id },
                    data: updateData
                });
            }

            // Update associated PENDING transactions to SUCCESS
            if (pendingTransactions.length > 0) {
                await prisma.transaction.updateMany({
                    where: {
                        invoiceId: inv.id,
                        status: 'PENDING'
                    },
                    data: { status: 'SUCCESS' }
                });
            }

            // Send Notifications (Email + Floating)
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

            // Note: Order completion is now handled atomically inside invoiceService.recordPayment
            // if we were to use recordPayment here, but updateInvoiceStatus currently 
            // uses direct prisma update. Let's ensure it's synced.
            if (status === InvoiceStatus.PAID) {
                // 1. Process Order Completion if linked
                if (inv.orderId) {
                    await orderService.updateOrderStatus(
                        inv.orderId,
                        OrderStatus.COMPLETED,
                        req.user?.email || 'Admin',
                        'Invoice marked as paid manually'
                    );
                }

                // 2. Process Renewals (Domains & Services)
                await invoiceService.processInvoiceRenewals(inv.id);
            }
        }
    }

    res.status(200).json({
        status: 'success',
        data: { invoice }
    });
};

/**
 * Admin: Soft Delete Invoice
 */
export const deleteInvoice = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    await prisma.invoice.update({
        where: { id: parseInt(id) },
        data: {
            isDeleted: true,
            deletedAt: new Date()
        }
    });

    res.status(204).json({
        status: 'success',
        data: null
    });
};

/**
 * Get Client Transactions
 */
export const getClientTransactions = async (req: AuthRequest, res: Response) => {
    if (!req.user || req.user.userType !== UserType.CLIENT) throw new AppError('Unauthorized', 401);

    const client = await prisma.client.findUnique({
        where: { userId: req.user.id }
    });

    if (!client) throw new AppError('Client account not found', 404);

    const transactions = await prisma.transaction.findMany({
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
};
