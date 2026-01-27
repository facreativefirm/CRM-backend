import { Router } from 'express';
import * as productsController from '../../controllers/products.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { productSchema, resellerProductSchema } from '../../utils/validators';
import { UserType } from '@prisma/client';

const router = Router();

// Publicly viewable or protected depending on login
// Publicly viewable
router.get('/', productsController.getProducts);
router.get('/:id', productsController.getProduct);

// Admin Management
router.post('/', protect, restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), validate(productSchema), productsController.createProduct);
router.patch('/:id', protect, restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), validate(productSchema), productsController.updateProduct);
router.delete('/:id', protect, restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), productsController.deleteProduct);

// Reseller Customization
router.post('/customize', protect, restrictTo(UserType.RESELLER), validate(resellerProductSchema), productsController.customizeProductForReseller);

export default router;
