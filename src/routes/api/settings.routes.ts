import { Router } from 'express';
import * as settingsController from '../../controllers/settings.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { UserType } from '@prisma/client';

const router = Router();

router.get('/public', settingsController.getPublicSettings);

// Protected routes
router.use(protect);
router.get('/', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), settingsController.getSettings);
router.post('/test-auth', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), (req, res) => res.json({ ok: true }));
router.post('/', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), settingsController.updateSettings);
// The instruction "Change PUT to POST for settings update" implies removing the PUT route if POST is already present and preferred.
// The original comment "Keep PUT for compatibility" is now removed as per the instruction's intent to standardize on POST.

export default router;
