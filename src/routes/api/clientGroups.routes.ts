import { Router } from 'express';
import * as groupController from '../../controllers/clientGroups.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { groupSchema } from '../../utils/validators';
import { UserType } from '@prisma/client';

const router = Router();

router.use(protect);
router.use(restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF));

router.get('/', groupController.getGroups);
router.post('/', validate(groupSchema), groupController.createGroup);
router.patch('/:id', validate(groupSchema), groupController.updateGroup);
router.delete('/:id', groupController.deleteGroup);

export default router;
