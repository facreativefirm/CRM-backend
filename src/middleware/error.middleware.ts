import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export class AppError extends Error {
    public statusCode: number;
    public isOperational: boolean;

    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

import { Prisma } from '@prisma/client';

export const errorHandler = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';

    // Handle Prisma errors
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
            statusCode = 400;
            // Extract the field name if possible, otherwise generic
            const target = (err.meta?.target as string[]) || [];
            message = `A record with this ${target.join(', ') || 'value'} already exists.`;
            if (message.includes('email')) message = "This email address is already in use by another account.";
            if (message.includes('username')) message = "This username is already taken.";
        }
    }

    if (!(err instanceof AppError)) {
        logger.error(`Unhandled Error: ${err.message}`);
        if (err.stack) logger.error(err.stack);
    }

    res.status(statusCode).json({
        status: 'error',
        message,
        ...(process.env.NODE_ENV === 'development' && {
            stack: err.stack,
            prismaCode: err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined
        }),
    });
};
