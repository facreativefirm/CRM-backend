import cron from 'node-cron';
import prisma from '../config/database';
import { UserType } from '@prisma/client';
import { sendEmail, EmailTemplates } from './email.service';
import * as invoiceService from './invoiceService';
import * as notificationService from './notificationService';

/**
 * Initialize all cron jobs
 */
export const initCronJobs = () => {
    console.log('Initializing background tasks...');

    // 1. Daily Expiration & Renewal Check (Runs every day at midnight)
    cron.schedule('0 0 * * *', async () => {
        console.log('Running daily expiration and renewal check...');
        await checkExpirations();
    });

    // 2. Daily Recurring Invoice Generation for due items (Runs every day at 1 AM)
    cron.schedule('0 1 * * *', async () => {
        console.log('Running recurring invoice generation for due items...');
        await invoiceService.generateRecurringInvoices();
    });
};

/**
 * Combined check for services and domains expiring soon
 */
export const checkExpirations = async () => {
    await checkServiceExpirations();
    await checkDomainExpirations();
};

const checkServiceExpirations = async () => {
    const today = new Date();

    // Fetch all active services
    const services = await prisma.service.findMany({
        where: { status: 'ACTIVE' },
        include: {
            client: { include: { user: true } },
            product: true
        }
    });

    for (const service of services) {
        if (!service.nextDueDate) continue;

        const diffTime = service.nextDueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const cycle = (service.billingCycle || 'monthly').toLowerCase();
        let shouldNotify = false;
        let alertLevel = 0;

        if (cycle === 'monthly' && diffDays <= 7 && diffDays > 0) {
            alertLevel = 7;
            shouldNotify = true;
        } else if (cycle !== 'monthly' && diffDays <= 30 && diffDays > 0) {
            // Treat non-monthly (Quarterly/Annual) as "Annual" logic (30 days)
            alertLevel = 30;
            shouldNotify = true;
        }

        if (shouldNotify) {
            // Check if we already notified for this alertLevel
            const alreadyNotified = await (prisma as any).expiryNotificationRecord.findFirst({
                where: {
                    serviceId: service.id,
                    daysToExpiry: alertLevel,
                    sentAt: { gte: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) } // Only once per 10 days
                }
            });

            if (!alreadyNotified) {
                await processRenewalAction('SERVICE', service, alertLevel, diffDays);
            }
        }
    }
};

const checkDomainExpirations = async () => {
    const today = new Date();

    const domains = await prisma.domain.findMany({
        where: { status: 'ACTIVE' },
        include: { client: { include: { user: true } } }
    });

    for (const domain of domains) {
        const diffTime = domain.expiryDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Domains are usually annual or multi-year
        if (diffDays <= 30 && diffDays > 0) {
            const alreadyNotified = await (prisma as any).expiryNotificationRecord.findFirst({
                where: {
                    domainId: domain.id,
                    daysToExpiry: 30,
                    sentAt: { gte: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) } // Only once per 20 days
                }
            });

            if (!alreadyNotified) {
                await processRenewalAction('DOMAIN', domain, 30, diffDays);
            }
        }
    }
};

/**
 * Handle Invoice creation, Email sending and Record logging
 */
const processRenewalAction = async (type: 'SERVICE' | 'DOMAIN', item: any, alertLevel: number, exactDays: number) => {
    try {
        console.log(`Processing renewal action for ${type} ID: ${item.id} (${exactDays} days left)`);

        // 1. Create Invoice
        const invoice = await invoiceService.createRenewalInvoice(type, item.id);

        const itemName = type === 'SERVICE' ? item.product.name : item.domainName;
        const clientName = `${item.client.user.firstName} ${item.client.user.lastName}`;
        const expiryDateStr = (type === 'SERVICE' ? item.nextDueDate : item.expiryDate).toLocaleDateString();

        // 2. Client Notifications
        // Email
        const clientEmail = EmailTemplates.serviceExpirationReminder(itemName, expiryDateStr, exactDays);
        await sendEmail(item.client.user.email, clientEmail.subject, clientEmail.body);

        // In-App
        await notificationService.createNotification(
            item.client.userId,
            'WARNING',
            `Renewal Notice: ${itemName}`,
            `Your ${type.toLowerCase()} is expiring on ${expiryDateStr}. An invoice (#${invoice.invoiceNumber}) has been generated.`,
            type === 'SERVICE' ? `/services/${item.id}` : `/domains/${item.id}`
        );

        // 3. Admin Notifications (Email Only)
        const adminEmail = EmailTemplates.expiryAdminNotification(itemName, clientName, exactDays, type);

        const admins = await prisma.user.findMany({
            where: {
                userType: { in: [UserType.ADMIN, UserType.SUPER_ADMIN, UserType.STAFF] }
            },
            select: { email: true }
        });

        for (const admin of admins) {
            await sendEmail(admin.email, adminEmail.subject, adminEmail.body);
        }

        // 4. Record the notification
        await (prisma as any).expiryNotificationRecord.create({
            data: {
                userId: item.client.user.id,
                serviceId: type === 'SERVICE' ? item.id : undefined,
                domainId: type === 'DOMAIN' ? item.id : undefined,
                notificationType: 'EXPIRY_WARNING',
                daysToExpiry: alertLevel,
            }
        });

    } catch (err) {
        console.error(`Error in processRenewalAction for ${type} ${item.id}:`, err);
    }
};
