import { Request, Response } from 'express';
import prisma from '../config/database';
import { Prisma, UserType, OrderStatus, InvoiceStatus } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';
import { sendEmail, EmailTemplates } from '../services/email.service';
import { AuthRequest } from '../middleware/auth.middleware';
import emailService from '../services/email.service';
import * as notificationService from '../services/notificationService';
import * as orderService from '../services/orderService';
import * as invoiceService from '../services/invoiceService';
import { InvestorService } from '../services/investor.service';

/**
 * Currency Management
 */
export const getCurrencies = async (req: Request, res: Response) => {
    const currencies = await prisma.currency.findMany();
    res.status(200).json({ status: 'success', data: { currencies } });
};

export const createCurrency = async (req: Request, res: Response) => {
    const currency = await prisma.currency.create({ data: req.body });
    res.status(201).json({ status: 'success', data: { currency } });
};

/**
 * Tax Rate Management
 */
export const getTaxRates = async (req: Request, res: Response) => {
    const taxRates = await prisma.taxRate.findMany();
    res.status(200).json({ status: 'success', data: { taxRates } });
};

export const createTaxRate = async (req: Request, res: Response) => {
    const taxRate = await prisma.taxRate.create({ data: req.body });
    res.status(201).json({ status: 'success', data: { taxRate } });
};

/**
 * Attempt Credit Card Captures (Admin Only)
 */
export const attemptCCCapture = async (req: Request, res: Response) => {
    // 1. Find all unpaid invoices
    const dueInvoices = await prisma.invoice.findMany({
        where: {
            status: 'UNPAID',
            dueDate: { lte: new Date() }
        },
        include: { client: true }
    });

    const results = {
        totalFound: dueInvoices.length,
        processed: 0,
        succeeded: 0,
        failed: 0,
        logs: [] as any[]
    };

    for (const invoice of dueInvoices) {
        results.processed++;
        // Mock capture logic - 80% success rate for demo
        const success = Math.random() > 0.2;

        if (success) {
            await prisma.invoice.update({
                where: { id: invoice.id },
                data: {
                    status: 'PAID',
                    paidDate: new Date(),
                    amountPaid: invoice.totalAmount,
                    paymentMethod: 'Credit Card (Stored)'
                }
            });
            results.succeeded++;
            results.logs.push(`Successfully captured payment for Invoice #${invoice.invoiceNumber}`);
        } else {
            results.failed++;
            results.logs.push(`Failed to capture payment for Invoice #${invoice.invoiceNumber}: card_declined`);
        }
    }

    res.status(200).json({ status: 'success', data: { results } });
};

/**
 * Transaction History
 */
export const getTransactions = async (req: Request, res: Response) => {
    const { invoiceId, startDate, endDate } = req.query;

    const where: any = {};
    if (invoiceId) where.invoiceId = parseInt(invoiceId as string);
    if (startDate && endDate) {
        where.createdAt = {
            gte: new Date(startDate as string),
            lte: new Date(endDate as string)
        };
    }

    const transactions = await prisma.transaction.findMany({
        where,
        include: {
            invoice: {
                select: {
                    id: true,
                    invoiceNumber: true,
                    client: {
                        select: {
                            user: {
                                select: {
                                    firstName: true,
                                    lastName: true
                                }
                            },
                            companyName: true
                        }
                    }
                }
            },
            refunds: true
        },
        orderBy: { createdAt: 'desc' }
    });

    // Transform data to flatten the client name
    const formattedTransactions = transactions.map(t => ({
        ...t,
        clientName: t.invoice?.client.companyName ||
            (t.invoice?.client.user ? `${t.invoice.client.user.firstName} ${t.invoice.client.user.lastName}` : 'Unknown')
    }));

    res.status(200).json({ status: 'success', data: { transactions: formattedTransactions } });
};

/**
 * Verify Transaction (Approve/Reject)
 */
