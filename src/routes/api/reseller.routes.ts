import { Router } from 'express';
import * as resellerController from '../../controllers/reseller.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { UserType } from '@prisma/client';

const router = Router();

// Public: Get Reseller Configuration by Host
router.get('/config', resellerController.getPublicResellerConfig);

router.use(protect);

// Reseller Dashboard & Stats
router.get('/dashboard', restrictTo(UserType.RESELLER), resellerController.getResellerStats);
router.get('/settings', restrictTo(UserType.RESELLER), resellerController.getBrandSettings);
router.get('/verify-dns', restrictTo(UserType.RESELLER), resellerController.verifyDomainDNS);
router.patch('/settings', restrictTo(UserType.RESELLER), resellerController.updateBrandSettings);
router.get('/clients', restrictTo(UserType.RESELLER), resellerController.getResellerClients);
router.get('/products', restrictTo(UserType.RESELLER), resellerController.getResellerProducts);
router.patch('/products/override', restrictTo(UserType.RESELLER), resellerController.updateResellerProduct);

router.get('/commissions', restrictTo(UserType.RESELLER), resellerController.getCommissions);
router.get('/payouts', restrictTo(UserType.RESELLER), resellerController.getPayouts);
router.post('/payout-request', restrictTo(UserType.RESELLER), resellerController.requestPayout);

// Merchant Activity
router.get('/services', restrictTo(UserType.RESELLER), resellerController.getResellerServices);
router.get('/orders', restrictTo(UserType.RESELLER), resellerController.getResellerOrders);
router.get('/invoices', restrictTo(UserType.RESELLER), resellerController.getResellerInvoices);

// Admin Reseller Management
router.get('/admin-stats', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), resellerController.getAdminResellerStats);
router.get('/all-payouts', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), resellerController.getAllPayouts);
router.post('/process-payout', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), resellerController.processPayout);

export default router;
