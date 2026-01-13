import { Router } from 'express';
import * as usersController from '../../controllers/users.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { updateUserSchema } from '../../utils/validators';
import { UserType } from '@prisma/client';

const router = Router();

// All routes here protected and restricted to Admin/Staff
router.use(protect);
router.use(restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF));

router.get('/', usersController.getUsers);
router.get('/:id', usersController.getUser);
router.patch('/:id', validate(updateUserSchema), usersController.updateUser);
router.delete('/:id', usersController.deleteUser);

export default router;
