import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { InvoiceStatus, OrderStatus, Prisma, UserType } from '@prisma/client';
import { MarketingService } from './marketingService';
import { ResellerService } from './resellerService';
import { InvestorService } from './investor.service';
import { sendEmail, EmailTemplates } from './email.service';
import { generateInvoicePDF } from './pdfService';
import * as settingsService from './settingsService';
import { WebhookService } from './webhook.service';

/**
 * Generate a unique invoice number
 * Format: INV-YYYYMMDD-XXXX
 */
const generateInvoiceNumber = () => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(1000 + Math.random() * 9000);
    return `INV-${date}-${random}`;
};

/**
 * Create Invoice from Order
 */
export const createInvoiceFromOrder = async (orderId: number, tx?: Prisma.TransactionClient) => {
    const db = tx || prisma;
    const order = await db.order.findUnique({
        where: { id: orderId },
        include: {
            items: {
                include: { product: true }
            },
            client: {
                include: { group: true, user: true }
            }
        }
    });

    if (!order) throw new AppError('Order not found', 404);

    // 3. Calculate Totals from actual Order Items
    // Rely on the order.items values which were calculated by pricingService during order creation
    let subtotal = new Prisma.Decimal(0);
    const invoiceItems = order.items.flatMap((item: any) => {
        const productName = item.product?.name || `Product #${item.productId}`;
        const items = [];

        // Add the main product line item
        const productItem = {
            description: `${productName} (ID: ${item.productId}) - ${item.billingCycle} ${item.domainName ? `(${item.domainName})` : ''}`,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalAmount: new Prisma.Decimal(item.unitPrice.toString()).mul(item.quantity),
            serviceId: undefined
        };
        items.push(productItem);
        subtotal = subtotal.add(productItem.totalAmount);

        // Add setup fee as a separate line item if non-zero
        if (item.setupFee && Number(item.setupFee) > 0) {
            const setupFeeItem = {
                description: `Setup Fee - ${productName}`,
                quantity: 1,
                unitPrice: item.setupFee,
                totalAmount: item.setupFee,
                serviceId: undefined
            };
            items.push(setupFeeItem);
            subtotal = subtotal.add(setupFeeItem.totalAmount);
        }

        return items;
    });

    const currentTaxRate = await settingsService.getTaxRate();
    const taxAmount = order.client.group?.taxExempt ? new Prisma.Decimal(0) : subtotal.mul(currentTaxRate);
    const totalAmount = subtotal.add(taxAmount);

    const invoice = await db.invoice.create({
        data: {
            invoiceNumber: generateInvoiceNumber(),
            clientId: order.clientId,
            orderId: order.id,
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days due
            subtotal,
            taxAmount,
            totalAmount,
            status: InvoiceStatus.UNPAID,
            items: {
                create: invoiceItems
            }
        }
    });

    // 3. Prepare Full Invoice for PDF (with items and user)
    const fullInvoice = await db.invoice.findUnique({
        where: { id: invoice.id },
        include: {
            items: true,
            client: { include: { user: true } }
        }
    });

    // 4. Send Email with PDF Attachment
    try {
        const appName = await settingsService.getSetting('appName', 'WHMCS CRM');
        const taxName = await settingsService.getSetting('taxName', 'Tax');
        const currencySymbol = await settingsService.getCurrencySymbol();
        const pdfBuffer = await generateInvoicePDF(fullInvoice, appName, taxName, currencySymbol);
        const { subject, body } = EmailTemplates.invoiceCreated(
            invoice.invoiceNumber,
            invoice.dueDate.toLocaleDateString(),
            invoice.totalAmount.toString()
        );

        await sendEmail(order.client.user.email, subject, body, [
            { filename: `Invoice-${invoice.invoiceNumber}.pdf`, content: pdfBuffer }
        ]);
    } catch (e) {
        console.error("Invoice email processing failed:", e);
    }

    // Webhook Dispatch
    WebhookService.dispatch('invoice.created', fullInvoice).catch(e => console.error("Webhook dispatch failed", e));


    return invoice;
};

/**
 * Record payment and update invoice status
 */
