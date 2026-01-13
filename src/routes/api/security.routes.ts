import { Router } from 'express';
import * as securityController from '../../controllers/security.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { UserType } from '@prisma/client';

const router = Router();

router.use(protect);

// Banned IPs (Admin only)
router.get('/banned-ips', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), securityController.getBannedIPs);
router.post('/banned-ips', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), securityController.banIP);
router.delete('/banned-ips/:id', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), securityController.unbanIP);

// Security Questions Management (Admin only)
router.get('/questions', securityController.getSecurityQuestions);
router.post('/questions', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), securityController.createSecurityQuestion);
router.delete('/questions/:id', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), securityController.deleteSecurityQuestion);

// Client Specific Security
router.post('/client-setup', securityController.updateClientSecurityQuestion);

export default router;
