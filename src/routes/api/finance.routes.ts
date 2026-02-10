import { Router } from 'express';
import * as financeController from '../../controllers/finance.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { currencySchema, taxRateSchema } from '../../utils/validators';
import { UserType } from '@prisma/client';

const router = Router();

router.use(protect);
router.get('/currencies', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), financeController.getCurrencies);
router.post('/currencies', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), validate(currencySchema), financeController.createCurrency);

router.get('/tax-rates', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), financeController.getTaxRates);
router.post('/tax-rates', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), validate(taxRateSchema), financeController.createTaxRate);

router.post('/attempt-cc-capture', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), financeController.attemptCCCapture);

router.get('/transactions', financeController.getTransactions);
router.get('/transactions/:id', financeController.getTransaction);
router.post('/transactions/:id/verify', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), financeController.verifyTransaction);
router.get('/transactions/:id/receipt/download', financeController.downloadMoneyReceipt);
router.post('/transactions/:id/receipt/send', financeController.sendMoneyReceiptEmail);

// Refunds
router.get('/refunds', financeController.getRefunds);
router.post('/refunds', financeController.requestRefund);
router.post('/refunds/:id/authorize', financeController.authorizeRefund);
router.post('/refunds/:id/approve', financeController.approveRefund);

export default router;
