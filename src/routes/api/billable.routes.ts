import { Router } from 'express';
import * as billableController from '../../controllers/billableItems.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { billableItemSchema } from '../../utils/validators';
import { UserType } from '@prisma/client';

const router = Router();

router.use(protect);

router.get('/billable-items', billableController.getBillableItems);
router.post('/billable-items', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), validate(billableItemSchema), billableController.createBillableItem);

router.get('/quotes', billableController.getQuotes);
router.post('/quotes', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), billableController.createQuote);

export default router;
