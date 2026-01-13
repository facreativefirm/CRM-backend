import { Router } from 'express';
import * as resellerController from '../../controllers/reseller.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { UserType } from '@prisma/client';

const router = Router();

router.use(protect);

// Reseller Dashboard & Stats
router.get('/dashboard', restrictTo(UserType.RESELLER), resellerController.getResellerStats);
router.get('/commissions', restrictTo(UserType.RESELLER), resellerController.getCommissions);
router.post('/payout-request', restrictTo(UserType.RESELLER), resellerController.requestPayout);

// Admin Payout Management
router.post('/process-payout', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), resellerController.processPayout);

export default router;
