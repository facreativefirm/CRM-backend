import { Router } from 'express';
import authRoutes from './auth.routes';
import clientRoutes from './api/clients.routes';
import userRoutes from './api/users.routes';
import clientGroupRoutes from './api/clientGroups.routes';
import customFieldRoutes from './api/customFields.routes';
import productRoutes from './api/products.routes';
import productServicesRoutes from './api/productServices.routes';
import orderRoutes from './api/orders.routes';
import invoiceRoutes from './api/invoices.routes';
import financeRoutes from './api/finance.routes';
import billableRoutes from './api/billable.routes';
import serviceRoutes from './api/services.routes'; // Client services
import serverRoutes from './api/servers.routes';
import supportRoutes from './api/support.routes';
import marketingRoutes from './api/marketing.routes';
import systemRoutes from './api/system.routes';
import reportRoutes from './api/reports.routes';
import resellerRoutes from './api/reseller.routes';
import domainRoutes from './api/domains.routes';
import securityRoutes from './api/security.routes';
import settingsRoutes from './api/settings.routes';
import notificationRoutes from './api/notification.routes';
import quoteRoutes from './api/quotes.routes';
import salesTeamRoutes from './api/salesTeam.routes';
import userApplicationRoutes from './api/userApplication.routes';
import investorRoutes from './investor.routes';
import guestSupportRoutes from './api/guestSupport.routes';
import integrationRoutes from './api/integration.routes';
import nagadRoutes from './api/nagad.routes';
import importExportRoutes from './api/importExport.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/clients', clientRoutes);
router.use('/users', userRoutes);
router.use('/client-groups', clientGroupRoutes);
router.use('/custom-fields', customFieldRoutes);
router.use('/products/services', productServicesRoutes);
router.use('/products', productRoutes);
router.use('/orders', orderRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/finance', financeRoutes);
router.use('/billable', billableRoutes);
router.use('/services', serviceRoutes);
router.use('/servers', serverRoutes);
router.use('/support', supportRoutes);
router.use('/marketing', marketingRoutes);
router.use('/system', systemRoutes);
router.use('/reports', reportRoutes);
router.use('/reseller', resellerRoutes);
router.use('/domains', domainRoutes);
router.use('/security', securityRoutes);
router.use('/settings', settingsRoutes);
router.use('/notifications', notificationRoutes);
router.use('/quotes', quoteRoutes);
router.use('/sales-team', salesTeamRoutes);
router.use('/user-applications', userApplicationRoutes);
router.use('/investor', investorRoutes);
router.use('/support-chat', guestSupportRoutes);
router.use('/guest-support', guestSupportRoutes);
router.use('/integration', integrationRoutes);
router.use('/payments/nagad', nagadRoutes);
router.use('/import-export', importExportRoutes);

export default router;





