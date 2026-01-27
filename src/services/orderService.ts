import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { calculateProductPrice, BillingCycle } from './pricingService';
import { checkOrderFraud } from './fraudService';
import { OrderStatus, UserType, Prisma, ServiceStatus } from '@prisma/client';
import * as invoiceService from './invoiceService';
import { ProvisioningService } from './provisioningService';
import { sendEmail, EmailTemplates } from './email.service';
import { generateInvoicePDF } from './pdfService';
import * as notificationService from './notificationService';
import { MarketingService } from './marketingService';
import { ResellerService } from './resellerService';

const formatPrice = (amount: any) => `${parseFloat(amount).toFixed(2)}`;

export interface OrderItemInput {
    productId: number;
    billingCycle: string;
    quantity: number;
    domainName?: string;
    configOptions?: any;
}

export interface CreateOrderInput {
    clientId: number;
    paymentMethod?: string;
    promoCode?: string;
    notes?: string;
    items: OrderItemInput[];
    resellerId?: number;
}

/**
 * Generate a unique order number
 * Format: ORD-YYYYMMDD-XXXX (where XXXX is random)
 */
const generateOrderNumber = () => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(1000 + Math.random() * 9000);
    return `ORD-${date}-${random}`;
};

/**
 * Create a new order with multiple items
 */
