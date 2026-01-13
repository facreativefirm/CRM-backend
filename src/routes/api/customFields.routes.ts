import { Router } from 'express';
import * as customFieldsController from '../../controllers/customFields.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { UserType } from '@prisma/client';

const router = Router();

router.use(protect);

// Admin/Staff can manage field definitions
router.get('/', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), customFieldsController.getCustomFields);
router.post('/', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), customFieldsController.createCustomField);

// Support for updating client-specific values
router.patch('/clients/:clientId/fields/:fieldId', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF, UserType.RESELLER), customFieldsController.updateClientCustomValue);

export default router;
