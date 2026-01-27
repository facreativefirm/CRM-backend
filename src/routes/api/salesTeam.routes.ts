import { Router } from 'express';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import * as salesTeamController from '../../controllers/salesTeam.controller';
import { UserType } from '@prisma/client';

const router = Router();

router.use(protect); // All routes require authentication

// Member Management
router.post('/members', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), salesTeamController.registerMember);
router.get('/stats/me', salesTeamController.getMyStats);
router.get('/members/:id/stats', salesTeamController.getMemberStats);

// Prospect Management
router.post('/prospects', salesTeamController.submitProspect); // Sales member only (checked in controller)
router.get('/prospects', salesTeamController.getMyProspects); // Member's own prospects
router.get('/transactions', salesTeamController.getMyTransactions); // Points history

// Admin Verification & Fraud
router.put('/prospects/:id/verify', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), salesTeamController.verifyProspect);
router.put('/prospects/:id/fraud', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), salesTeamController.flagFraud);
router.get('/admin/prospects', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), salesTeamController.getAllProspects);

// Withdrawal System
router.post('/withdrawals', salesTeamController.requestWithdrawal);
router.get('/withdrawals', salesTeamController.getMyWithdrawals);
router.get('/admin/withdrawals', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), salesTeamController.getAllWithdrawals);
router.put('/withdrawals/:id/process', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), salesTeamController.processWithdrawal);

// Analytics
router.get('/analytics/leaderboard', salesTeamController.getLeaderboard);
router.get('/analytics/territory-performance', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), salesTeamController.getTerritoryPerformance);

export default router;