export const recordPayment = async (invoiceId: number, amount: Prisma.Decimal, gateway: string, transactionId: string, response?: any) => {
    const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { client: { include: { user: true } } }
    });

    if (!invoice) throw new AppError('Invoice not found', 404);

    // Increase timeout since we do order activation inside
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {

        // 1. Create Transaction record
        const transaction = await tx.transaction.create({
            data: {
                invoiceId,
                gateway,
                amount,
                status: 'SUCCESS',
                transactionId,
                gatewayResponse: response ? JSON.stringify(response) : null,
            }
        });

        // 2. Update Invoice
        const newAmountPaid = invoice.amountPaid.add(amount);
        const newStatus = newAmountPaid.greaterThanOrEqualTo(invoice.totalAmount) ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

        const updatedInvoice = await tx.invoice.update({
            where: { id: invoiceId },
            data: {
                amountPaid: newAmountPaid,
                status: newStatus,
                paidDate: newStatus === InvoiceStatus.PAID ? new Date() : null,
                paymentMethod: gateway,
            }
        });

        // Distribute Investor Commissions on PAYMENT
        if (newStatus === InvoiceStatus.PAID) {
            await InvestorService.distributeCommissions(updatedInvoice.id, updatedInvoice.subtotal, tx);
        }

        // 3. ATOMIC ORDER ACTIVATION
        let activatedOrder = null;
        if (updatedInvoice.orderId && newStatus === InvoiceStatus.PAID) {
            console.log(`[ATOMIC ACTIVATION] Invoice #${updatedInvoice.invoiceNumber} paid. Activating Order #${updatedInvoice.orderId}`);

            const order = await tx.order.findUnique({
                where: { id: updatedInvoice.orderId },
                include: {
                    items: { include: { product: true } },
                    client: { include: { user: true } }
                }
            });

            if (order && order.status !== OrderStatus.COMPLETED) {
                // Update Order Status
                await tx.order.update({
                    where: { id: order.id },
                    data: { status: OrderStatus.COMPLETED }
                });

                // Record history
                await tx.orderStatusHistory.create({
                    data: {
                        orderId: order.id,
                        oldStatus: order.status,
                        newStatus: OrderStatus.COMPLETED,
                        changedBy: 'System (Payment)',
                        changeReason: `Automatically completed on payment of Invoice #${updatedInvoice.invoiceNumber}`,
                    },
                });

                // Award commissions
                await MarketingService.awardCommission(order.id, tx);
                await ResellerService.handleOrderCommission(order.id, tx);

                // Process items (domains/services)
                for (const item of order.items) {
                    const productType = item.product?.productType;

                    if (productType === 'DOMAIN' && item.domainName) {
                        const existingDomain = await tx.domain.findFirst({
                            where: { domainName: item.domainName, clientId: order.clientId }
                        });

                        if (!existingDomain) {
                            const period = item.billingCycle === 'BIENNIALLY' ? 2 :
                                item.billingCycle === 'TRIENNIALLY' ? 3 : 1;
                            const expiryDate = new Date();
                            expiryDate.setFullYear(expiryDate.getFullYear() + period);

                            await tx.domain.create({
                                data: {
                                    clientId: order.clientId,
                                    domainName: item.domainName,
                                    expiryDate: expiryDate,
                                    registrar: 'Manual Order',
                                    status: 'ACTIVE',
                                    autoRenew: true
                                }
                            });
                        }
                    } else if (productType !== 'DOMAIN') {
                        const service = await tx.service.findFirst({
                            where: { orderId: order.id, productId: item.productId }
                        });

                        if (service) {
                            const now = new Date();
                            const nextDueDate = new Date(now);
                            const cycle = service.billingCycle?.toLowerCase();
                            if (cycle === 'monthly') nextDueDate.setMonth(now.getMonth() + 1);
                            else if (cycle === 'annually') nextDueDate.setFullYear(now.getFullYear() + 1);
                            else nextDueDate.setMonth(now.getMonth() + 1);

                            await tx.service.update({
                                where: { id: service.id },
                                data: { status: 'ACTIVE' as any, nextDueDate }
                            });
                        }
                    }
                }
                activatedOrder = order;
                console.log(`[ATOMIC ACTIVATION] Order #${order.id} fully processed and services activated.`);
            }
        }

        // 3b. ATOMIC ACTIVATION (Non-Order / Bulk Provision Items)
        // If there is NO Order ID, we still might have services/domains linked directly to invoice items (e.g. from Bulk Provisioning)
        else if (!updatedInvoice.orderId && newStatus === InvoiceStatus.PAID) {
            console.log(`[ATOMIC ACTIVATION] Invoice #${updatedInvoice.invoiceNumber} paid (No Order). Checking for direct service/domain links...`);

            const items = await tx.invoiceItem.findMany({
                where: { invoiceId: updatedInvoice.id }
            });

            for (const item of items) {
                // Activate Service
                if (item.serviceId) {
                    const service = await tx.service.findUnique({ where: { id: item.serviceId } });
                    if (service && service.status === 'PENDING') {
                        const now = new Date();
                        const nextDueDate = new Date(now);
                        const cycle = service.billingCycle?.toLowerCase();
                        if (cycle === 'monthly') nextDueDate.setMonth(now.getMonth() + 1);
                        else if (cycle === 'annually') nextDueDate.setFullYear(now.getFullYear() + 1);
                        else nextDueDate.setMonth(now.getMonth() + 1);

                        await tx.service.update({
                            where: { id: service.id },
                            data: { status: 'ACTIVE', nextDueDate }
                        });
                        console.log(`[ATOMIC ACTIVATION] Service #${service.id} activated.`);
                    }
                }

                // Activate Domain
                // Note: Bulk provision might not link domainId to InvoiceItem directly depending on controller logic,
                // but good to support it. If controller links serviceId, and that service has a domain...
                if (item.domainId) {
                    const domain = await tx.domain.findUnique({ where: { id: item.domainId } });
                    if (domain && domain.status === 'PENDING') {
                        await tx.domain.update({
                            where: { id: domain.id },
                            data: { status: 'ACTIVE' }
                        });
                        console.log(`[ATOMIC ACTIVATION] Domain #${domain.id} activated.`);
                    }
                } else if (item.serviceId) {
                    // Check if service has a domain that needs activation
                    const service = await tx.service.findUnique({ where: { id: item.serviceId } });
                    if (service && service.domain) {
                        // Find domain by name + client
                        const domain = await tx.domain.findFirst({
                            where: { domainName: service.domain, clientId: service.clientId, status: 'PENDING' }
                        });
                        if (domain) {
                            await tx.domain.update({
                                where: { id: domain.id },
                                data: { status: 'ACTIVE' }
                            });
                            console.log(`[ATOMIC ACTIVATION] Domain #${domain.id} (${domain.domainName}) activated via Service link.`);
                        }
                    }
                }
            }
        }

        // 4. ATOMIC RENEWALS
        if (newStatus === InvoiceStatus.PAID) {
            await processInvoiceRenewals(invoiceId, tx);
        }

        // Return everything needed for post-transaction actions (emails)
        const fullInvoice = await tx.invoice.findUnique({
            where: { id: invoiceId },
            include: {
                items: true,
                client: { include: { user: true } }
            }
        });

        return { updatedInvoice, transaction, fullInvoice };

    }, { timeout: 25000 }); // Increase timeout to 25s

    // 5. POST-TRANSACTION EMAILS (Non-blocking)
    if (result.fullInvoice) {
        // Send Payment Paid Email
        try {
            const pdfBuffer = await generateInvoicePDF(result.fullInvoice);
            const { subject, body } = EmailTemplates.invoicePaid(result.updatedInvoice.invoiceNumber);

            await sendEmail((result.fullInvoice as any).client.user.email, subject, body, [
                { filename: `Paid_Invoice-${result.updatedInvoice.invoiceNumber}.pdf`, content: pdfBuffer }
            ]);

            // Notify Admins
            const admins = await prisma.user.findMany({
                where: { userType: { in: [UserType.ADMIN, UserType.SUPER_ADMIN] }, status: 'ACTIVE' },
                select: { email: true }
            });

            const adminNotification = EmailTemplates.adminTransitionNotification(
                'Invoice Paid (Gateway/Callback)',
                `Invoice: #${result.updatedInvoice.invoiceNumber}\nClient: ${(result.fullInvoice as any).client.user.firstName} ${(result.fullInvoice as any).client.user.lastName}\nAmount: ${amount}\nMethod: ${gateway}\nTransaction ID: ${transactionId}`
            );

            for (const admin of admins) {
                if (admin.email) {
                    try {
                        await sendEmail(admin.email, adminNotification.subject, adminNotification.body);
                    } catch (sendErr) {
                        console.error(`Failed to send invoice payout notification to admin ${admin.email}`);
                    }
                }
            }
        } catch (e) {
            console.error("Payment confirmation email failed:", e);
        }

        // Webhook Dispatch
        if (result.updatedInvoice.status === InvoiceStatus.PAID) {
            WebhookService.dispatch('invoice.paid', result.updatedInvoice).catch(e => console.error("Webhook dispatch failed", e));
            WebhookService.dispatch('payment.received', result.transaction).catch(e => console.error("Webhook dispatch failed", e));
        }
    }

    return result;
};

