import { Router } from 'express';
import * as serversController from '../../controllers/servers.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { serverSchema } from '../../utils/validators';
import { UserType } from '@prisma/client';

const router = Router();

router.use(protect);
router.use(restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF));

router.get('/', serversController.getServers);
router.post('/', validate(serverSchema), serversController.createServer);
router.patch('/:id', validate(serverSchema), serversController.updateServer);
router.delete('/:id', serversController.deleteServer);

export default router;
