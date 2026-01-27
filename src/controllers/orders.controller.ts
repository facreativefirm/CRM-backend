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
    const isAdmin = req.user.userType === UserType.ADMIN || req.user.userType === UserType.SUPER_ADMIN || req.user.userType === UserType.STAFF;
    const userClient = await prisma.client.findUnique({ where: { userId: req.user.id } });
    const userClientId = userClient?.id;

    const orders = await prisma.order.findMany({
        where: {
            ...(status && { status: status as any }),
            ...(clientId && { clientId: parseInt(clientId as string) }),
            // If not admin, only see personal orders
            ...(!isAdmin ? { clientId: userClientId } : {}),
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
        where: { id: parseInt(req.params.id as string) },
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

    let resellerId = req.body.resellerId ? parseInt(req.body.resellerId.toString()) : (req.user.userType === UserType.RESELLER ? req.user.id : undefined);

    // 1. If no resellerId yet, try looking up via resellerHost (storefront domain)
    if (!resellerId && req.body.resellerHost) {
        // Sanitize Host: Trim, Remove protocol, Remove trailing slash, Lowercase (Consistent with other lookup logic)
        const host = req.body.resellerHost.trim().replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
        const hostWithoutWww = host.startsWith('www.') ? host.slice(4) : host;

        const reseller = await prisma.user.findFirst({
            where: {
                OR: [
                    { customDomain: host },
                    { customDomain: `www.${host}` },
                    { customDomain: hostWithoutWww },
                    { customDomain: `www.${hostWithoutWww}` }
                ],
                userType: UserType.RESELLER
            },
            select: { id: true }
        });

        if (reseller) {
            console.log(`[OrderController] Resolved ResellerID ${reseller.id} from host: ${req.body.resellerHost} (Sanitized: ${host})`);
            resellerId = reseller.id;

            // Associate client with this reseller if they are not already associated
            const client = await prisma.client.findUnique({
                where: { id: clientId },
                select: { id: true, resellerId: true }
            });

            if (client && !client.resellerId) {
                console.log(`[OrderController] Automatically associating Client ${clientId} with Reseller ${reseller.id}`);
                await prisma.client.update({
                    where: { id: clientId },
                    data: { resellerId: reseller.id }
                });
            }
        } else {
            console.warn(`[OrderController] Could not resolve reseller from host: ${req.body.resellerHost} (Sanitized: ${host})`);
        }
    }

    // 2. If STILL no resellerId, and user is a CLIENT, check their registered reseller
    if (!resellerId && req.user.userType === UserType.CLIENT) {
        const clientProfile = await prisma.client.findUnique({
            where: { userId: req.user.id },
            select: { resellerId: true }
        });
        if (clientProfile?.resellerId) {
            console.log(`[OrderController] Resolved ResellerID ${clientProfile.resellerId} from Client Profile`);
            resellerId = clientProfile.resellerId;
        }
    }

    const orderData = {
        ...req.body,
        clientId,
        resellerId,
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
    const orderId = parseInt(req.params.id as string);

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
