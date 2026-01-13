import { Router } from 'express';
import * as productServicesController from '../../controllers/productServices.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { serviceSchema } from '../../utils/validators';
import { UserType } from '@prisma/client';

const router = Router();

// Publicly viewable
router.get('/', productServicesController.getServices);
router.get('/:id', productServicesController.getService);

// Management (Admin/Staff only)
router.use(protect);
router.use(restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF));

router.post('/', validate(serviceSchema), productServicesController.createService);
router.patch('/:id', validate(serviceSchema), productServicesController.updateService);
router.delete('/:id', productServicesController.deleteService);

export default router;
