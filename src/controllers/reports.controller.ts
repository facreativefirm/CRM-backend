import { Request, Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { UserType, OrderStatus, InvoiceStatus, CommissionStatus } from '@prisma/client';

/**
 * Dashboard Statistics
 */
export const getDashboardStats = async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const userId = req.user.id;
    const userRole = req.user.userType;
    const isClient = userRole === UserType.CLIENT;
    const isReseller = userRole === UserType.RESELLER;

    let clientId;
    if (isClient) {
        clientId = (await prisma.client.findUnique({ where: { userId } }))?.id;
    }

    const stats = {
        activeServices: await prisma.service.count({
            where: {
                status: 'ACTIVE',
                ...(clientId && { clientId }),
                ...(isReseller ? { client: { resellerId: req.user.id } } : {}),
            }
        }),
        unpaidInvoices: await prisma.invoice.count({
            where: {
                status: InvoiceStatus.UNPAID,
                isDeleted: false, // Exclude soft-deleted invoices
                ...(clientId && { clientId }),
                ...(isReseller ? { client: { resellerId: req.user.id } } : {}),
            }
        }),
        pendingTickets: await prisma.supportTicket.count({
            where: {
                status: 'OPEN',
                ...(clientId && { clientId }),
                ...(isReseller ? { client: { resellerId: userId } } : {}),
            }
        }),
        // Update: Sum 'amountPaid' from all valid invoices (PAID or PARTIALLY_PAID)
        totalRevenue: !isClient ? await prisma.invoice.aggregate({
            where: {
                status: { in: [InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.REFUNDED] }, // Include REFUNDED to capture the non-refunded portion if any (though usually REFUNDED means 0 paid, but let's be safe and rely on amountPaid)
                isDeleted: false,
                ...(isReseller ? { client: { resellerId: userId } } : {}),
            },
            _sum: { amountPaid: true }
        }) : null,
        pendingOrders: await prisma.order.count({
            where: {
                status: OrderStatus.PENDING,
                ...(clientId && { clientId }),
                ...(isReseller ? { client: { resellerId: userId } } : {}),
            }
        }),
        totalCommissions: isReseller ? await prisma.resellerCommission.aggregate({
            where: { resellerId: userId, status: CommissionStatus.PAID },
            _sum: { commissionAmount: true }
        }) : null,
        // Payout Deductions
        payouts: !isClient ? await (async () => {
            const [investor, reseller, salesTeam] = await Promise.all([
                prisma.investorPayout.aggregate({
                    where: { status: 'PAID', ...(isReseller ? { id: -1 } : {}) }, // Logic to skip for reseller
                    _sum: { amount: true }
                }),
                prisma.resellerPayout.aggregate({
                    where: { status: 'PAID', ...(isReseller ? { resellerId: userId } : {}) },
                    _sum: { netAmount: true }
                }),
                prisma.withdrawalRequest.aggregate({
                    where: { status: 'PAID', ...(isReseller ? { id: -1 } : {}) },
                    _sum: { amountInCurrency: true }
                })
            ]);
            return {
                investor: Number(investor._sum.amount || 0),
                reseller: Number(reseller._sum.netAmount || 0),
                salesTeam: Number(salesTeam._sum.amountInCurrency || 0),
                total: Number(investor._sum.amount || 0) + Number(reseller._sum.netAmount || 0) + Number(salesTeam._sum.amountInCurrency || 0)
            };
        })() : null,
    };

    res.status(200).json({
        status: 'success',
        data: { stats },
    });
};

/**
 * Revenue Reports (Admin Only)
 */
export const getRevenueReport = async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;

    const [invoices, investorPayouts, resellerPayouts, salesPayouts] = await Promise.all([
        prisma.invoice.groupBy({
            by: ['status'],
            where: {
                isDeleted: false,
                createdAt: {
                    gte: startDate ? new Date(startDate as string) : undefined,
                    lte: endDate ? new Date(endDate as string) : undefined,
                }
            },
            _sum: { amountPaid: true },
            _count: { id: true }
        }),
        prisma.investorPayout.aggregate({
            where: {
                status: 'PAID',
                createdAt: {
                    gte: startDate ? new Date(startDate as string) : undefined,
                    lte: endDate ? new Date(endDate as string) : undefined,
                }
            },
            _sum: { amount: true }
        }),
        prisma.resellerPayout.aggregate({
            where: {
                status: 'PAID',
                createdAt: {
                    gte: startDate ? new Date(startDate as string) : undefined,
                    lte: endDate ? new Date(endDate as string) : undefined,
                }
            },
            _sum: { netAmount: true }
        }),
        prisma.withdrawalRequest.aggregate({
            where: {
                status: 'PAID',
                createdAt: {
                    gte: startDate ? new Date(startDate as string) : undefined,
                    lte: endDate ? new Date(endDate as string) : undefined,
                }
            },
            _sum: { amountInCurrency: true }
        })
    ]);

    console.log("Revenue Report Payouts Debug:", {
        investor: investorPayouts._sum.amount,
        reseller: resellerPayouts._sum.netAmount,
        sales: salesPayouts._sum.amountInCurrency
    });

    res.status(200).json({
        status: 'success',
        data: {
            report: invoices,
            payouts: {
                investor: Number(investorPayouts._sum.amount || 0),
                reseller: Number(resellerPayouts._sum.netAmount || 0),
                salesTeam: Number(salesPayouts._sum.amountInCurrency || 0),
                total: Number(investorPayouts._sum.amount || 0) + Number(resellerPayouts._sum.netAmount || 0) + Number(salesPayouts._sum.amountInCurrency || 0)
            }
        },
    });
};

