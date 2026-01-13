import { Response } from 'express';
import * as orderService from '../services/orderService';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { UserType, OrderStatus } from '@prisma/client';

/**
 * List orders with reseller isolation and filtering
 */
export const getOrders = async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const { status, clientId } = req.query;
    const isReseller = req.user.userType === UserType.RESELLER;
    const isAdmin = req.user.userType === UserType.ADMIN || req.user.userType === UserType.SUPER_ADMIN || req.user.userType === UserType.STAFF;


    const orders = await prisma.order.findMany({
        where: {
            ...(status && { status: status as OrderStatus }),
            ...(clientId && { clientId: parseInt(clientId as string) }),
            ...(isReseller ? { resellerId: req.user?.id } : {}),
            // If client, they only see their own orders
            ...(req.user?.userType === UserType.CLIENT ? { clientId: (await prisma.client.findUnique({ where: { userId: req.user.id } }))?.id } : {}),
        },
        include: {
            client: {
                include: { user: true }
            },
            items: true,
            invoices: {
                include: {
                    transactions: true
                }
            }
        },
        orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
        status: 'success',
        results: orders.length,
        data: { orders },
    });
};

/**
 * Get single order details
 */
export const getOrder = async (req: AuthRequest, res: Response) => {
    const order = await prisma.order.findUnique({
        where: { id: parseInt(req.params.id) },
        include: {
            client: { include: { user: true } },
            items: { include: { product: true } },
            statusHistory: true,
            invoices: {
                include: {
                    transactions: true
                }
            },
        },
    });

    if (!order) {
        throw new AppError('Order not found', 404);
    }

    // Isolation check
    if (!req.user) throw new AppError('Unauthorized', 401);
    const isReseller = req.user.userType === UserType.RESELLER;
    if (isReseller && order.resellerId !== req.user.id) {
        throw new AppError('Access denied', 403);
    }

    if (req.user.userType === UserType.CLIENT) {
        const client = await prisma.client.findUnique({ where: { userId: req.user.id } });
        if (order.clientId !== client?.id) {
            throw new AppError('Access denied', 403);
        }
    }

    res.status(200).json({
        status: 'success',
        data: { order },
    });
};

/**
 * Create a new order
 */
export const createOrder = async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    let clientId = req.body.clientId;

    // Auto-resolve clientId from session if missing or if the user is a client/reseller
    if (!clientId || req.user.userType === UserType.CLIENT || req.user.userType === UserType.RESELLER) {
        const client = await prisma.client.findUnique({ where: { userId: req.user.id } });
        if (client) {
            clientId = client.id;
        } else if (req.user.userType === UserType.CLIENT) {
            // Clients MUST have a client profile
            throw new AppError('Client profile not found', 404);
        }
    }

    const orderData = {
        ...req.body,
        clientId,
        resellerId: req.user.userType === UserType.RESELLER ? req.user.id : undefined,
    };

    try {
        console.log(`[DEBUG] Creating order for client ${clientId} with data:`, JSON.stringify(orderData, null, 2));
        const order = await orderService.createOrder(orderData);

        res.status(201).json({
            status: 'success',
            data: { order },
        });
    } catch (error: any) {
        console.error("Order Creation Error:", error);
        if (error instanceof AppError) throw error;
        throw new AppError(`Order creation failed: ${error.message || 'Unknown error'}`, 500);
    }
};

/**
 * Update order status (Admin/Staff only)
 */
export const updateOrderStatus = async (req: AuthRequest, res: Response) => {
    const { status, reason } = req.body;
    const orderId = parseInt(req.params.id);

    if (!req.user) throw new AppError('Unauthorized', 401);
    const order = await orderService.updateOrderStatus(
        orderId,
        status as OrderStatus,
        req.user.email || 'System',
        reason,
        true // requireTransaction
    );

    res.status(200).json({
        status: 'success',
        data: { order },
    });
};
