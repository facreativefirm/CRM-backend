import { Router } from 'express';
import { InvestorController } from '../controllers/investor.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';

const router = Router();

// Protect all routes
router.use(protect);

// Admin Routes (Specific paths first to avoid conflicts if parameterized routes exist, though here /admin prefix helps)
router.get('/admin/all', restrictTo('ADMIN', 'SUPER_ADMIN'), InvestorController.adminGetInvestors);
router.get('/admin/payouts', restrictTo('ADMIN', 'SUPER_ADMIN'), InvestorController.adminGetAllPayouts);
router.put('/admin/:id', restrictTo('ADMIN', 'SUPER_ADMIN'), InvestorController.adminUpdateInvestor);
router.put('/admin/payouts/:payoutId/approve', restrictTo('ADMIN', 'SUPER_ADMIN'), InvestorController.adminApprovePayout);
router.put('/admin/payouts/:payoutId/reject', restrictTo('ADMIN', 'SUPER_ADMIN'), InvestorController.adminRejectPayout);

// Investor Routes
router.get('/stats', restrictTo('INVESTOR'), InvestorController.getStats);
router.get('/commissions', restrictTo('INVESTOR'), InvestorController.getCommissions);
router.get('/payouts', restrictTo('INVESTOR'), InvestorController.getPayouts);
router.post('/payouts', restrictTo('INVESTOR'), InvestorController.requestPayout);

export default router;
