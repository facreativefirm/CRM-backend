import { Router } from 'express';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import * as userApplicationController from '../../controllers/userApplication.controller';
import { UserType } from '@prisma/client';

const router = Router();

// Public routes
router.post('/apply', userApplicationController.submitApplication);

// Admin routes
router.use(protect);
router.use(restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN));

router.get('/', userApplicationController.getApplications);
router.put('/:id/process', userApplicationController.processApplication);

export default router;
