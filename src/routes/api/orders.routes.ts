import { Router } from 'express';
import * as ordersController from '../../controllers/orders.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { createOrderSchema, updateOrderStatusSchema } from '../../utils/validators';
import { UserType } from '@prisma/client';

const router = Router();

router.use(protect);

// Clients and Resellers can list/get orders (Isolation in controller)
router.get('/', ordersController.getOrders);
router.get('/:id', ordersController.getOrder);

// Creation
router.post('/', validate(createOrderSchema), ordersController.createOrder);

// Management (Admin/Staff only)
router.patch('/:id/status', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), validate(updateOrderStatusSchema), ordersController.updateOrderStatus);

export default router;