export const verifyTransaction = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { action } = req.body; // 'APPROVE' or 'REJECT'

    const transaction = await prisma.transaction.findUnique({
        where: { id: parseInt(id as string) },
        include: {
            invoice: {
                include: {
                    client: {
                        include: { user: true }
                    }
                }
            }
        }
    });

    if (!transaction) throw new AppError('Transaction not found', 404);
    if (transaction.status !== 'PENDING') {
        const msg = `Transaction is already ${transaction.status.toLowerCase()}`;
        if ((transaction.status === 'SUCCESS' && action === 'APPROVE') ||
            (transaction.status === 'FAILED' && action === 'REJECT')) {
            return res.status(200).json({ status: 'success', message: msg });
        }
        throw new AppError(msg, 400);
    }

    const invoice = transaction.invoice;
    const clientEmail = invoice.client.user.email;
    const clientName = `${invoice.client.user.firstName} ${invoice.client.user.lastName}`;
    const invoiceNumber = invoice.invoiceNumber || invoice.id.toString();

    if (action === 'APPROVE') {
        const newAmountPaid = (invoice.amountPaid || new Prisma.Decimal(0)).add(transaction.amount);
        const newStatus = newAmountPaid.greaterThanOrEqualTo(invoice.totalAmount) ? 'PAID' : 'PARTIALLY_PAID';

        await prisma.$transaction([
            prisma.transaction.update({
                where: { id: transaction.id },
                data: { status: 'SUCCESS' }
            }),
            prisma.invoice.update({
                where: { id: invoice.id },
                data: {
                    amountPaid: newAmountPaid,
                    status: newStatus as any,
                    paidDate: (newStatus === 'PAID') ? new Date() : null,
                    paymentMethod: transaction.gateway
                }
            })
        ]);

        // Post-payment actions (trapped in try-catch to ensure we don't return 500 if payment succeeded)
        try {
            if (newStatus === 'PAID') {
                // 1. Process Order Completion if linked
                if (invoice.orderId) {
                    await orderService.updateOrderStatus(
                        invoice.orderId,
                        OrderStatus.COMPLETED,
                        req.user?.email || 'Admin',
                        'Transaction approved manually'
                    );
                }

                // 2. Process Renewals (Domains & Services)
                await invoiceService.processInvoiceRenewals(invoice.id);

                // 3. Distribute Investor Commissions
                await InvestorService.distributeCommissions(invoice.id, invoice.subtotal);
            }
        } catch (postErr) {
            console.error('[VerifyTransaction] Post-approval task failed:', postErr);
        }

        // Notifications (Client)
        try {
            const emailData = emailService.EmailTemplates.invoicePaid(invoiceNumber);
            await emailService.sendEmail(clientEmail, emailData.subject, emailData.body);
        } catch (clientEmailErr) {
            console.error(`Failed to send payment confirmation to client ${clientEmail}:`, clientEmailErr);
        }

        // Notifications (Admins)
        try {
            const admins = await prisma.user.findMany({
                where: { userType: { in: [UserType.ADMIN, UserType.SUPER_ADMIN, 'STAFF'] as any }, status: 'ACTIVE' },
                select: { email: true }
            });

            const adminNotification = emailService.EmailTemplates.adminTransitionNotification(
                'Invoice Payment Received',
                `Invoice: #${invoiceNumber}\nClient: ${clientName}\nAmount: ${transaction.amount}\nTotal Paid: ${newAmountPaid}\nMethod: ${transaction.gateway}\nTransaction Ref: ${transaction.transactionId}`
            );

            for (const admin of admins) {
                if (admin.email) {
                    try {
                        await emailService.sendEmail(admin.email, adminNotification.subject, adminNotification.body);
                    } catch (sendErr) {
                        console.error(`Failed to send payment notification to admin ${admin.email}:`, sendErr);
                    }
                }
            }
        } catch (adminEmailError) {
            console.error('Failed to send admin payment notifications:', adminEmailError);
        }

        // Floating Notification
        if (invoice.client.user.id) {
            try {
                await notificationService.createNotification(
                    invoice.client.user.id,
                    'SUCCESS',
                    'Payment Approved',
                    `Your payment of ${transaction.amount} for Invoice #${invoiceNumber} has been approved.`,
                    `/client/invoices/${invoice.id}`
                );
            } catch (notifErr) {
                console.error('Failed to create in-app notification:', notifErr);
            }
        }

    } else if (action === 'REJECT') {
        await prisma.transaction.update({
            where: { id: transaction.id },
            data: { status: 'FAILED' }
        });

        // Notifications
        try {
            const emailData = emailService.EmailTemplates.paymentRejected(invoiceNumber, 'Admin Declined');
            await emailService.sendEmail(clientEmail, emailData.subject, emailData.body);

            if (invoice.client.user.id) {
                await notificationService.createNotification(
                    invoice.client.user.id,
                    'ERROR',
                    'Payment Rejected',
                    `Your payment for Invoice #${invoiceNumber} was rejected. Please contact support.`,
                    `/client/invoices/${invoice.id}`
                );
            }
        } catch (rejErr) {
            console.error('Error during rejection notification:', rejErr);
        }
    } else {
        throw new AppError('Invalid action', 400);
    }

    res.status(200).json({
        status: 'success',
        message: `Transaction ${action.toLowerCase()}d successfully`
    });
};

