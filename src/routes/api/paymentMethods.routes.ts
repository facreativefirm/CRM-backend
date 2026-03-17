import { Router } from 'express';
import * as paymentMethodsController from '../../controllers/paymentMethods.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { UserType } from '@prisma/client';

const router = Router();

// Public routes
router.get('/active', paymentMethodsController.getActivePaymentMethods);

// Protected routes (Admin only)
router.use(protect);
router.use(restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN));

router.get('/', paymentMethodsController.getPaymentMethods);
router.post('/', paymentMethodsController.createPaymentMethod);
router.patch('/:id', paymentMethodsController.updatePaymentMethod);
router.delete('/:id', paymentMethodsController.deletePaymentMethod);
router.post('/reorder', paymentMethodsController.reorderPaymentMethods);

export default router;
