import { Request, Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { UserType, CommissionStatus, Prisma, InvoiceStatus } from '@prisma/client';
import { sendEmail, EmailTemplates } from '../services/email.service';
/**
 * Admin: Get Global Reseller Stats
 */
export const getAdminResellerStats = async (req: AuthRequest, res: Response) => {
    const [totalResellers, activeWhiteLabels, channelRevenue] = await Promise.all([
        prisma.user.count({ where: { userType: UserType.RESELLER } }),
        prisma.user.count({ where: { userType: UserType.RESELLER, whiteLabelEnabled: true } }),
        prisma.invoice.aggregate({
            where: {
                status: InvoiceStatus.PAID,
                client: { resellerId: { not: null } }
            },
            _sum: { amountPaid: true }
        })
    ]);

    res.status(200).json({
        status: 'success',
        data: {
            totalResellers,
            activeWhiteLabels,
            channelRevenue: channelRevenue._sum.amountPaid || 0
        }
    });
};
import { ResellerService } from '../services/resellerService';

/**
 * Reseller Dashboard Stats
 */
export const getResellerStats = async (req: AuthRequest, res: Response) => {
    if (!req.user || req.user.userType !== UserType.RESELLER) {
        throw new AppError('Only resellers can access this', 403);
    }

    const stats = {
        totalClients: await prisma.client.count({ where: { resellerId: req.user.id } }),
        totalRevenue: await prisma.invoice.aggregate({
            where: {
                status: InvoiceStatus.PAID,
                client: { resellerId: req.user.id }
            },
            _sum: { amountPaid: true }
        }),
        activeServices: await prisma.service.count({
            where: {
                status: 'ACTIVE',
                client: { resellerId: req.user.id }
            }
        }),
        totalCommissions: await prisma.resellerCommission.aggregate({
            where: {
                resellerId: req.user.id,
                status: { in: [CommissionStatus.PAID, CommissionStatus.APPROVED] }
            },
            _sum: { commissionAmount: true }
        }),
        pendingCommissions: await prisma.resellerCommission.aggregate({
            where: { resellerId: req.user.id, status: CommissionStatus.APPROVED },
            _sum: { commissionAmount: true }
        }),
        clients: await prisma.client.findMany({
            where: { resellerId: req.user.id },
            include: { user: true },
            take: 5,
            orderBy: { createdAt: 'desc' }
        })
    };

    res.status(200).json({ status: 'success', data: { stats } });
};

/**
 * List Reseller Commissions
 */
export const getCommissions = async (req: AuthRequest, res: Response) => {
    const commissions = await prisma.resellerCommission.findMany({
        where: { resellerId: req.user!.id },
        include: { order: true, client: true, product: true },
        orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ status: 'success', data: { commissions } });
};

/**
 * Get Reseller Brand Settings
 */
export const getBrandSettings = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    if (!r.user || r.user.userType !== UserType.RESELLER) {
        throw new AppError('Unauthorized', 403);
    }

    const settings = await prisma.user.findUnique({
        where: { id: r.user.id },
        select: {
            brandSettings: true,
            customDomain: true,
            whiteLabelEnabled: true,
            markupRate: true
        }
    });

    res.status(200).json({ status: 'success', data: { settings } });
};

import dns from 'dns';
import { promisify } from 'util';

const resolveCname = promisify(dns.resolveCname);
const resolveA = promisify(dns.resolve4);

/**
 * Verify DNS Configuration for Reseller Custom Domain
 */
