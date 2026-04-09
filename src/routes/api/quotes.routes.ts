import { Router } from 'express';
import * as quotesController from '../../controllers/quotes.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { UserType } from '@prisma/client';

const router = Router();

router.use(protect);

// Public-ish (Client & Admin)
router.get('/', quotesController.getQuotes);
router.get('/:id', quotesController.getQuote);

// Client Actions
router.post('/:id/accept', restrictTo(UserType.CLIENT), quotesController.acceptQuote);
router.post('/:id/reject', restrictTo(UserType.CLIENT), quotesController.rejectQuote);

// Admin Actions
router.post('/', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), quotesController.createQuote);
router.patch('/:id', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), quotesController.updateQuote);
router.post('/:id/send', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), quotesController.sendQuote);
router.delete('/:id', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), quotesController.deleteQuote);

export default router;
