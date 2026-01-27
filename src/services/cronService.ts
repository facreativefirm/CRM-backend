import cron from 'node-cron';
import prisma from '../config/database';
import { UserType } from '@prisma/client';
import { sendEmail, EmailTemplates } from './email.service';
import * as invoiceService from './invoiceService';
import * as notificationService from './notificationService';

import logger from '../utils/logger';

/**
 * Initialize all cron jobs
 */
export const initCronJobs = () => {
    logger.info('Initializing background tasks...');

    // 1. Daily Expiration & Renewal Check (Runs every day at midnight)
    cron.schedule('0 0 * * *', async () => {
        logger.info('Running daily consolidated expiration and renewal check...');
        await checkExpirationsConsolidated();
    });

    // 2. Daily Recurring Invoice Generation for due items (Runs every day at 1 AM)
    cron.schedule('0 1 * * *', async () => {
        logger.info('Running recurring invoice generation for due items...');
        await invoiceService.generateRecurringInvoices();
    });

    // 3. Batched Prospect Notifications (Runs 4 times daily: 6 AM, 12 PM, 6 PM, 12 AM)
    cron.schedule('0 0,6,12,18 * * *', async () => {
        logger.info('Running batched prospect notification check...');
        await checkNewProspects();
    });

    // 4. Guest Activity Cleanup (Runs daily at 2 AM)
    cron.schedule('0 2 * * *', async () => {
        logger.info('Running guest activity cleanup and data purge...');
        const { cleanupExpiredGuestActivities, purgeOldGuestData } = await import('../controllers/guestSupport.controller');
        await cleanupExpiredGuestActivities();
        await purgeOldGuestData();
    });
};

/**
 * Consolidated check for services and domains expiring soon.
 * Groups items by client and generates one invoice per client.
 */
export const checkExpirationsConsolidated = async () => {
    try {
        const today = new Date();
        const clientItemsToRenew: Map<number, { type: 'SERVICE' | 'DOMAIN', itemId: number, name: string, expiryDate: string, daysLeft: number, alertLevel: number }[]> = new Map();

        // 1. Scan Services
        const services = await prisma.service.findMany({
            where: { status: 'ACTIVE' },
            include: { client: { include: { user: true } }, product: true }
        });

        for (const service of services) {
            if (!service.nextDueDate) continue;
            const diffDays = Math.ceil((service.nextDueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            const cycle = (service.billingCycle || 'monthly').toLowerCase();

            let alertLevel = 0;
            if (cycle === 'monthly' && diffDays <= 7 && diffDays > 0) alertLevel = 7;
            else if (cycle !== 'monthly' && diffDays <= 30 && diffDays > 0) alertLevel = 30;

            if (alertLevel > 0) {
                const alreadyNotified = await (prisma as any).expiryNotificationRecord.findFirst({
                    where: {
                        serviceId: service.id,
                        daysToExpiry: alertLevel,
                        sentAt: { gte: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) }
                    }
                });

                if (!alreadyNotified) {
                    if (!clientItemsToRenew.has(service.clientId)) clientItemsToRenew.set(service.clientId, []);
                    clientItemsToRenew.get(service.clientId)!.push({
                        type: 'SERVICE',
                        itemId: service.id,
                        name: service.product.name,
                        expiryDate: service.nextDueDate.toLocaleDateString(),
                        daysLeft: diffDays,
                        alertLevel
                    });
                }
            }
        }

        // 2. Scan Domains
        const domains = await prisma.domain.findMany({
            where: { status: 'ACTIVE' },
            include: { client: { include: { user: true } } }
        });

        for (const domain of domains) {
            const diffDays = Math.ceil((domain.expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays <= 30 && diffDays > 0) {
                const alreadyNotified = await (prisma as any).expiryNotificationRecord.findFirst({
                    where: {
                        domainId: domain.id,
                        daysToExpiry: 30,
                        sentAt: { gte: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) }
                    }
                });

                if (!alreadyNotified) {
                    if (!clientItemsToRenew.has(domain.clientId)) clientItemsToRenew.set(domain.clientId, []);
                    clientItemsToRenew.get(domain.clientId)!.push({
                        type: 'DOMAIN',
                        itemId: domain.id,
                        name: domain.domainName,
                        expiryDate: domain.expiryDate.toLocaleDateString(),
                        daysLeft: diffDays,
                        alertLevel: 30
                    });
                }
            }
        }

        // 3. Process each client's bundle
        for (const [clientId, items] of clientItemsToRenew.entries()) {
            // This service call now handles merging, due date extension, and immediate consolidated notification
            const invoice = await invoiceService.createConsolidatedRenewalInvoice(clientId, items.map(i => ({ type: i.type, itemId: i.itemId })));

            if (invoice) {
                // Record each notification for audit/tracking purposes
                for (const item of items) {
                    await (prisma as any).expiryNotificationRecord.create({
                        data: {
                            userId: invoice.client.userId,
                            serviceId: item.type === 'SERVICE' ? item.itemId : undefined,
                            domainId: item.type === 'DOMAIN' ? item.itemId : undefined,
                            notificationType: 'EXPIRY_WARNING',
                            daysToExpiry: item.alertLevel,
                        }
                    });
                }

                logger.info(`Automated consolidated renewal processed for client ID: ${clientId} (${items.length} items).`);
            }
        }

    } catch (err) {
        logger.error(`Error in checkExpirationsConsolidated: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
};

/**
 * Handle Invoice creation, Email sending and Record logging
 */
export const checkExpirations = async () => {
    // Keep it for backward compatibility or direct calls
    await checkExpirationsConsolidated();
};

/**
 * Check for new prospects added since last notification batch
 * Runs 4 times daily (every 6 hours)
 */
const checkNewProspects = async () => {
    try {
        // Calculate time window (6 hours ago)
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

        // Find prospects created in the last 6 hours that are still PENDING verification
        const newProspects = await prisma.prospectClient.findMany({
            where: {
                createdAt: {
                    gte: sixHoursAgo
                },
                verificationStatus: 'PENDING' // Only notify about prospects awaiting verification
            },
            include: {
                salesMember: {
                    include: {
                        user: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // Only notify if there are new prospects
        if (newProspects.length === 0) {
            logger.info('No new prospects in the last 6 hours.');
            return;
        }

        logger.info(`Found ${newProspects.length} new prospect(s) in the last 6 hours.`);

        // Group prospects by sales member for better reporting
        const prospectsBySalesMember = newProspects.reduce((acc: any, prospect) => {
            const memberName = `${prospect.salesMember.user.firstName} ${prospect.salesMember.user.lastName}`;
            if (!acc[memberName]) {
                acc[memberName] = [];
            }
            acc[memberName].push(prospect);
            return acc;
        }, {});

        // Create summary message
        let summaryMessage = `${newProspects.length} new prospect(s) awaiting verification:\n\n`;

        for (const [memberName, prospects] of Object.entries(prospectsBySalesMember)) {
            const prospectList = prospects as any[];
            summaryMessage += `${memberName}: ${prospectList.length} prospect(s)\n`;
            prospectList.forEach((p: any) => {
                summaryMessage += `  • ${p.companyName} (${p.email})\n`;
            });
            summaryMessage += '\n';
        }

        // Send consolidated notification to admins
        await notificationService.broadcastToAdmins(
            'INFO',
            `New Prospects Awaiting Verification`,
            summaryMessage,
            '/admin/sales-team/verifications'
        );

        logger.info('Batched prospect notification sent to admins.');

    } catch (err) {
        logger.error(`Error in checkNewProspects: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
};
