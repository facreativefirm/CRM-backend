import { Request, Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';

/**
 * Update CRM Entity with ERP External ID
 * POST /api/integration/map-ids
 */
export const mapExternalId = async (req: Request, res: Response) => {
    const { entity, localId, externalId } = req.body;

    if (!entity || !localId || !externalId) {
        throw new AppError('Missing required fields', 400);
    }

    let result;
    const model = entity.toLowerCase();

    // Dynamically update based on entity type
    if (model === 'invoice') {
        result = await prisma.invoice.update({
            where: { id: parseInt(localId) },
            data: {
                externalId,
                syncStatus: 'SYNCED',
                lastSyncAt: new Date(),
                syncError: null
            }
        });
    } else if (model === 'client') {
        result = await prisma.client.update({
            where: { id: parseInt(localId) },
            data: {
                externalId,
                syncStatus: 'SYNCED',
                lastSyncAt: new Date(),
                syncError: null
            }
        });
    } else if (model === 'product') {
        result = await prisma.product.update({
            where: { id: parseInt(localId) },
            data: {
                externalId,
                syncStatus: 'SYNCED',
                lastSyncAt: new Date()
            }
        });
    } else if (model === 'order') {
        // Order doesn't have externalId in schema yet, usually maps to Invoice
        throw new AppError('Order mapping not supported directly. Map the Invoice instead.', 400);
    } else {
        throw new AppError(`Entity type '${entity}' is not supported for mapping`, 400);
    }

    res.status(200).json({ status: 'success', data: result });
};

/**
 * Update Inventory from ERP
 * POST /api/integration/inventory
 */
export const updateInventory = async (req: Request, res: Response) => {
    const { sku, externalId, quantity } = req.body;

    if (quantity === undefined || (!sku && !externalId)) {
        throw new AppError('Missing SKU/ExternalID or Quantity', 400);
    }

    const product = await prisma.product.findFirst({
        where: {
            OR: [
                { externalId: externalId },
                { slug: sku } // Assuming slug is used as SKU
            ]
        }
    });

    if (!product) throw new AppError('Product not found', 404);

    const updated = await prisma.product.update({
        where: { id: product.id },
        data: { stockQuantity: parseInt(quantity) }
    });

    res.status(200).json({ status: 'success', data: { id: updated.id, stock: updated.stockQuantity } });
};

/**
 * Mark Invoice Paid from ERP (Bank Transfer Sync)
 * POST /api/integration/payment
 */
export const syncPayment = async (req: Request, res: Response) => {
    const { invoiceNumber, externalId, amount, paymentDate } = req.body;

    // We import locally to avoid circular dependencies if any
    const { recordPayment } = await import('../services/invoiceService');
    const { Prisma } = await import('@prisma/client');

    const invoice = await prisma.invoice.findUnique({
        where: { invoiceNumber }
    });

    if (!invoice) throw new AppError('Invoice not found', 404);

    if (invoice.status === 'PAID') {
        return res.status(200).json({ status: 'success', message: 'Invoice already paid' });
    }

    // Record the payment
    await recordPayment(
        invoice.id,
        new Prisma.Decimal(amount),
        'ERP_SYNC',
        externalId || `ERP-${Date.now()}`
    );

    res.status(200).json({ status: 'success', message: 'Payment recorded via ERP sync' });
};