export const createOrder = async (input: CreateOrderInput) => {
    const { clientId, paymentMethod, promoCode, notes, items, resellerId } = input;

    // 1. Fetch Client and profile details
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        include: { group: true, user: true },
    });

    if (!client) {
        throw new AppError('Client not found', 404);
    }

    // 4. Calculate totals and prepare order items
    let orderTotal = new Prisma.Decimal(0);
    const preparedItems: any[] = [];

    // Effective Reseller ID for pricing calculations - prioritize explicit input, fallback to client's assigned reseller
    const effectiveResellerId = resellerId ? parseInt(resellerId.toString()) : client.resellerId;

    // Fetch Reseller details for global markup calculations
    let reseller = null;
    if (effectiveResellerId) {
        reseller = await prisma.user.findUnique({
            where: { id: effectiveResellerId }
        });
        if (reseller) {
            console.log(`[DEBUG] Reseller context found: ${reseller.id} (Brand: ${reseller.username})`);
        }
    }

    // 3. Validate Promo Code if provided
    let promotion = null;
    if (promoCode) {
        promotion = await prisma.promotion.findUnique({
            where: { code: promoCode },
        });

        if (!promotion) {
            throw new AppError('Invalid promotion code', 400);
        }

        const now = new Date();
        if (promotion.validFrom > now || (promotion.validUntil && promotion.validUntil < now)) {
            throw new AppError('Promotion code has expired', 400);
        }

        if (promotion.usageLimit && promotion.usedCount >= promotion.usageLimit) {
            throw new AppError('Promotion code usage limit reached', 400);
        }
    }

    for (const item of items) {
        const product = await prisma.product.findUnique({
            where: { id: item.productId },
            include: {
                resellerProducts: effectiveResellerId ? { where: { resellerId: effectiveResellerId } } : false,
            },
        });

        if (!product) {
            throw new AppError(`Product with ID ${item.productId} not found`, 404);
        }

        let resellerOverride = product.resellerProducts?.[0];

        // Global Markup Fallback
        if (!resellerOverride && reseller?.markupRate) {
            console.log(`[DEBUG] Applying global markup ${reseller.markupRate}% for reseller ${effectiveResellerId}`);
            resellerOverride = {
                markupPercentage: reseller.markupRate,
                customPrice: null,
            } as any;
        }

        console.log(`[DEBUG] Order Item Resolve - Product: ${product.name}, EffectiveResellerID: ${effectiveResellerId}, OverrideFound: ${!!resellerOverride}`);
        if (resellerOverride) {
            console.log(`[DEBUG] Override Details - CustomPrice: ${resellerOverride.customPrice}, Markup%: ${resellerOverride.markupPercentage}`);
        }

        const pricing = calculateProductPrice(
            product,
            item.billingCycle as BillingCycle,
            resellerOverride as any,
            client.group as any
        );

        console.log(`[DEBUG] Final Pricing Calc - Base: ${pricing.basePrice}, Cycle: ${pricing.cycle}, Final: ${pricing.finalPrice}`);

        let itemTotal = pricing.finalPrice.mul(item.quantity).add(pricing.setupFee);

        // Apply promotion to item if applicable
        if (promotion) {
            let isApplicable = true;
            if (promotion.applicableProducts) {
                try {
                    const applicableProducts = typeof promotion.applicableProducts === 'string'
                        ? JSON.parse(promotion.applicableProducts)
                        : promotion.applicableProducts;

                    if (Array.isArray(applicableProducts)) {
                        isApplicable = applicableProducts.includes(product.id);
                    }
                } catch (e) {
                    console.error("Failed to parse applicableProducts for promotion:", promotion.id, e);
                    // If parsing fails, we assume it's NOT applicable to be safe, or just allow it?
                    // Let's assume it's NOT applicable if the restriction is malformed.
                    isApplicable = false;
                }
            }

            if (isApplicable) {
                console.log(`[DEBUG] Applying promotion ${promotion.code} to item ${product.id}`);
                if (promotion.type === 'percentage') {
                    const discount = new Prisma.Decimal(promotion.value.toString()).div(100);
                    itemTotal = itemTotal.mul(new Prisma.Decimal(1).sub(discount));
                } else if (promotion.type === 'fixed') {
                    itemTotal = itemTotal.sub(new Prisma.Decimal(promotion.value.toString()));
                }
            }
        }

        if (itemTotal.lessThan(0)) itemTotal = new Prisma.Decimal(0);

        preparedItems.push({
            productId: product.id,
            domainName: item.domainName,
            billingCycle: (item.billingCycle || 'MONTHLY').toUpperCase(),
            quantity: item.quantity,
            unitPrice: pricing.finalPrice,
            setupFee: pricing.setupFee,
            totalPrice: itemTotal,
            configOptions: item.configOptions ? JSON.stringify(item.configOptions) : null,
        });

        orderTotal = orderTotal.add(itemTotal);
    }

    // 4. Perform Fraud Check
    const fraudResult = await checkOrderFraud({
        orderNumber: generateOrderNumber(),
        email: client.user.email,
        clientId: client.id,
        totalAmount: orderTotal,
    });

    // 5. Create Order in transaction
    const order = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const newOrder = await tx.order.create({
            data: {
                orderNumber: generateOrderNumber(),
                clientId,
                status: fraudResult.isFraud ? OrderStatus.FRAUD : OrderStatus.PENDING,
                paymentMethod,
                totalAmount: orderTotal,
                promoCode,
                notes,
                fraudCheckData: JSON.stringify(fraudResult),
                resellerId: resellerId || client.resellerId,
                isResellerOrder: !!resellerId || !!client.resellerId,
                items: {
                    create: preparedItems,
                },
            },
            include: {
                items: true,
            },
        });


        // Increment promo usage if applicable
        if (promotion) {
            await tx.promotion.update({
                where: { id: promotion.id },
                data: { usedCount: { increment: 1 } },
            });
        }

        // Record initial status history
        await tx.orderStatusHistory.create({
            data: {
                orderId: newOrder.id,
                oldStatus: 'NONE',
                newStatus: OrderStatus.PENDING,
                changedBy: client.user.email,
                changeReason: 'Order created',
            },
        });

        return newOrder;
    });

    // 6. Post-Order Processing (Email, Invoice, Notifications)
    // We wrap this in a try-catch so the order creation itself isn't rolled back or failed if a notification fails
    try {
        // Create PENDING services
        for (const item of order.items) {
            const product = await prisma.product.findUnique({
                where: { id: item.productId }
            });

            if (product && product.productType !== 'DOMAIN') {
                await prisma.service.create({
                    data: {
                        clientId: order.clientId,
                        productId: item.productId,
                        orderId: order.id,
                        domain: item.domainName,
                        billingCycle: item.billingCycle,
                        amount: item.totalPrice,
                        status: ServiceStatus.PENDING,
                        nextDueDate: new Date(),
                    }
                });
            }
        }

        // Send Order Confirmation
        const { subject, body } = EmailTemplates.orderConfirmation(order.orderNumber, order.totalAmount.toString());
        sendEmail(client.user.email, subject, body).catch(e => console.error("Email notification failed:", e));

        // Notify Admins
        try {
            const admins = await prisma.user.findMany({
                where: { userType: { in: [UserType.ADMIN, UserType.SUPER_ADMIN] }, status: 'ACTIVE' },
                select: { email: true }
            });

            const adminNotification = EmailTemplates.adminTransitionNotification(
                'New Order Received',
                `Order: #${order.orderNumber}\nClient: ${client.user.firstName} ${client.user.lastName}\nTotal: ${order.totalAmount}\nItems: ${order.items.length}`
            );

            for (const admin of admins) {
                if (admin.email) {
                    try {
                        await sendEmail(admin.email, adminNotification.subject, adminNotification.body);
                    } catch (sendErr) {
                        console.error(`Failed to send order notification to admin ${admin.email}:`, sendErr);
                    }
                }
            }
        } catch (adminEmailError) {
            console.error('Failed to send admin order notification:', adminEmailError);
        }

        // Create Invoice
        if (order.status === OrderStatus.PENDING) {
            await invoiceService.createInvoiceFromOrder(order.id);
        }

        // Broadcast to admins
        await notificationService.broadcastToAdmins(
            'INFO',
            `New Order #${order.orderNumber}`,
            `New order placed by ${client.user.firstName || client.companyName} (${formatPrice(order.totalAmount)})`,
            `/admin/orders/${order.id}`
        );
    } catch (postError) {
        console.error("Critical error in post-order processing:", postError);
        // We don't re-throw here because the order IS created in the DB at this point (outside transaction)
        // If we throw here, the user gets a 500 but their order is actually there.
    }

    return order;
};

