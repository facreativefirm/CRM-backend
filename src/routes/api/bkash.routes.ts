import { Router } from 'express';
import bkashController from '../../controllers/bkash.controller';
import { protect } from '../../middleware/auth.middleware';

const router = Router();

// Initiate payment (requires auth)
router.post('/initiate', protect as any, bkashController.initiatePayment as any);

// Callback from bKash (public, but handles verification internally)
router.get('/callback', bkashController.handleCallback as any);

export default router;
