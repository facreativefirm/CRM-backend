import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { validate } from '../middleware/validation.middleware';
import { registerSchema, loginSchema, updateMeSchema } from '../utils/validators';
import { protect } from '../middleware/auth.middleware';
import { authRateLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', authRateLimiter, validate(loginSchema), authController.login);
router.get('/me', protect, authController.me);
router.patch('/update-me', protect, validate(updateMeSchema), authController.updateMe);
router.post('/logout', authController.logout);

export default router;