/**
 * Update order status with history tracking
 */
export const updateOrderStatus = async (orderId: number, newStatus: OrderStatus, changedBy: string, reason?: string, requireTransaction: boolean = false) => {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true, client: { include: { user: true } } }
    });

    if (!order) {
        throw new AppError('Order not found', 404);
    }

    if (newStatus === OrderStatus.COMPLETED && requireTransaction) {
        // Find if any invoice for this order is PAID and has a SUCCESS transaction
        const invoices = await prisma.invoice.findMany({
            where: { orderId, status: 'PAID' },
            include: { transactions: { where: { status: 'SUCCESS' } } }
        });

        const hasValidPayment = invoices.some(inv => inv.transactions.length > 0);

        if (!hasValidPayment) {
            throw new AppError('Cannot approve order: No verified successful transaction found for this order. Please approve the transaction in Billing first.', 400);
        }
    }

    if (order.status === newStatus) return order;

    const updatedOrder = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const updated = await tx.order.update({
            where: { id: orderId },
            data: { status: newStatus },
            include: { items: { include: { product: true } } }
        });

        await tx.orderStatusHistory.create({
            data: {
                orderId,
                oldStatus: order.status,
                newStatus,
                changedBy,
                changeReason: reason || `Status changed to ${newStatus}`,
            },
        });

        if (newStatus === OrderStatus.COMPLETED) {
            // award commission if referred
            await MarketingService.awardCommission(orderId, tx);

            // handle reseller commission
            await ResellerService.handleOrderCommission(orderId, tx);
        }

        return updated;
    });

    // Notify Client of Status Change
    try {
        if (order.client.user.id) {
            let title = `Order Status Updated`;
            let msg = `Order #${order.orderNumber} is now ${newStatus}`;
            let type: any = 'INFO';

            if (newStatus === OrderStatus.COMPLETED) {
                title = `Order Activation Complete`;
                msg = `Order #${order.orderNumber} has been fully processed and services are active.`;
                type = 'SUCCESS';
            } else if (newStatus === OrderStatus.CANCELLED) {
                type = 'ERROR';
            }

            await notificationService.createNotification(
                order.client.user.id,
                type,
                title,
                msg,
                `/client/services`
            );
        }
    } catch (e) {
        console.error("Failed to send order status notification", e);
    }

    // Side Effects for Order Completion
    if (newStatus === OrderStatus.COMPLETED && order.status !== OrderStatus.COMPLETED) {
        console.log(`[ORDER COMPLETION] Starting completion for Order #${orderId}`);
        try {
            // Check if invoice already exists (usually created at order time)
            const existingInvoice = await prisma.invoice.findFirst({ where: { orderId } });
            if (!existingInvoice) {
                console.log(`[ORDER COMPLETION] Creating invoice for Order #${orderId}`);
                await invoiceService.createInvoiceFromOrder(orderId);
            }

            console.log(`[ORDER COMPLETION] Processing ${updatedOrder.items?.length || 0} items`);

            if (updatedOrder.items) {
                for (const item of updatedOrder.items) {
                    const product = (item as any).product;
                    const productType = product?.productType;

                    console.log(`[ORDER COMPLETION] Item ${item.id}: Product Type = ${productType}, Domain = ${item.domainName}`);

                    if (productType === 'DOMAIN' && item.domainName) {
                        console.log(`[ORDER COMPLETION] Processing DOMAIN item: ${item.domainName}`);

                        const existingDomain = await prisma.domain.findFirst({
                            where: {
                                domainName: item.domainName,
                                clientId: order.clientId
                            }
                        });

                        if (existingDomain) {
                            console.log(`[ORDER COMPLETION] Domain ${item.domainName} already exists, skipping`);
                        } else {
                            console.log(`[ORDER COMPLETION] Creating new domain: ${item.domainName}`);

                            // Calculate period based on billing cycle
                            let period = 1; // default to 1 year
                            const cycle = item.billingCycle?.toUpperCase();

                            if (cycle === 'BIENNIALLY' || cycle === 'BIENNIAL') {
                                period = 2;
                            } else if (cycle === 'TRIENNIALLY' || cycle === 'TRIENNIAL') {
                                period = 3;
                            } else if (cycle === 'MONTHLY') {
                                period = 1; // For monthly domains, still use 1 year expiry
                            }

                            console.log(`[ORDER COMPLETION] Billing cycle: ${cycle}, Period: ${period} years`);

                            const expiryDate = new Date();
                            expiryDate.setFullYear(expiryDate.getFullYear() + period);

                            const newDomain = await prisma.domain.create({
                                data: {
                                    clientId: order.clientId,
                                    domainName: item.domainName,
                                    expiryDate: expiryDate,
                                    registrar: 'Manual Order',
                                    status: 'ACTIVE',
                                    autoRenew: true
                                }
                            });

                            console.log(`[ORDER COMPLETION] Domain created successfully: ID ${newDomain.id}, Name: ${newDomain.domainName}`);

                            // Send Domain Registration Email
                            try {
                                const { subject, body } = EmailTemplates.domainRegistered(item.domainName, expiryDate.toLocaleDateString());
                                await sendEmail(order.client.user.email, subject, body);
                                console.log(`[ORDER COMPLETION] Domain registration email sent for ${item.domainName}`);
                            } catch (emailError) {
                                console.error(`[ORDER COMPLETION] Failed to send domain email for ${item.domainName}:`, emailError);
                            }
                        }
                    } else if (productType !== 'DOMAIN') {
                        console.log(`[ORDER COMPLETION] Processing SERVICE item: Product ${item.productId}`);

                        // Check for existing pending service created at order time
                        const existingService = await prisma.service.findFirst({
                            where: {
                                orderId: orderId,
                                productId: item.productId,
                                domain: item.domainName || undefined
                            }
                        });

                        if (existingService) {
                            console.log(`[ORDER COMPLETION] Found existing service ID ${existingService.id}, status: ${existingService.status}`);
                            if (existingService.status === ServiceStatus.PENDING) {
                                console.log(`[ORDER COMPLETION] Activating service ID ${existingService.id}`);
                                await ProvisioningService.activateService(existingService.id);
                                console.log(`[ORDER COMPLETION] Service ID ${existingService.id} activated successfully`);
                            }
                        } else {
                            console.log(`[ORDER COMPLETION] No existing service found, creating new one`);
                            // If for some reason it wasn't created, create and activate now
                            const service = await prisma.service.create({
                                data: {
                                    clientId: order.clientId,
                                    productId: item.productId,
                                    orderId: orderId,
                                    domain: item.domainName,
                                    billingCycle: item.billingCycle,
                                    amount: item.totalPrice,
                                    status: ServiceStatus.PENDING,
                                    nextDueDate: new Date(),
                                }
                            });
                            console.log(`[ORDER COMPLETION] Service created: ID ${service.id}`);
                            await ProvisioningService.activateService(service.id);
                            console.log(`[ORDER COMPLETION] Service ID ${service.id} activated successfully`);
                        }
                    } else {
                        console.log(`[ORDER COMPLETION] Skipping item - no valid product type or domain name`);
                    }
                }
            }

            console.log(`[ORDER COMPLETION] All items processed successfully for Order #${orderId}`);
            if (updatedOrder.items) {
                // ... (existing service creation logic)
            }

            // Send Completion Email with Paid Invoice PDF
            try {
                const paidInvoice = await prisma.invoice.findFirst({
                    where: { orderId: orderId, status: 'PAID' },
                    include: {
                        items: true,
                        client: { include: { user: true } }
                    }
                });

                let attachments = [];
                if (paidInvoice) {
                    const pdfBuffer = await generateInvoicePDF(paidInvoice);
                    attachments.push({
                        filename: `Paid_Invoice-${paidInvoice.invoiceNumber}.pdf`,
                        content: pdfBuffer
                    });
                }

                const { subject, body } = EmailTemplates.orderCompleted(order.orderNumber);

                await sendEmail(
                    order.client.user.email,
                    subject,
                    body,
                    attachments
                );

                // Notify Admins
                const admins = await prisma.user.findMany({
                    where: { userType: { in: [UserType.ADMIN, UserType.SUPER_ADMIN] }, status: 'ACTIVE' },
                    select: { email: true }
                });

                const adminNotification = EmailTemplates.adminTransitionNotification(
                    'Order Activation Complete',
                    `Order #${order.orderNumber} has been fully activated.\nClient: ${order.client.user.firstName} ${order.client.user.lastName}`
                );

                for (const admin of admins) {
                    if (admin.email) {
                        try {
                            await sendEmail(admin.email, adminNotification.subject, adminNotification.body);
                        } catch (sendErr) {
                            console.error(`Failed to send completion notification to admin ${admin.email}:`, sendErr);
                        }
                    }
                }
            } catch (e) {
                console.error("Delayed completion email failed:", e);
            }

        } catch (err) {
            console.error("Failed to execute order completion side effects:", err);
        }
    }

    return updatedOrder;
};