/**
 * Refund Management
 */
export const requestRefund = async (req: AuthRequest, res: Response) => {
    const { transactionId, amount, reason } = req.body;
    const user = req.user!;

    const transaction = await prisma.transaction.findUnique({
        where: { id: parseInt(transactionId as string) },
        include: { invoice: true }
    });

    if (!transaction) throw new AppError('Transaction not found', 404);
    if (transaction.status !== 'SUCCESS') throw new AppError('Only successful transactions can be refunded', 400);

    // Validate refund amount against transaction total
    const existingRefunds = await prisma.refund.findMany({
        where: {
            transactionId: parseInt(transactionId as string),
            status: { not: 'REJECTED' }
        }
    });

    const totalRefundedOrPending = existingRefunds.reduce((acc, curr) => acc.add(curr.amount), new Prisma.Decimal(0));
    const requestedAmount = new Prisma.Decimal(amount);

    if (totalRefundedOrPending.add(requestedAmount).gt(transaction.amount)) {
        throw new AppError(`Requested refund exceeds refundable balance. Refunded/Pending: ${totalRefundedOrPending}, Max: ${transaction.amount}`, 400);
    }

    let status = 'PENDING_AUTHORIZATION';
    let authorizedById = null;
    let approvedById = null;

    if (user.userType === UserType.SUPER_ADMIN) {
        status = 'COMPLETED';
        authorizedById = user.id;
        approvedById = user.id;
    } else if (user.userType === UserType.ADMIN) {
        status = 'PENDING_APPROVAL';
        authorizedById = user.id;
    }

    const refund = await prisma.refund.create({
        data: {
            transactionId: parseInt(transactionId as string),
            amount: new Prisma.Decimal(amount),
            reason,
            status,
            requestedById: user.id,
            authorizedById,
            approvedById
        }
    });

    if (status === 'COMPLETED') {
        await processRefundCompletion(refund.id);
    } else {
        // Notify Admins about Pending Refund
        try {
            await notificationService.broadcastToAdmins(
                'WARNING',
                'New Refund Request',
                `Refund requested for Transaction #${transactionId} (${amount}). Reason: ${reason}`,
                `/admin/billing/refunds`
            );
        } catch (error) {
            console.error("Failed to broadcasting admin refund notification", error);
        }
    }

    res.status(201).json({ status: 'success', data: { refund } });
};

export const authorizeRefund = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const user = req.user!;

    if (user.userType !== UserType.ADMIN && user.userType !== UserType.SUPER_ADMIN) {
        throw new AppError('Unauthorized', 403);
    }

    const refund = await prisma.refund.findUnique({ where: { id: parseInt(id as string) } });
    if (!refund) throw new AppError('Refund request not found', 404);
    if (refund.status !== 'PENDING_AUTHORIZATION') throw new AppError('Refund is not in authorization phase', 400);

    const updatedRefund = await prisma.refund.update({
        where: { id: parseInt(id as string) },
        data: {
            status: 'PENDING_APPROVAL',
            authorizedById: user.id
        }
    });

    res.status(200).json({ status: 'success', data: { refund: updatedRefund } });
};

