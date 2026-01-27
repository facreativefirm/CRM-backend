import { Router } from 'express';
import * as servicesController from '../../controllers/services.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { createServiceSchema, serviceUpdateSchema, cancellationRequestSchema } from '../../utils/validators';
import { UserType } from '@prisma/client';

const router = Router();

router.use(protect);

// IMPORTANT: Specific routes MUST come before parameterized routes
// Admin only: Bulk provision (must be before /:id routes)
router.post('/bulk-provision', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), servicesController.bulkProvision);

router.get('/', servicesController.getServices);
router.get('/:id', servicesController.getService);

// Admin only: Create & Update service details
router.post('/', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), validate(createServiceSchema), servicesController.createService);
router.patch('/:id', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), validate(serviceUpdateSchema), servicesController.updateService);

// Admin only: Perform provisioning actions
router.post('/:id/action', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), servicesController.performAction);

// Client/Reseller: Request cancellation
router.post('/cancel', validate(cancellationRequestSchema), servicesController.requestCancellation);

// Client/Reseller: Change Password
router.post('/:id/change-password', servicesController.changeServicePassword);

// Client/Reseller: Request renewal
router.post('/:id/request-renewal', servicesController.requestServiceRenewal);

// Admin only: Manual Expiration Notification
router.post('/:id/notify', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), servicesController.notifyServiceExpiration);

export default router;