/**
 * Generate Invoices for due recurring services
 */
export const generateRecurringInvoices = async () => {
    const now = new Date();
    const generatedInvoices = [];

    // 1. Process ACTIVE recurring services
    const dueServices = await prisma.service.findMany({
        where: {
            status: 'ACTIVE',
            nextDueDate: { lte: now },
        },
        include: {
            client: { include: { group: true } },
            product: true
        }
    });

    for (const service of dueServices) {
        // Skip if there's already an unpaid invoice for this service
        const existingInvoice = await prisma.invoice.findFirst({
            where: {
                clientId: service.clientId,
                status: InvoiceStatus.UNPAID,
                items: {
                    some: { serviceId: service.id }
                }
            }
        });

        if (existingInvoice) continue;

        const price = service.product.monthlyPrice;
        const taxAmount = service.client.group?.taxExempt ? new Prisma.Decimal(0) : price.mul(0.05);
        const totalAmount = price.add(taxAmount);

        const invoice = await prisma.invoice.create({
            data: {
                invoiceNumber: generateInvoiceNumber(),
                clientId: service.clientId,
                dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                subtotal: price,
                taxAmount,
                totalAmount,
                status: InvoiceStatus.UNPAID,
                adminNotes: `Auto-generated for Service ID: ${service.id}`,
                items: {
                    create: [{
                        description: `Renewal - ${service.product.name} (Product ID: ${service.productId}) (${service.domain || 'no domain'})`,
                        quantity: 1,
                        unitPrice: price,
                        totalAmount: price,
                        serviceId: service.id
                    }]
                }
            }
        });

        const nextDate = new Date(service.nextDueDate!);
        const cycle = (service.billingCycle || 'monthly').toLowerCase();

        if (cycle === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
        else if (cycle === 'quarterly') nextDate.setMonth(nextDate.getMonth() + 3);
        else if (cycle === 'semi-annually') nextDate.setMonth(nextDate.getMonth() + 6);
        else if (cycle === 'annually') nextDate.setFullYear(nextDate.getFullYear() + 1);
        else if (cycle === 'biennial') nextDate.setFullYear(nextDate.getFullYear() + 2);
        else if (cycle === 'triennial') nextDate.setFullYear(nextDate.getFullYear() + 3);
        else nextDate.setMonth(nextDate.getMonth() + 1); // fallback

        await prisma.service.update({
            where: { id: service.id },
            data: { nextDueDate: nextDate }
        });

        generatedInvoices.push(invoice);
    }

    // 2. Process BillableItems (One-time or manual recurring)
    const dueItems = await prisma.billableItem.findMany({
        where: {
            status: 'UNINVOICED',
            nextInvoiceDate: { lte: now }
        },
        include: { client: { include: { group: true } } }
    });

    for (const item of dueItems) {
        const taxAmount = item.client.group?.taxExempt ? new Prisma.Decimal(0) : item.unitPrice.mul(item.quantity).mul(0.05);
        const subtotal = item.unitPrice.mul(item.quantity);
        const totalAmount = subtotal.add(taxAmount);

        const invoice = await prisma.invoice.create({
            data: {
                invoiceNumber: generateInvoiceNumber(),
                clientId: item.clientId,
                dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                subtotal,
                taxAmount,
                totalAmount,
                status: InvoiceStatus.UNPAID,
                adminNotes: `Auto-generated for Billable Item: ${item.description}`,
                items: {
                    create: [{
                        description: item.description,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        totalAmount: subtotal
                    }]
                }
            }
        });

        // Update BillableItem status or next date
        if (item.recurringFrequency) {
            const nextDate = new Date(item.nextInvoiceDate!);
            if (item.recurringFrequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
            else if (item.recurringFrequency === 'quarterly') nextDate.setMonth(nextDate.getMonth() + 3);
            else if (item.recurringFrequency === 'annually') nextDate.setFullYear(nextDate.getFullYear() + 1);

            await prisma.billableItem.update({
                where: { id: item.id },
                data: { nextInvoiceDate: nextDate }
            });
        } else {
            await prisma.billableItem.update({
                where: { id: item.id },
                data: { status: 'INVOICED' }
            });
        }

        generatedInvoices.push(invoice);
    }

    return generatedInvoices;
};

/**
 * Create a renewal invoice for a service or domain
 */
export const createRenewalInvoice = async (type: 'SERVICE' | 'DOMAIN', itemId: number, period: number = 1) => {
    return await prisma.$transaction(async (tx) => {
        let clientId: number;
        let description: string;
        let price: Prisma.Decimal;
        let serviceId: number | undefined;
        let domainId: number | undefined;
        let metadata: string | undefined;

        if (type === 'SERVICE') {
            const service = await tx.service.findUnique({
                where: { id: itemId },
                include: { product: true, client: { include: { group: true } } }
            });
            if (!service) throw new AppError('Service not found', 404);

            // Check if already has an unpaid invoice for this service
            const existing = await tx.invoice.findFirst({
                where: {
                    clientId: service.clientId,
                    status: InvoiceStatus.UNPAID,
                    items: { some: { serviceId: service.id } }
                }
            });
            if (existing) return existing;

            clientId = service.clientId;
            const unitPrice = service.amount;
            price = unitPrice.mul(period);
            const cycleSuffix = service.billingCycle?.toLowerCase() === 'annually' ? 'Year' : 'Month';
            description = `Renewal - ${service.product.name} (${period} ${cycleSuffix}${period > 1 ? 's' : ''}) (${service.domain || 'no domain'})`;
            serviceId = service.id;
            metadata = JSON.stringify({ type: 'service_renewal', period });
        } else {
            const domain = await tx.domain.findUnique({
                where: { id: itemId },
                include: { client: { include: { group: true } } }
            });
            if (!domain) throw new AppError('Domain not found', 404);

            // Check if already has an unpaid invoice for this domain
            const existing = await tx.invoice.findFirst({
                where: {
                    clientId: domain.clientId,
                    status: InvoiceStatus.UNPAID,
                    items: { some: { domainId: domain.id } }
                }
            });
            if (existing) return existing;

            // Find renewal price from DomainTLD
            const parts = domain.domainName.split('.');
            const tldVariations = [
                `.${parts.slice(-2).join('.')}`, // .co.uk
                parts.slice(-2).join('.'),       // co.uk
                `.${parts[parts.length - 1]}`,   // .com
                parts[parts.length - 1]          // com
            ];

            const tldRecord = await tx.domainTLD.findFirst({
                where: { tld: { in: tldVariations } },
                orderBy: { tld: 'desc' } // length sorting not available in DB, simplistic approach
            });

            // If multiple, ideally we want longest match. 
            // Since we can't easily sort by length in findFirst, we fetch potentially matching ones
            const possibleTLDs = await tx.domainTLD.findMany({
                where: { tld: { in: tldVariations } }
            });

            // Sort by length desc (longest match first)
            const matchedTLD = possibleTLDs.sort((a, b) => b.tld.length - a.tld.length)[0];

            clientId = domain.clientId;
            const unitPrice = matchedTLD?.renewalPrice || new Prisma.Decimal(15.00); // Default 15.00
            price = unitPrice.mul(period);
            description = `Renewal - Domain: ${domain.domainName} (${period} Year${period > 1 ? 's' : ''})`;
            domainId = domain.id;
            metadata = JSON.stringify({ type: 'domain_renewal', period });
        }

        const client = await tx.client.findUnique({
            where: { id: clientId! },
            include: { group: true, user: true }
        });

        const taxAmount = client?.group?.taxExempt ? new Prisma.Decimal(0) : price!.mul(0.05);
        const totalAmount = price!.add(taxAmount);

        const invoice = await tx.invoice.create({
            data: {
                invoiceNumber: generateInvoiceNumber(),
                clientId: clientId!,
                dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                subtotal: price!,
                taxAmount,
                totalAmount,
                status: InvoiceStatus.UNPAID,
                items: {
                    create: [{
                        description: description!,
                        quantity: 1,
                        unitPrice: price!,
                        totalAmount: price!,
                        serviceId,
                        domainId,
                        metadata
                    }]
                }
            },
            include: { items: true, client: { include: { user: true } } }
        });

        // Send Email
        try {
            const pdfBuffer = await generateInvoicePDF(invoice);
            const { subject, body } = EmailTemplates.invoiceCreated(
                invoice.invoiceNumber,
                invoice.dueDate.toLocaleDateString(),
                invoice.totalAmount.toString()
            );

            await sendEmail(invoice.client.user.email, subject, body, [
                { filename: `Invoice-${invoice.invoiceNumber}.pdf`, content: pdfBuffer }
            ]);
        } catch (e) {
            console.error("Renewal invoice email failed", e);
        }

        return invoice;
    });
};

/**
 * Process Renewals (Domains & Services) for a Paid Invoice
 */
export const processInvoiceRenewals = async (invoiceId: number, tx?: Prisma.TransactionClient) => {
    console.log(`[PROCESS RENEWALS] Checking invoice #${invoiceId} for renewals/activations...`);
    const dbClient = tx || prisma;

    const itemsWithRenewals = await dbClient.invoiceItem.findMany({
        where: {
            invoiceId: invoiceId,
            OR: [
                { domainId: { not: null } },
                { serviceId: { not: null } }
            ]
        }
    });

    for (const item of itemsWithRenewals) {
        if (!item.metadata) continue;

        try {
            const meta = JSON.parse(item.metadata);
            const period = meta.period || 1;

            if ((meta.type === 'domain_renewal' || meta.type === 'new_domain') && item.domainId) {
                const domain = await dbClient.domain.findUnique({ where: { id: item.domainId } });
                if (domain) {
                    const now = new Date();
                    const currentExpiry = new Date(domain.expiryDate);
                    let newExpiry = new Date();

                    if (meta.type === 'new_domain') {
                        newExpiry = new Date();
                        newExpiry.setFullYear(now.getFullYear() + period);
                    } else if (currentExpiry < now) {
                        newExpiry.setFullYear(now.getFullYear() + period);
                    } else {
                        newExpiry = new Date(currentExpiry);
                        newExpiry.setFullYear(newExpiry.getFullYear() + period);
                    }

                    await dbClient.domain.update({
                        where: { id: domain.id },
                        data: { expiryDate: newExpiry, status: 'ACTIVE' }
                    });
                    console.log(`[ACTIVATION/RENEWAL] Domain ${domain.domainName} activated/extended to ${newExpiry.toISOString()}`);
                }
            } else if ((meta.type === 'service_renewal' || meta.type === 'new_service') && item.serviceId) {
                const service = await dbClient.service.findUnique({ where: { id: item.serviceId } });
                if (service) {
                    const now = new Date();
                    const currentDue = service.nextDueDate ? new Date(service.nextDueDate) : new Date();
                    let newDue = new Date();
                    const cycle = service.billingCycle?.toLowerCase();

                    if (meta.type === 'new_service') {
                        newDue = new Date();
                    } else {
                        newDue = (currentDue < now) ? new Date(now) : new Date(currentDue);
                    }

                    if (cycle === 'monthly') newDue.setMonth(newDue.getMonth() + 1 * period);
                    else if (cycle === 'quarterly') newDue.setMonth(newDue.getMonth() + 3 * period);
                    else if (cycle === 'semi-annually') newDue.setMonth(newDue.getMonth() + 6 * period);
                    else if (cycle === 'annually') newDue.setFullYear(newDue.getFullYear() + 1 * period);
                    else if (cycle === 'biennial') newDue.setFullYear(newDue.getFullYear() + 2 * period);
                    else if (cycle === 'triennial') newDue.setFullYear(newDue.getFullYear() + 3 * period);
                    else newDue.setMonth(newDue.getMonth() + 1 * period);

                    await dbClient.service.update({
                        where: { id: service.id },
                        data: { nextDueDate: newDue, status: 'ACTIVE' as any }
                    });
                    console.log(`[ACTIVATION/RENEWAL] Service #${service.id} activated/extended to ${newDue.toISOString()}`);
                }
            }
        } catch (e) {
            console.error("[RENEWAL ERROR] Failed to process renewal for item", item.id, e);
        }
    }
};

/**
 * Create a consolidated renewal invoice for multiple services and domains
 * UPDATED: Now supports auto-merging with existing UNPAID invoices
 */
export const createConsolidatedRenewalInvoice = async (clientId: number, items: { type: 'SERVICE' | 'DOMAIN', itemId: number, period?: number }[]) => {
    return await prisma.$transaction(async (tx) => {
        const client = await tx.client.findUnique({
            where: { id: clientId },
            include: { group: true, user: true }
        });

        if (!client) throw new AppError('Client not found', 404);

        // 1. Check for an existing UNPAID renewal-type invoice to merge with
        // 1. Find the oldest UNPAID renewal-type invoice to serve as our "Renewal Hub"
        const existingInvoice = await tx.invoice.findFirst({
            where: {
                clientId,
                status: InvoiceStatus.UNPAID,
                isDeleted: false,
                orderId: null
            },
            include: { items: true, client: { include: { user: true } } },
            orderBy: { id: 'asc' }
        });

        const lineItems: any[] = [];
        let newSubtotal = new Prisma.Decimal(0);
        let latestExpiryDate: Date | null = null;

        for (const item of items) {
            const period = item.period || 1;
            let description: string = "";
            let price = new Prisma.Decimal(0);
            let serviceId: number | undefined;
            let domainId: number | undefined;
            let metadata: string | undefined;

            if (item.type === 'SERVICE') {
                const service = await tx.service.findUnique({
                    where: { id: item.itemId },
                    include: { product: true }
                });

                if (!service || service.clientId !== clientId) continue;

                // Check if this item is ALREADY on our chosen hub
                if (existingInvoice && existingInvoice.items.some(i => i.serviceId === service.id)) continue;

                // Check if it's on ANOTHER unpaid invoice that we might want to consolidate
                const existingOther = await tx.invoice.findFirst({
                    where: {
                        clientId,
                        status: InvoiceStatus.UNPAID,
                        isDeleted: false,
                        items: { some: { serviceId: service.id } }
                    }
                });

                if (existingOther && existingOther.id !== existingInvoice?.id) {
                    if (existingOther.orderId === null) {
                        // Mark the "other" fragment for consolidation (merging it into hub)
                        await tx.invoice.update({
                            where: { id: existingOther.id },
                            data: { isDeleted: true, adminNotes: `Consolidated into Hub Invoice #${existingInvoice?.invoiceNumber || 'new'}` }
                        });
                        // Allow to fall through to add the item here
                    } else {
                        // Linked to a special Order, don't duplicate or devour
                        continue;
                    }
                }

                const unitPrice = service.amount;
                price = unitPrice.mul(period);
                const cycleSuffix = service.billingCycle?.toLowerCase() === 'annually' ? 'Year' : 'Month';
                description = `Renewal - ${service.product.name} (${period} ${cycleSuffix}${period > 1 ? 's' : ''}) (${service.domain || 'no domain'})`;
                serviceId = service.id;
                metadata = JSON.stringify({ type: 'service_renewal', period });

                if (service.nextDueDate && (!latestExpiryDate || service.nextDueDate > latestExpiryDate)) {
                    latestExpiryDate = service.nextDueDate;
                }
            } else {
                const domain = await tx.domain.findUnique({
                    where: { id: item.itemId }
                });

                if (!domain || domain.clientId !== clientId) continue;

                // Check if this item is ALREADY on our chosen hub
                if (existingInvoice && existingInvoice.items.some(i => i.domainId === domain.id)) continue;

                // Check if it's on ANOTHER unpaid invoice
                const existingOther = await tx.invoice.findFirst({
                    where: {
                        clientId,
                        status: InvoiceStatus.UNPAID,
                        isDeleted: false,
                        items: { some: { domainId: domain.id } }
                    }
                });

                if (existingOther && existingOther.id !== existingInvoice?.id) {
                    if (existingOther.orderId === null) {
                        await tx.invoice.update({
                            where: { id: existingOther.id },
                            data: { isDeleted: true, adminNotes: `Consolidated into Hub Invoice #${existingInvoice?.invoiceNumber || 'new'}` }
                        });
                    } else {
                        continue;
                    }
                }

                const parts = domain.domainName.split('.');
                const tldVariations = [
                    `.${parts.slice(-2).join('.')}`,
                    parts.slice(-2).join('.'),
                    `.${parts[parts.length - 1]}`,
                    parts[parts.length - 1]
                ];

                const possibleTLDs = await tx.domainTLD.findMany({
                    where: { tld: { in: tldVariations } }
                });

                const matchedTLD = possibleTLDs.sort((a, b) => b.tld.length - a.tld.length)[0];
                const unitPrice = matchedTLD?.renewalPrice || new Prisma.Decimal(15.00);
                price = unitPrice.mul(period);
                description = `Renewal - Domain: ${domain.domainName} (${period} Year${period > 1 ? 's' : ''})`;
                domainId = domain.id;
                metadata = JSON.stringify({ type: 'domain_renewal', period });

                if (domain.expiryDate && (!latestExpiryDate || domain.expiryDate > latestExpiryDate)) {
                    latestExpiryDate = domain.expiryDate;
                }
            }

            if (price.greaterThan(0)) {
                lineItems.push({
                    description,
                    quantity: 1,
                    unitPrice: price,
                    totalAmount: price,
                    serviceId: serviceId || null,
                    domainId: domainId || null,
                    metadata: metadata || null
                });
                newSubtotal = newSubtotal.add(price);
            }
        }

        if (lineItems.length === 0) return existingInvoice || null;

        let finalInvoice;

        if (existingInvoice) {
            // 2. MERGE: Append to existing invoice
            await tx.invoiceItem.createMany({
                data: lineItems.map(li => ({ ...li, invoiceId: existingInvoice.id }))
            });

            // Recalculate totals mathematically (Safer and Faster)
            const subtotal = existingInvoice.subtotal.add(newSubtotal);
            const currentTaxRate = await settingsService.getTaxRate();
            const taxAmount = client.group?.taxExempt ? new Prisma.Decimal(0) : subtotal.mul(currentTaxRate);
            const totalAmount = subtotal.add(taxAmount);

            // EXTENSION LOGIC: Update Due Date if new items expire later (giving client more time for the bundle)
            const finalDueDate = latestExpiryDate && latestExpiryDate > existingInvoice.dueDate ? latestExpiryDate : existingInvoice.dueDate;

            finalInvoice = await tx.invoice.update({
                where: { id: existingInvoice.id },
                data: { subtotal, taxAmount, totalAmount, dueDate: finalDueDate },
                include: { items: true, client: { include: { user: true } } }
            });

            console.log(`[MERGE] Appended ${lineItems.length} items to existing Invoice #${finalInvoice.invoiceNumber}. New Total: ${totalAmount}`);
        } else {
            // 3. CREATE NEW: Standard flow
            const currentTaxRate = await settingsService.getTaxRate();
            const taxAmount = client.group?.taxExempt ? new Prisma.Decimal(0) : newSubtotal.mul(currentTaxRate);
            const totalAmount = newSubtotal.add(taxAmount);
            const finalDueDate = latestExpiryDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

            finalInvoice = await tx.invoice.create({
                data: {
                    invoiceNumber: generateInvoiceNumber(),
                    clientId: clientId,
                    dueDate: finalDueDate,
                    subtotal: newSubtotal,
                    taxAmount,
                    totalAmount,
                    status: InvoiceStatus.UNPAID,
                    items: { create: lineItems }
                },
                include: { items: true, client: { include: { user: true } } }
            });
        }

        // Send Email (New or Updated)
        try {
            const appName = await settingsService.getSetting('appName', 'WHMCS CRM');
            const taxName = await settingsService.getSetting('taxName', 'Tax');
            const currencySymbol = await settingsService.getCurrencySymbol();
            const pdfBuffer = await generateInvoicePDF(finalInvoice, appName, taxName, currencySymbol);
            const { subject, body } = EmailTemplates.invoiceCreated(
                finalInvoice.invoiceNumber,
                finalInvoice.dueDate.toLocaleDateString(),
                finalInvoice.totalAmount.toString()
            );

            // Tweak email content to reflect ALL renewals in the bundle
            const allItems = finalInvoice.items.map((i: any) => `• ${i.description}`).join('\n');
            const finalSubject = existingInvoice ? `Consolidated Renewal Invoice Updated: #${finalInvoice.invoiceNumber}` : subject;
            const finalBody = `Dear ${finalInvoice.client.user.firstName},\n\nWe have updated your account with a consolidated renewal invoice covering your upcoming services.\n\nIncluded renewals:\n${allItems}\n\nInvoice: #${finalInvoice.invoiceNumber}\nTotal: ${finalInvoice.totalAmount}\nDue Date: ${finalInvoice.dueDate.toLocaleDateString()}\n\nPlease login to your client area to manage your renewals.\n\nRegards,\nThe Billing Team`;

            await sendEmail(finalInvoice.client.user.email, finalSubject, finalBody, [
                { filename: `Invoice-${finalInvoice.invoiceNumber}.pdf`, content: pdfBuffer }
            ]);
        } catch (e) {
            console.error("Renewal invoice email failed", e);
        }

        return finalInvoice;
    });
};