export const approveRefund = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { action, rejectionReason } = req.body;
    const user = req.user!;

    if (user.userType !== UserType.SUPER_ADMIN) {
        throw new AppError('Only Super Admins can approve refunds', 403);
    }

    const refund = await prisma.refund.findUnique({ where: { id: parseInt(id as string) } });
    if (!refund) throw new AppError('Refund request not found', 404);
    if (refund.status !== 'PENDING_APPROVAL') throw new AppError('Refund is not in approval phase', 400);

    if (action === 'REJECT') {
        const updatedRefund = await prisma.refund.update({
            where: { id: parseInt(id as string) },
            data: {
                status: 'REJECTED',
                rejectionReason
            }
        });
        return res.status(200).json({ status: 'success', data: { refund: updatedRefund } });
    }

    // Final Validation: Ensure this approval doesn't exceed transaction total
    // This catches race conditions or pre-existing duplicate requests
    const transaction = await prisma.transaction.findUnique({
        where: { id: refund.transactionId },
        include: { refunds: true }
    });

    if (transaction) {
        const alreadyRefunded = transaction.refunds
            .filter(r => r.status === 'COMPLETED')
            .reduce((acc, curr) => acc.add(curr.amount), new Prisma.Decimal(0));

        if (alreadyRefunded.add(refund.amount).gt(transaction.amount)) {
            throw new AppError(`Approval failed. Total refunded (${alreadyRefunded}) + this refund (${refund.amount}) exceeds transaction amount (${transaction.amount}).`, 400);
        }
    }

    const updatedRefund = await prisma.refund.update({
        where: { id: parseInt(id as string) },
        data: {
            status: 'COMPLETED',
            approvedById: user.id
        }
    });

    await processRefundCompletion(updatedRefund.id);

    res.status(200).json({ status: 'success', data: { refund: updatedRefund } });
};

export const getRefunds = async (req: AuthRequest, res: Response) => {
    const refunds = await prisma.refund.findMany({
        include: {
            transaction: {
                include: {
                    invoice: {
                        include: {
                            client: {
                                include: { user: true }
                            }
                        }
                    }
                }
            },
            requestedBy: {
                select: { firstName: true, lastName: true, username: true, email: true }
            },
            authorizedBy: {
                select: { firstName: true, lastName: true, username: true }
            },
            approvedBy: {
                select: { firstName: true, lastName: true, username: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ status: 'success', data: { refunds } });
};

async function processRefundCompletion(refundId: number) {
    const refund = await prisma.refund.findUnique({
        where: { id: refundId },
        include: { transaction: { include: { invoice: true } } }
    });

    if (!refund) return;

    const originalTransaction = refund.transaction;
    const invoice = originalTransaction.invoice;

    const newAmountPaid = (invoice.amountPaid || new Prisma.Decimal(0)).sub(refund.amount);
    // Determine new invoice status
    let newStatus = invoice.status;
    if (newAmountPaid.lte(0)) {
        newStatus = 'REFUNDED';
    } else if (newAmountPaid.lt(invoice.totalAmount)) {
        newStatus = 'PARTIALLY_PAID';
    }

    await prisma.$transaction([
        prisma.transaction.create({
            data: {
                invoiceId: invoice.id,
                gateway: 'Internal Refund',
                amount: refund.amount.negated(),
                status: 'SUCCESS',
                adminNotes: `Refund for Transaction #${originalTransaction.transactionId || originalTransaction.id}. Reason: ${refund.reason}`,
                transactionId: `REF-${Date.now()}`
            }
        }),
        prisma.invoice.update({
            where: { id: invoice.id },
            data: {
                amountPaid: newAmountPaid,
                status: newStatus
            }
        })
    ]);

    // Send Refund Notification Email & Floating Notification
    try {
        const client = await prisma.client.findUnique({
            where: { id: invoice.clientId },
            include: { user: true }
        });

        if (client?.user?.email) {
            const { subject, body } = EmailTemplates.refundProcessed(
                invoice.invoiceNumber,
                refund.amount.toString(),
                refund.reason
            );
            await sendEmail(client.user.email, subject, body);

            // Create Floating Notification
            if (client.user.id) {
                await notificationService.createNotification(
                    client.user.id,
                    'SUCCESS',
                    'Refund Processed',
                    `Your refund of ${refund.amount} for invoice #${invoice.invoiceNumber} has been processed.`,
                    `/client/billing`
                );
            }
        }
    } catch (error) {
        console.error("Failed to send refund notification:", error);
    }
}
