import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodSchema } from 'zod';
import { AppError } from './error.middleware';

export const validate = (schema: ZodSchema) => async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsed = await schema.parseAsync({
            body: req.body,
            query: req.query,
            params: req.params,
        }) as any;

        // Update request with transformed values safely
        if (parsed.body) req.body = parsed.body;
        if (parsed.query) req.query = parsed.query;
        if (parsed.params) req.params = { ...req.params, ...parsed.params };

        return next();
    } catch (error: any) {
        if (error instanceof ZodError) {
            const message = error.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join(', ');
            return next(new AppError(message, 400));
        }
        return next(error);
    }
};
