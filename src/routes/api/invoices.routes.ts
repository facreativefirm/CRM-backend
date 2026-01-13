import { Router } from 'express';
import * as invoicesController from '../../controllers/invoices.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { invoiceSchema, paymentSchema } from '../../utils/validators';

const router = Router();

router.use(protect);

// Specific routes first
router.get('/transactions', invoicesController.getClientTransactions);
router.get('/', invoicesController.getInvoices);
router.get('/:id', invoicesController.getInvoice);

// Admin only: Create Invoice
router.post('/', restrictTo('ADMIN', 'SUPER_ADMIN' as any), invoicesController.createInvoice);

// Payment initialization
router.post('/pay', invoicesController.initializePayment);
router.post('/manual-payment', invoicesController.submitManualPayment);

router.post('/callback', invoicesController.handlePaymentCallback);

// Admin automation
router.post('/generate-due', restrictTo('ADMIN', 'SUPER_ADMIN' as any), invoicesController.generateDueInvoices);

// Admin: Update status & Delete
router.patch('/:id/status', restrictTo('ADMIN', 'SUPER_ADMIN' as any), invoicesController.updateInvoiceStatus);
router.delete('/:id', restrictTo('ADMIN', 'SUPER_ADMIN' as any), invoicesController.deleteInvoice);

export default router;