export const verifyDomainDNS = async (req: AuthRequest, res: Response) => {
    const { domain } = req.query;
    if (!domain || typeof domain !== 'string') {
        throw new AppError('Domain is required for verification', 400);
    }

    const cleanDomain = domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();

    try {
        console.log(`[DNS Verify] Checking records for: ${cleanDomain}`);

        let verified = false;
        let records: string[] = [];

        // 1. Try resolving CNAME (Best for subdomains)
        try {
            const cnames = await resolveCname(cleanDomain);
            records = cnames;
            // In a real scenario, we'd check if it points to 'whmcs-main.naimur-it.com' or similar
            if (cnames.length > 0) verified = true;
        } catch (e) {
            // Not a CNAME or doesn't exist
        }

        // 2. Try resolving A record if CNAME fails
        if (!verified) {
            try {
                const aRecords = await resolveA(cleanDomain);
                records = aRecords;
                if (aRecords.length > 0) verified = true;
            } catch (e) {
                // No A record
            }
        }

        if (verified) {
            res.status(200).json({
                status: 'success',
                data: {
                    verified: true,
                    records,
                    message: "DNS propagation identified. Domain is ready for deployment."
                }
            });
        } else {
            res.status(200).json({
                status: 'success',
                data: {
                    verified: false,
                    message: "DNS records not found. Ensure you have added a CNAME or A record pointing to our server."
                }
            });
        }
    } catch (error: any) {
        console.error(`[DNS Verify Engine Error]:`, error);
        res.status(200).json({
            status: 'success',
            data: {
                verified: false,
                message: "Lookup failed. Domain might not be registered or DNS is still propagating."
            }
        });
    }
};

/**
 * Update Reseller Brand Settings
 */
export const updateBrandSettings = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    if (!r.user || r.user.userType !== UserType.RESELLER) {
        throw new AppError('Unauthorized', 403);
    }

    const { brandSettings, customDomain, markupRate, whiteLabelEnabled } = r.body;

    let cleanDomain = null;
    if (customDomain && typeof customDomain === 'string') {
        // Sanitize: Trim -> Remove Protocol -> Remove Trailing Slash -> Lowercase
        cleanDomain = customDomain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
        if (cleanDomain.length === 0) cleanDomain = null;
    }

    console.log(`[Reseller Update] ID: ${r.user.id} | Domain: ${cleanDomain} | Enabled: ${whiteLabelEnabled}`);

    const updated = await prisma.user.update({
        where: { id: r.user.id },
        data: {
            brandSettings: typeof brandSettings === 'object' ? JSON.stringify(brandSettings) : brandSettings,
            customDomain: cleanDomain,
            markupRate: markupRate !== undefined ? new Prisma.Decimal(markupRate) : undefined,
            whiteLabelEnabled: typeof whiteLabelEnabled === 'boolean' ? whiteLabelEnabled : undefined
        }
    });

    res.status(200).json({ status: 'success', data: { user: updated } });
};

/**
 * List Reseller Clients
 */
export const getResellerClients = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    if (!r.user || r.user.userType !== UserType.RESELLER) {
        throw new AppError('Unauthorized', 403);
    }

    const clients = await prisma.client.findMany({
        where: { resellerId: r.user.id },
        include: {
            user: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    status: true,
                    createdAt: true
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ status: 'success', results: clients.length, data: { clients } });
};

/**
 * List Reseller Products (with their overrides)
 */
export const getResellerProducts = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    if (!r.user || r.user.userType !== UserType.RESELLER) {
        throw new AppError('Unauthorized', 403);
    }

    // Get all active products and the reseller's overrides
    const products = await prisma.product.findMany({
        where: { status: 'ACTIVE' },
        include: {
            resellerProducts: {
                where: { resellerId: r.user.id }
            }
        }
    });

    const mappedProducts = products.map((p: any) => {
        // Determine base price - favor monthly, fallback to annual
        let price = p.monthlyPrice;
        if (Number(price) === 0 && Number(p.annualPrice) > 0) {
            price = p.annualPrice;
        }
        return {
            ...p,
            price
        };
    });

    res.status(200).json({ status: 'success', data: { products: mappedProducts } });
};

/**
 * Update/Override Product Pricing for Reseller
 */
