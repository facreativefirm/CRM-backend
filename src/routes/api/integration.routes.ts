import { Router } from 'express';
import * as integrationController from '../../controllers/integration.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { UserType } from '@prisma/client';

const router = Router();

// For now, we restrict these to SUPER_ADMIN. 
// In a real deployment, you might use a dedicated API Key middleware instead of User Auth.
router.use(protect);
router.use(restrictTo(UserType.SUPER_ADMIN, UserType.ADMIN));

router.post('/map-ids', integrationController.mapExternalId);
router.post('/inventory', integrationController.updateInventory);
router.post('/payment', integrationController.syncPayment);

export default router;
