import { Router } from 'express';
import * as supportController from '../../controllers/support.controller';
import * as supportExtras from '../../controllers/supportExtras.controller';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { ticketSchema, replySchema, departmentSchema, predefinedReplySchema } from '../../utils/validators';
import { UserType } from '@prisma/client';

const router = Router();

router.use(protect);

// Support Tickets
router.get('/tickets', supportController.getTickets);
router.post('/tickets', validate(ticketSchema), supportController.openTicket);
router.get('/tickets/:id', supportController.getTicket);
router.post('/tickets/:id/reply', validate(replySchema), supportController.replyTicket);
router.post('/tickets/:id/presence', supportController.updateTicketPresence);
router.patch('/tickets/:id', supportController.updateTicket);

// Departments
router.get('/departments', supportExtras.getDepartments);
router.post('/departments', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), validate(departmentSchema), supportExtras.createDepartment);
router.patch('/departments/:id', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), validate(departmentSchema), supportExtras.updateDepartment);
router.delete('/departments/:id', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), supportExtras.deleteDepartment);

// Predefined Replies
router.get('/predefined-replies', supportExtras.getPredefinedReplies);
router.post('/predefined-replies', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), validate(predefinedReplySchema), supportExtras.createPredefinedReply);
router.patch('/predefined-replies/:id', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), validate(predefinedReplySchema), supportExtras.updatePredefinedReply);
router.delete('/predefined-replies/:id', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), supportExtras.deletePredefinedReply);

// Network Issues
router.get('/network-issues', supportExtras.getNetworkIssues);
router.post('/network-issues', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), supportExtras.createNetworkIssue);
router.patch('/network-issues/:id', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), supportExtras.updateNetworkIssue);
router.delete('/network-issues/:id', restrictTo(UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF), supportExtras.deleteNetworkIssue);

export default router;