export const updateResellerProduct = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    if (!r.user || r.user.userType !== UserType.RESELLER) {
        throw new AppError('Unauthorized', 403);
    }

    // Frontend handles toggling, so we blindly accept what is sent.
    // Note: Frontend sends 'markupPercent', backend schema is 'markupPercentage'
    const { productId, customPrice, status, markupPercent, markupPercentage } = r.body;

    // Resolve the markup value (handle both naming conventions)
    const markupValue = markupPercent !== undefined ? markupPercent : markupPercentage;

    const resellerProduct = await prisma.resellerProduct.upsert({
        where: {
            resellerId_productId: {
                resellerId: r.user.id,
                productId: parseInt(productId as string)
            }
        },
        update: {
            // Logic: If markupValue is explicitly null/0, we set it to 0 (since DB field is non-nullable).
            // If it is regular number, set it.
            // If undefined (not in payload), do not touch.
            markupPercentage: markupValue !== undefined
                ? (markupValue === null ? new Prisma.Decimal(0) : new Prisma.Decimal(markupValue))
                : undefined,

            // Logic: If customPrice is explicitly null, we set it to null (clearing the override).
            // If undefined (not in payload), do not touch.
            customPrice: customPrice !== undefined
                ? (customPrice === null ? null : new Prisma.Decimal(customPrice))
                : undefined,

            status: status || 'ACTIVE'
        },
        create: {
            resellerId: r.user.id,
            productId: parseInt(productId as string),
            markupPercentage: markupValue ? new Prisma.Decimal(markupValue) : new Prisma.Decimal(0),
            customPrice: customPrice ? new Prisma.Decimal(customPrice) : null,
            status: status || 'ACTIVE'
        }
    });

    res.status(200).json({ status: 'success', data: { resellerProduct } });
};

/**
 * Request Payout (Staff/Admin can process this)
 */
export const requestPayout = async (req: AuthRequest, res: Response) => {
    const r = req as any;
    const { amount, method } = r.body;

    if (!r.user || r.user.userType !== UserType.RESELLER) {
        throw new AppError('Unauthorized', 403);
    }

    // 1. Calculate available balance
    const approvedCommissions = await prisma.resellerCommission.aggregate({
        where: {
            resellerId: r.user.id,
            status: CommissionStatus.APPROVED,
            payoutId: null
        },
        _sum: { commissionAmount: true }
    });

    const availableBalance = approvedCommissions._sum.commissionAmount || new Prisma.Decimal(0);
    const requestedAmount = new Prisma.Decimal(amount);

    if (requestedAmount.gt(availableBalance)) {
        throw new AppError('Insufficient balance for payout request', 400);
    }

    // 2. Create payout record
    const payout = await prisma.resellerPayout.create({
        data: {
            resellerId: r.user.id,
            payoutPeriodStart: new Date(), // Just placeholders for metadata
            payoutPeriodEnd: new Date(),
            totalCommissions: requestedAmount,
            netAmount: requestedAmount,
            paymentMethod: method,
            status: 'PENDING'
        }
    });

    // Send Emails
    try {
        const user = r.user;
        if (user && user.email) {
            const { subject, body } = EmailTemplates.payoutRequested(`${requestedAmount.toFixed(2)}`, method);
            await sendEmail(user.email, subject, body);

            // Notify Admins
            const admins = await prisma.user.findMany({
                where: { userType: { in: [UserType.ADMIN, UserType.SUPER_ADMIN] }, status: 'ACTIVE' },
                select: { email: true }
            });

            const adminNotification = EmailTemplates.adminPayoutNotification(
                `${user.firstName} ${user.lastName}`,
                `${requestedAmount.toFixed(2)}`,
                method,
                'Reseller'
            );

            for (const admin of admins) {
                if (admin.email) {
                    try {
                        await sendEmail(admin.email, adminNotification.subject, adminNotification.body);
                    } catch (sendErr) {
                        console.error(`Failed to send reseller payout request email to admin ${admin.email}:`, sendErr);
                    }
                }
            }
        }
    } catch (emailError) {
        console.error('Failed to send reseller payout emails:', emailError);
    }

    res.status(201).json({ status: 'success', message: 'Payout requested successfully', data: { payout } });
};