/**
 * Client Acquisition Report (Admin Only)
 */
export const getClientStats = async (req: Request, res: Response) => {
    // 1. Status Counts
    const clientsByStatus = await prisma.client.groupBy({
        by: ['status'],
        _count: { id: true }
    });

    // 2. Acquisition Metrics
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of prev month

    const [newThisMonth, newLastMonth, totalClients] = await Promise.all([
        prisma.client.count({
            where: { clientSince: { gte: startOfThisMonth } }
        }),
        prisma.client.count({
            where: {
                clientSince: {
                    gte: startOfLastMonth,
                    lte: endOfLastMonth
                }
            }
        }),
        prisma.client.count()
    ]);

    // Calculate Growth
    let monthlyGrowth = 0;
    if (newLastMonth > 0) {
        monthlyGrowth = ((newThisMonth - newLastMonth) / newLastMonth) * 100;
    } else if (newThisMonth > 0) {
        monthlyGrowth = 100; // 100% growth if generic jump from 0
    }

    // Transform status group to object
    const statusMap: Record<string, number> = {};
    clientsByStatus.forEach(g => { statusMap[g.status] = g._count.id; });

    const stats = {
        totalClients,
        activeClients: statusMap['ACTIVE'] || 0,
        inactiveClients: (statusMap['INACTIVE'] || 0) + (statusMap['CLOSED'] || 0),
        newThisMonth,
        newLastMonth,
        monthlyGrowth: parseFloat(monthlyGrowth.toFixed(1)),
        averagePerMonth: Math.round((newThisMonth + newLastMonth) / 2) // Simple approximation for now
    };

    res.status(200).json({
        status: 'success',
        data: stats,
    });
};

/**
 * Monthly Revenue Breakdown
 */
export const getMonthlyRevenue = async (req: AuthRequest, res: Response) => {
    const today = new Date();
    const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, 1);
    const isReseller = req.user!.userType === UserType.RESELLER;

    const [invoices, invPayouts, resPayouts, salesPayouts] = await Promise.all([
        prisma.invoice.findMany({
            where: {
                status: { in: [InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.REFUNDED] },
                isDeleted: false,
                createdAt: { gte: sixMonthsAgo },
                ...(isReseller ? { client: { resellerId: req.user!.id } } : {}),
            },
            select: { amountPaid: true, createdAt: true }
        }),
        prisma.investorPayout.findMany({
            where: { status: 'PAID', createdAt: { gte: sixMonthsAgo }, ...(isReseller ? { id: -1 } : {}) },
            select: { amount: true, createdAt: true }
        }),
        prisma.resellerPayout.findMany({
            where: { status: 'PAID', createdAt: { gte: sixMonthsAgo }, ...(isReseller ? { resellerId: req.user!.id } : {}) },
            select: { netAmount: true, createdAt: true }
        }),
        prisma.withdrawalRequest.findMany({
            where: { status: 'PAID', createdAt: { gte: sixMonthsAgo }, ...(isReseller ? { id: -1 } : {}) },
            select: { amountInCurrency: true, createdAt: true }
        })
    ]);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyData: { [key: string]: { revenue: number, payouts: number } } = {};

    // Initialize last 6 months
    for (let i = 0; i < 7; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        monthlyData[months[d.getMonth()]] = { revenue: 0, payouts: 0 };
    }

    invoices.forEach(inv => {
        const month = months[inv.createdAt.getMonth()];
        if (monthlyData[month] !== undefined) {
            monthlyData[month].revenue += Number(inv.amountPaid || 0);
        }
    });

    invPayouts.forEach(p => {
        const month = months[p.createdAt.getMonth()];
        if (monthlyData[month] !== undefined) monthlyData[month].payouts += Number(p.amount || 0);
    });

    resPayouts.forEach(p => {
        const month = months[p.createdAt.getMonth()];
        if (monthlyData[month] !== undefined) monthlyData[month].payouts += Number(p.netAmount || 0);
    });

    salesPayouts.forEach(p => {
        const month = months[p.createdAt.getMonth()];
        if (monthlyData[month] !== undefined) monthlyData[month].payouts += Number(p.amountInCurrency || 0);
    });

    const chartData = Object.keys(monthlyData).reverse().map(name => ({
        name,
        revenue: monthlyData[name].revenue - monthlyData[name].payouts,
        gross: monthlyData[name].revenue,
        payouts: monthlyData[name].payouts
    }));

    res.status(200).json({
        status: 'success',
        data: { chartData }
    });
};