
import { Router } from 'express';
import { protect } from '../../middleware/auth.middleware';
import * as notificationController from '../../controllers/notification.controller';

const router = Router();

router.use(protect);

router.get('/', notificationController.getMyNotifications);
router.post('/:id/read', notificationController.markRead);
router.post('/read-all', notificationController.markAllRead);

export default router;