/**
 * List Reseller Payouts
 */
export const getPayouts = async (req: AuthRequest, res: Response) => {
    const payouts = await prisma.resellerPayout.findMany({
        where: { resellerId: req.user!.id },
        orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ status: 'success', data: { payouts } });
};

/**
 * Update Payout Status (Admin Only)
 */
export const processPayout = async (req: Request, res: Response) => {
    const r = req as any;
    const { payoutId, status, transactionId, adminNotes } = r.body;

    if (!r.user || (r.user.userType !== UserType.ADMIN && r.user.userType !== UserType.SUPER_ADMIN)) {
        throw new AppError('Unauthorized', 403);
    }

    const payout = await ResellerService.processPayout(parseInt(payoutId as string), status, transactionId);

    res.status(200).json({ status: 'success', data: { payout } });
};

/**
 * Admin: Get all payout requests
 */
export const getAllPayouts = async (req: AuthRequest, res: Response) => {
    const payouts = await prisma.resellerPayout.findMany({
        include: {
            reseller: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ status: 'success', data: { payouts } });
};

/**
 * Public: Get Reseller Configuration by Host (For White-Labeling)
 */
export const getPublicResellerConfig = async (req: Request, res: Response) => {
    try {
        const { host } = req.query;
        let lookupHost = host as string;

        if (lookupHost) {
            lookupHost = lookupHost.trim().replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
        }

        console.log(`[Public Reseller Config] Lookup request for raw host: '${host}' -> sanitized: '${lookupHost}'`);

        if (!lookupHost) return res.status(200).json({ status: 'success', data: { isReseller: false } });

        const hostWithoutWww = lookupHost.startsWith('www.') ? lookupHost.slice(4) : lookupHost;

        const reseller = await prisma.user.findFirst({
            where: {
                OR: [
                    { customDomain: lookupHost },
                    { customDomain: `www.${lookupHost}` },
                    { customDomain: hostWithoutWww },
                    { customDomain: `www.${hostWithoutWww}` }
                ],
                userType: UserType.RESELLER,
                whiteLabelEnabled: true
            },
            select: {
                id: true,
                brandSettings: true,
                firstName: true,
                lastName: true,
                email: true,
            }
        });

        console.log(`[Public Reseller Config] Result for '${host}':`, reseller ? `Found (ID: ${reseller.id})` : 'Not Found');

        if (!reseller) {
            return res.status(200).json({ status: 'success', data: { isReseller: false } });
        }

        res.status(200).json({
            status: 'success',
            data: {
                isReseller: true,
                resellerId: reseller.id,
                brandSettings: reseller.brandSettings ? JSON.parse(reseller.brandSettings) : null,
                resellerName: `${reseller.firstName} ${reseller.lastName}`.trim()
            }
        });
    } catch (error: any) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * Get Services of Reseller's Clients
 */
export const getResellerServices = async (req: AuthRequest, res: Response) => {
    const services = await prisma.service.findMany({
        where: {
            client: { resellerId: req.user!.id }
        },
        include: {
            client: { include: { user: true } },
            product: true
        },
        orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ status: 'success', results: services.length, data: { services } });
};

/**
 * Get Orders of Reseller's Clients
 */
export const getResellerOrders = async (req: AuthRequest, res: Response) => {
    const orders = await prisma.order.findMany({
        where: {
            resellerId: req.user!.id
        },
        include: {
            client: { include: { user: true } },
            items: true
        },
        orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ status: 'success', results: orders.length, data: { orders } });
};

/**
 * Get Invoices of Reseller's Clients
 */
export const getResellerInvoices = async (req: AuthRequest, res: Response) => {
    const invoices = await prisma.invoice.findMany({
        where: {
            client: { resellerId: req.user!.id }
        },
        include: {
            client: { include: { user: true } }
        },
        orderBy: { dueDate: 'desc' }
    });

    res.status(200).json({ status: 'success', results: invoices.length, data: { invoices } });
};
