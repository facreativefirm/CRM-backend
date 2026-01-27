import { Router } from 'express';
import * as guestSupportController from '../../controllers/guestSupport.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { guestSupportRateLimit, detectSuspiciousActivity } from '../../middleware/guestRateLimit.middleware';
import { UserType } from '@prisma/client';

const router = Router();


// Public endpoint - with rate limiting and abuse detection
router.post(
    '/initiate',
    detectSuspiciousActivity,
    guestSupportRateLimit({
        windowMs: 24 * 60 * 60 * 1000, // 24 hours
        maxRequests: 3,
        message: 'You have reached the maximum number of support tickets (3) allowed per 24 hours. Please try again later or contact us directly.'
    }),
    guestSupportController.initiateGuestSupport
);

// Admin-only endpoints
router.use(protect);
router.use(restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN));

router.get('/stats', guestSupportController.getGuestActivityStats);

export default router;
