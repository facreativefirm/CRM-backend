import { Router } from 'express';
import * as domainsController from '../../controllers/domains.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { UserType } from '@prisma/client';

import * as tldsController from '../../controllers/tlds.controller';
import { validate } from '../../middleware/validation.middleware';
import { updateDomainSchema, registerDomainSchema, tldSchema } from '../../utils/validators';

const router = Router();

router.use(protect);

// TLD Management (Admins Only)
router.get('/tlds', tldsController.getTLDs);
router.post('/tlds', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), validate(tldSchema), tldsController.createTLD);
router.patch('/tlds/:id', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), validate(tldSchema), tldsController.updateTLD);
router.delete('/tlds/:id', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), tldsController.deleteTLD);

// Individual Domains
router.get('/expiring', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), domainsController.getExpiringDomains);
router.post('/notify-all', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), domainsController.notifyAllExpiringDomains);
router.get('/:id', domainsController.getDomainDetails);
router.post('/:id/request-renewal', domainsController.requestDomainRenewal);
router.get('/', domainsController.getDomains);
router.post('/register', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), validate(registerDomainSchema), domainsController.registerDomain);
router.patch('/:id', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), validate(updateDomainSchema), domainsController.updateDomain);
router.post('/:id/renew', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), domainsController.renewDomain);
router.post('/:id/notify', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), domainsController.notifyDomainExpiration);

export default router;
