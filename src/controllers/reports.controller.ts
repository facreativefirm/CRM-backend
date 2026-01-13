import { Request, Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { UserType, OrderStatus, InvoiceStatus } from '@prisma/client';

/**
 * Dashboard Statistics
 */
export const getDashboardStats = async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const isClient = req.user.userType === UserType.CLIENT;
    const isReseller = req.user.userType === UserType.RESELLER;

    let clientId;
    if (isClient) {
        clientId = (await prisma.client.findUnique({ where: { userId: req.user.id } }))?.id;
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
                ...(isReseller ? { client: { resellerId: req.user.id } } : {}),
            }
        }),
        // Update: Sum 'amountPaid' from all valid invoices (PAID or PARTIALLY_PAID)
        totalRevenue: !isClient ? await prisma.invoice.aggregate({
            where: {
                status: { in: [InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.REFUNDED] }, // Include REFUNDED to capture the non-refunded portion if any (though usually REFUNDED means 0 paid, but let's be safe and rely on amountPaid)
                isDeleted: false,
                ...(isReseller ? { client: { resellerId: req.user.id } } : {}),
            },
            _sum: { amountPaid: true }
        }) : null,
        pendingOrders: await prisma.order.count({
            where: {
                status: OrderStatus.PENDING,
                ...(clientId && { clientId }),
                ...(isReseller ? { client: { resellerId: req.user.id } } : {}),
            }
        })
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

    const data = await prisma.invoice.groupBy({
        by: ['status'],
        where: {
            isDeleted: false, // Exclude soft-deleted invoices
            createdAt: {
                gte: startDate ? new Date(startDate as string) : undefined,
                lte: endDate ? new Date(endDate as string) : undefined,
            }
        },
        _sum: { amountPaid: true },
        _count: { id: true }
    });

    res.status(200).json({
        status: 'success',
        data: { report: data },
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
    // Get revenue for the last 6 months
    const today = new Date();
    const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, 1);

    const invoices = await prisma.invoice.findMany({
        where: {
            status: { in: [InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.REFUNDED] }, // Include partial and refunded (historically paid amount)
            isDeleted: false,
            createdAt: { gte: sixMonthsAgo }
        },
        select: {
            amountPaid: true,
            createdAt: true
        }
    });

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyData: { [key: string]: number } = {};

    // Initialize last 6 months
    for (let i = 0; i < 7; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        monthlyData[months[d.getMonth()]] = 0;
    }

    invoices.forEach(inv => {
        const month = months[inv.createdAt.getMonth()];
        if (monthlyData[month] !== undefined) {
            monthlyData[month] += Number(inv.amountPaid || 0);
        }
    });

    const chartData = Object.keys(monthlyData).reverse().map(name => ({
        name,
        revenue: monthlyData[name]
    }));

    res.status(200).json({
        status: 'success',
        data: { chartData }
    });
};