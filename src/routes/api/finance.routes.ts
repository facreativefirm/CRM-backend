import { Router } from 'express';
import * as financeController from '../../controllers/finance.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { currencySchema, taxRateSchema } from '../../utils/validators';
import { UserType } from '@prisma/client';

const router = Router();

router.use(protect);
router.use(restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF));

router.get('/currencies', financeController.getCurrencies);
router.post('/currencies', validate(currencySchema), financeController.createCurrency);

router.get('/tax-rates', financeController.getTaxRates);
router.post('/tax-rates', validate(taxRateSchema), financeController.createTaxRate);

router.post('/attempt-cc-capture', financeController.attemptCCCapture);

router.get('/transactions', financeController.getTransactions);
router.post('/transactions/:id/verify', financeController.verifyTransaction);

// Refunds
router.get('/refunds', financeController.getRefunds);
router.post('/refunds', financeController.requestRefund);
router.post('/refunds/:id/authorize', financeController.authorizeRefund);
router.post('/refunds/:id/approve', financeController.approveRefund);

export default router;
