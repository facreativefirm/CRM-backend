import { Router } from 'express';
import * as systemController from '../../controllers/system.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { systemSettingSchema, todoItemSchema, calendarEventSchema, whoisLookupSchema } from '../../utils/validators';
import { UserType } from '@prisma/client';

const router = Router();

router.use(protect);

// Activity Logs
router.get('/logs', systemController.getActivityLogs);

// System Settings (Admin only)
router.get('/settings', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), systemController.getSystemSettings);
router.post('/settings', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), validate(systemSettingSchema), systemController.updateSystemSetting);

// Todo Items (Staff)
router.get('/todos', systemController.getTodoItems);
router.post('/todos', validate(todoItemSchema), systemController.createTodoItem);

// Calendar Events
router.get('/calendar', systemController.getCalendarEvents);
router.post('/calendar', validate(calendarEventSchema), systemController.createCalendarEvent);

// WHOIS Lookup
router.post('/whois', validate(whoisLookupSchema), systemController.performWhoisLookup);

// Gateway Logs (Admin only)
router.get('/gateway-logs', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), systemController.getGatewayLogs);

// Domain Resolver & TLD Sync
router.post('/domain-resolver', systemController.performDomainResolver);
router.post('/sync-tlds', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN), systemController.syncTLDPricing);

export default router;
