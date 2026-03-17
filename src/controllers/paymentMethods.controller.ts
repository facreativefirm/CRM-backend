import { Request, Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { getSetting } from '../services/settingsService';

export const getPaymentMethods = async (req: Request, res: Response) => {
    try {
        const methods = await prisma.manualPaymentMethod.findMany({
            orderBy: { displayOrder: 'asc' },
        });
        res.status(200).json({ status: 'success', data: { methods } });
    } catch (error: any) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

export const getActivePaymentMethods = async (req: Request, res: Response) => {
    try {
        // Fetch manual payment methods ordered by displayOrder
        const manualMethods = await prisma.manualPaymentMethod.findMany({
            where: { enabled: true },
            orderBy: { displayOrder: 'asc' },
        });

        // Fetch gateway settings
        const bkashEnabled = await getSetting('bkashEnabled', 'false');
        const nagadEnabled = await getSetting('nagadEnabled', 'false');
        const bkashOrder = parseInt(await getSetting('bkashDisplayOrder', '0'));
        const nagadOrder = parseInt(await getSetting('nagadDisplayOrder', '1'));

        // Build payment methods array with gateways
        const allMethods: any[] = [];

        // Add bKash if enabled
        if (bkashEnabled === 'true') {
            allMethods.push({
                id: 'bkash_payment',
                name: 'bKash Payment',
                description: 'Auto Merchant Payment',
                type: 'auto_gateway',
                subtype: 'merchant',
                enabled: true,
                displayOrder: bkashOrder,
                gateway: 'bkash'
            });
        }

        // Add Nagad if enabled
        if (nagadEnabled === 'true') {
            allMethods.push({
                id: 'nagad_auto',
                name: 'Nagad Payment',
                description: 'Merchant Payment',
                type: 'auto_gateway',
                subtype: 'merchant',
                enabled: true,
                displayOrder: nagadOrder,
                gateway: 'nagad'
            });
        }

        // Add manual payment methods with their displayOrder
        manualMethods.forEach(method => {
            allMethods.push({
                id: method.id,
                name: method.name,
                description: method.description,
                type: method.type,
                subtype: method.subtype,
                enabled: method.enabled,
                displayOrder: method.displayOrder,
                accountNumber: method.accountNumber,
                accountName: method.accountName,
                branchName: method.branchName,
                instructionsEn: method.instructionsEn,
                instructionsBn: method.instructionsBn,
                manual: true
            });
        });

        // Sort all methods by displayOrder
        allMethods.sort((a, b) => a.displayOrder - b.displayOrder);

        res.status(200).json({ status: 'success', data: { methods: allMethods } });
    } catch (error: any) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

export const createPaymentMethod = async (req: AuthRequest, res: Response) => {
    try {
        const data = req.body;
        const method = await prisma.manualPaymentMethod.create({
            data: {
                ...data,
                displayOrder: data.displayOrder ? parseInt(data.displayOrder) : 0,
            },
        });
        res.status(201).json({ status: 'success', data: { method } });
    } catch (error: any) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

export const updatePaymentMethod = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const data = req.body;
        const method = await prisma.manualPaymentMethod.update({
            where: { id: parseInt(id as string) },
            data: {
                ...data,
                displayOrder: data.displayOrder !== undefined ? parseInt(data.displayOrder) : undefined,
            },
        });
        res.status(200).json({ status: 'success', data: { method } });
    } catch (error: any) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

export const deletePaymentMethod = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        await prisma.manualPaymentMethod.delete({
            where: { id: parseInt(id as string) },
        });
        res.status(200).json({ status: 'success', message: 'Payment method deleted' });
    } catch (error: any) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

export const reorderPaymentMethods = async (req: AuthRequest, res: Response) => {
    try {
        const { orders } = req.body; // Array of { id: number, displayOrder: number }

        await prisma.$transaction(
            orders.map((o: any) =>
                prisma.manualPaymentMethod.update({
                    where: { id: o.id },
                    data: { displayOrder: o.displayOrder },
                })
            )
        );

        res.status(200).json({ status: 'success', message: 'Methods reordered' });
    } catch (error: any) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};
