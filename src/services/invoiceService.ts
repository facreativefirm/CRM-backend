import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { InvoiceStatus, OrderStatus, Prisma } from '@prisma/client';
import { MarketingService } from './marketingService';
import { ResellerService } from './resellerService';
import { sendEmail, EmailTemplates } from './email.service';
import { generateInvoicePDF } from './pdfService';

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
export const createInvoiceFromOrder = async (orderId: number) => {
    const order = await prisma.order.findUnique({
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
    const invoiceItems = order.items.map((item: any) => {
        subtotal = subtotal.add(item.totalPrice);
        const productName = item.product?.name || `Product #${item.productId}`;

        return {
            description: `${productName} (ID: ${item.productId}) - ${item.billingCycle} ${item.domainName ? `(${item.domainName})` : ''}`,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalAmount: item.totalPrice,
            serviceId: undefined // Will need to link this if service exists
        };
    });

    const taxAmount = order.client.group?.taxExempt ? new Prisma.Decimal(0) : subtotal.mul(0.05); // 5% default tax
    const totalAmount = subtotal.add(taxAmount);

    const invoice = await prisma.invoice.create({
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
    const fullInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
        include: {
            items: true,
            client: { include: { user: true } }
        }
    });

    // 4. Send Email with PDF Attachment
    try {
        const pdfBuffer = await generateInvoicePDF(fullInvoice);
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

    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {

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

        // 3. ATOMIC ORDER ACTIVATION: If Order exists and fully paid, process it immediately
        if (updatedInvoice.orderId && newStatus === InvoiceStatus.PAID) {
            console.log(`[ATOMIC ACTIVATION] Invoice #${updatedInvoice.invoiceNumber} paid. Activating Order #${updatedInvoice.orderId}`);

            // Fetch order with items to process
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

                // Process each item effectively
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
                            console.log(`[ATOMIC ACTIVATION] Domain created: ${item.domainName}`);
                        }
                    } else if (productType !== 'DOMAIN') {
                        // Activate or Create Service
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
                console.log(`[ATOMIC ACTIVATION] Order #${order.id} fully processed and services activated.`);
            }
        }

        // 4. ATOMIC RENEWALS: Process Invoice Items that are domain or service renewals
        if (newStatus === InvoiceStatus.PAID) {
            const renewalItems = await tx.invoiceItem.findMany({
                where: {
                    invoiceId: updatedInvoice.id,
                    OR: [
                        { domainId: { not: null } },
                        { serviceId: { not: null } }
                    ]
                }
            });

            for (const item of renewalItems) {
                if (item.metadata) {
                    try {
                        const meta = JSON.parse(item.metadata);
                        const period = meta.period || 1;

                        if (meta.type === 'domain_renewal' && item.domainId) {
                            const domain = await tx.domain.findUnique({ where: { id: item.domainId } });
                            if (domain) {
                                const now = new Date();
                                const currentExpiry = new Date(domain.expiryDate);
                                let newExpiry = new Date();

                                if (currentExpiry < now) {
                                    newExpiry.setFullYear(now.getFullYear() + period);
                                } else {
                                    newExpiry = new Date(currentExpiry);
                                    newExpiry.setFullYear(newExpiry.getFullYear() + period);
                                }

                                await tx.domain.update({
                                    where: { id: domain.id },
                                    data: { expiryDate: newExpiry, status: 'ACTIVE' }
                                });
                                console.log(`[ATOMIC RENEWAL] Domain ${domain.domainName} extended to ${newExpiry.toISOString()}`);
                            }
                        } else if (meta.type === 'service_renewal' && item.serviceId) {
                            const service = await tx.service.findUnique({ where: { id: item.serviceId } });
                            if (service) {
                                const now = new Date();
                                const currentDue = service.nextDueDate ? new Date(service.nextDueDate) : new Date();
                                let newDue = new Date();

                                const cycle = service.billingCycle?.toLowerCase();
                                const isAnnual = cycle === 'annually';

                                if (currentDue < now) {
                                    newDue = new Date(now);
                                } else {
                                    newDue = new Date(currentDue);
                                }

                                if (isAnnual) {
                                    newDue.setFullYear(newDue.getFullYear() + period);
                                } else {
                                    newDue.setMonth(newDue.getMonth() + period);
                                }

                                await tx.service.update({
                                    where: { id: service.id },
                                    data: { nextDueDate: newDue, status: 'ACTIVE' as any }
                                });
                                console.log(`[ATOMIC RENEWAL] Service #${service.id} extended to ${newDue.toISOString()}`);
                            }
                        }
                    } catch (e) {
                        console.error("[ATOMIC RENEWAL] Failed to process renewal", e);
                    }
                }
            }
        }

        // 4. Send Payment Email with PDF
        try {
            const fullInvoice = await tx.invoice.findUnique({
                where: { id: invoiceId },
                include: {
                    items: true,
                    client: { include: { user: true } }
                }
            });

            const pdfBuffer = await generateInvoicePDF(fullInvoice);
            const { subject, body } = EmailTemplates.invoicePaid(updatedInvoice.invoiceNumber);

            await sendEmail(fullInvoice!.client.user.email, subject, body, [
                { filename: `Paid_Invoice-${updatedInvoice.invoiceNumber}.pdf`, content: pdfBuffer }
            ]);
        } catch (e) {
            console.error("Payment confirmation email failed:", e);
        }

        return { updatedInvoice, transaction };
    });
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
export const processInvoiceRenewals = async (invoiceId: number) => {
    console.log(`[PROCESS RENEWALS] Checking invoice #${invoiceId} for renewals...`);

    const itemsWithRenewals = await prisma.invoiceItem.findMany({
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

            if (meta.type === 'domain_renewal' && item.domainId) {
                const domain = await prisma.domain.findUnique({ where: { id: item.domainId } });
                if (domain) {
                    const now = new Date();
                    const currentExpiry = new Date(domain.expiryDate);
                    let newExpiry = new Date();

                    if (currentExpiry < now) {
                        newExpiry.setFullYear(now.getFullYear() + period);
                    } else {
                        newExpiry = new Date(currentExpiry);
                        newExpiry.setFullYear(newExpiry.getFullYear() + period);
                    }

                    await prisma.domain.update({
                        where: { id: domain.id },
                        data: { expiryDate: newExpiry, status: 'ACTIVE' }
                    });
                    console.log(`[RENEWAL] Domain ${domain.domainName} extended to ${newExpiry.toISOString()}`);
                }
            } else if (meta.type === 'service_renewal' && item.serviceId) {
                const service = await prisma.service.findUnique({ where: { id: item.serviceId } });
                if (service) {
                    const now = new Date();
                    const currentDue = service.nextDueDate ? new Date(service.nextDueDate) : new Date();
                    let newDue = new Date();

                    const cycle = service.billingCycle?.toLowerCase();
                    const isAnnual = cycle === 'annually';

                    if (currentDue < now) {
                        newDue = new Date(now);
                    } else {
                        newDue = new Date(currentDue);
                    }

                    if (isAnnual) {
                        newDue.setFullYear(newDue.getFullYear() + period);
                    } else {
                        newDue.setMonth(newDue.getMonth() + period);
                    }

                    await prisma.service.update({
                        where: { id: service.id },
                        data: { nextDueDate: newDue, status: 'ACTIVE' as any }
                    });
                    console.log(`[RENEWAL] Service #${service.id} extended to ${newDue.toISOString()}`);
                }
            }
        } catch (e) {
            console.error("[RENEWAL ERROR] Failed to process renewal for item", item.id, e);
        }
    }
};
