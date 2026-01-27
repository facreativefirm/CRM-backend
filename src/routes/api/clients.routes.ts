import { Router } from 'express';
import * as clientsController from '../../controllers/clients.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { createClientSchema, updateClientSchema, createContactSchema } from '../../utils/validators';
import { UserType } from '@prisma/client';

const router = Router();

router.use(protect);

// Admin, Staff, and Resellers can interact with clients (Reseller is isolated in controller)
router.use(restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF, UserType.RESELLER));

router.get('/', clientsController.getClients);
router.post('/', validate(createClientSchema), clientsController.createClient);
router.post('/register', validate(createClientSchema), clientsController.createClient);
router.get('/:id', clientsController.getClient);
router.patch('/:id', validate(updateClientSchema), clientsController.updateClient);
router.post('/:id/send-renewal-notice', clientsController.sendConsolidatedRenewalNotice);

// Contact management
router.get('/:clientId/contacts', clientsController.getContacts);
router.post('/:clientId/contacts', validate(createContactSchema), clientsController.createContact);

export default router;
