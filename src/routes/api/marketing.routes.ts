import { Router } from 'express';
import * as marketingController from '../../controllers/marketing.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { affiliateSchema, promotionSchema } from '../../utils/validators';
import { UserType } from '@prisma/client';

const router = Router();

router.use(protect);

// Affiliates (Clients)
router.post('/affiliate/join', marketingController.joinAffiliateProgram);
router.get('/affiliate/stats', marketingController.getAffiliateStats);

// Promotions (Admin only)
router.get('/promotions', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), marketingController.getPromotions);
router.post('/promotions', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), validate(promotionSchema), marketingController.createPromotion);
router.delete('/promotions/:id', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), marketingController.deletePromotion);

// Link Tracking (Public)
router.get('/track-campaign', marketingController.trackCampaign);

export default router;
