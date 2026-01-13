import { Router } from 'express';
import * as settingsController from '../../controllers/settings.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';

const router = Router();

router.get('/public', settingsController.getPublicSettings);

// Protected routes
router.use(protect);
router.get('/', restrictTo('ADMIN', 'SUPER_ADMIN' as any), settingsController.getSettings);
router.put('/', restrictTo('ADMIN', 'SUPER_ADMIN' as any), settingsController.updateSettings);

export default router;
