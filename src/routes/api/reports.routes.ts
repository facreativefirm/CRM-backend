import { Router } from 'express';
import * as reportsController from '../../controllers/reports.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { reportSchema } from '../../utils/validators';
import { UserType } from '@prisma/client';

const router = Router();

router.use(protect);

// Dashboard stats (Available to all authenticated users, filtered internally)
router.get('/dashboard', reportsController.getDashboardStats);

// Advanced Reports (Admin only)
router.get('/revenue', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), reportsController.getRevenueReport);
router.get('/monthly-revenue', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), reportsController.getMonthlyRevenue);
router.get('/clients', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), reportsController.getClientStats);

export default router;
