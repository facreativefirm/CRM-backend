import { Request, Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';

/**
 * Custom Field Management
 */
export const getCustomFields = async (req: Request, res: Response) => {
    const fields = await prisma.customField.findMany();
    res.status(200).json({
        status: 'success',
        data: { fields },
    });
};

export const createCustomField = async (req: Request, res: Response) => {
    const field = await prisma.customField.create({
        data: req.body,
    });
    res.status(201).json({
        status: 'success',
        data: { field },
    });
};

/**
 * Client Custom Field Values
 */
export const updateClientCustomValue = async (req: Request, res: Response) => {
    const { clientId, fieldId } = req.params;
    const { fieldValue } = req.body;

    const value = await prisma.clientCustomFieldValue.upsert({
        where: {
            clientId_fieldId: {
                clientId: parseInt(clientId as string),
                fieldId: parseInt(fieldId as string),
            },
        },
        update: { fieldValue },
        create: {
            clientId: parseInt(clientId as string),
            fieldId: parseInt(fieldId as string),
            fieldValue,
        },
    });

    res.status(200).json({
        status: 'success',
        data: { value },
    });
};
