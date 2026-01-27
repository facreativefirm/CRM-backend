import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { InvestorService } from '../services/investor.service';
import { AppError } from '../middleware/error.middleware';

export class InvestorController {
    static async getStats(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            if (!req.user) throw new AppError('User not authenticated', 401);
            const stats = await InvestorService.getStats(req.user.id);
            res.json(stats);
        } catch (error) {
            next(error);
        }
    }

    static async getCommissions(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            if (!req.user) throw new AppError('User not authenticated', 401);
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 10;

            const result = await InvestorService.getCommissions(req.user.id, page, limit);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getPayouts(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            if (!req.user) throw new AppError('User not authenticated', 401);
            const payouts = await InvestorService.getPayouts(req.user.id);
            res.json(payouts);
        } catch (error) {
            next(error);
        }
    }

    static async requestPayout(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            if (!req.user) throw new AppError('User not authenticated', 401);
            const { amount, method, details } = req.body;

            if (!amount || !method) throw new AppError('Amount and payment method are required', 400);

            const payout = await InvestorService.requestPayout(req.user.id, parseFloat(amount), method, details || '');
            res.status(201).json(payout);
        } catch (error) {
            next(error);
        }
    }


    // --- Admin Actions ---

    static async adminGetAllPayouts(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const payouts = await InvestorService.getAllPayouts();
            res.json(payouts);
        } catch (error) {
            next(error);
        }
    }

    static async adminGetInvestors(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const investors = await InvestorService.getAllInvestors();
            res.json(investors);
        } catch (error) {
            next(error);
        }
    }

    static async adminUpdateInvestor(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const { commissionType, commissionValue, status } = req.body;

            const updated = await InvestorService.updateInvestorSettings(
                parseInt(id as string),

                commissionType,
                parseFloat(commissionValue),
                status
            );
            res.json(updated);
        } catch (error) {
            next(error);
        }
    }

    static async adminApprovePayout(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { payoutId } = req.params;
            const { transactionId } = req.body;

            const payout = await InvestorService.approvePayout(parseInt(payoutId as string), transactionId);
            res.json(payout);
        } catch (error) {
            next(error);
        }
    }

    static async adminRejectPayout(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { payoutId } = req.params;
            const { reason } = req.body;

            const payout = await InvestorService.rejectPayout(parseInt(payoutId as string), reason);
            res.json(payout);
        } catch (error) {
            next(error);
        }
    }
}
