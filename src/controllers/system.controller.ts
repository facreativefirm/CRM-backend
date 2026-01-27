import { Request, Response } from 'express';
import dns from 'dns';
import { promisify } from 'util';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { UserType, Prisma } from '@prisma/client';
import axios from 'axios';

/**
 * Activity Logging
 */
export const getActivityLogs = async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const { userId, activity } = req.query;

    const logs = await prisma.activityLog.findMany({
        where: {
            ...(userId && { userId: parseInt(userId as string) }),
            ...(activity && { activity: { contains: activity as string } }),
        },
        include: { user: true },
        orderBy: { timestamp: 'desc' },
        take: 100
    });

    res.status(200).json({
        status: 'success',
        data: { logs },
    });
};

/**
 * System Settings
 */
export const getSystemSettings = async (req: Request, res: Response) => {
    const settings = await prisma.systemSetting.findMany();
    res.status(200).json({
        status: 'success',
        data: { settings },
    });
};

export const updateSystemSetting = async (req: Request, res: Response) => {
    const { settingKey, settingValue } = req.body;

    const setting = await prisma.systemSetting.upsert({
        where: { settingKey },
        update: { settingValue },
        create: {
            settingKey,
            settingValue,
            settingGroup: req.body.settingGroup || 'GENERAL'
        },
    });

    res.status(200).json({
        status: 'success',
        data: { setting },
    });
};

/**
 * Audit Log Helper (Not an endpoint, but for service usage)
 */
export const logActivity = async (data: { userId: number, activity: string, details?: string, ipAddress?: string }) => {
    await prisma.activityLog.create({
        data: {
            ...data,
            timestamp: new Date(),
        }
    });
};

/**
 * Todo Items for Staff
 */
export const getTodoItems = async (req: AuthRequest, res: Response) => {
    const staff = await prisma.staff.findUnique({ where: { userId: req.user!.id } });
    if (!staff) throw new AppError('Staff profile not found', 404);

    const items = await prisma.todoItem.findMany({
        where: { staffId: staff.id },
        orderBy: { dueDate: 'asc' }
    });

    res.status(200).json({ status: 'success', data: { items } });
};

export const createTodoItem = async (req: AuthRequest, res: Response) => {
    const staff = await prisma.staff.findUnique({ where: { userId: req.user!.id } });
    if (!staff) throw new AppError('Staff profile not found', 404);

    const item = await prisma.todoItem.create({
        data: {
            ...req.body,
            staffId: staff.id
        }
    });

    res.status(201).json({ status: 'success', data: { item } });
};

/**
 * Calendar Events
 */
export const getCalendarEvents = async (req: AuthRequest, res: Response) => {
    const events = await prisma.calendarEvent.findMany({
        where: { createdById: req.user!.id },
        orderBy: { startDate: 'asc' }
    });
    res.status(200).json({ status: 'success', data: { events } });
};

export const createCalendarEvent = async (req: AuthRequest, res: Response) => {
    const event = await prisma.calendarEvent.create({
        data: {
            ...req.body,
            createdById: req.user!.id
        }
    });
    res.status(201).json({ status: 'success', data: { event } });
};

/**
 * WHOIS Lookup Integration
 */
export const performWhoisLookup = async (req: AuthRequest, res: Response) => {
    const { domain } = req.body;

    try {
        // Use RDAP.org for structured JSON data (Free & Standard)
        const response = await axios.get(`https://rdap.org/domain/${domain}`, {
            headers: {
                'User-Agent': 'WHMCS-Fusion/1.0'
            },
            validateStatus: (status) => status < 500 // Accept 404 to handle "not found" gracefully
        });

        const result = JSON.stringify(response.data, null, 2);

        // Async log (don't await to speed up response)
        prisma.whoisLog.create({
            data: {
                domain,
                userId: req.user!.id,
                result: result.substring(0, 5000), // Limit size for DB
            }
        }).catch(err => console.error("Failed to log whois:", err));

        res.status(200).json({ status: 'success', data: { result } });
    } catch (error: any) {
        console.error('WHOIS Lookup error:', error.message);
        const message = error.response?.data?.title || error.message;
        res.status(500).json({ status: 'error', message: 'WHOIS lookup failed: ' + message });
    }
};

/**
 * Gateway Logs (Admin Only)
 */
export const getGatewayLogs = async (req: Request, res: Response) => {
    const logs = await prisma.gatewayLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: 50
    });
    res.status(200).json({ status: 'success', data: { logs } });
};

const resolveAny = promisify(dns.resolveAny);

/**
 * Domain Resolver (DNS Lookup)
 */
export const performDomainResolver = async (req: Request, res: Response) => {
    const { domain } = req.body;
    if (!domain) throw new AppError('Domain is required', 400);

    try {
        const records = await resolveAny(domain);
        res.status(200).json({ status: 'success', data: { records } });
    } catch (err: any) {
        res.status(200).json({ status: 'success', data: { records: [], error: err.message } });
    }
};

/**
 * TLD Pricing Sync
 */
export const syncTLDPricing = async (req: Request, res: Response) => {
    // Mocking a fetch from a registrar API
    const mockTLDs = [
        { tld: '.com', registrationPrice: 12.99, renewalPrice: 12.99, transferPrice: 12.99 },
        { tld: '.net', registrationPrice: 10.99, renewalPrice: 10.99, transferPrice: 10.99 },
        { tld: '.org', registrationPrice: 14.99, renewalPrice: 14.99, transferPrice: 14.99 },
        { tld: '.io', registrationPrice: 39.99, renewalPrice: 39.99, transferPrice: 39.99 },
    ];

    for (const tldData of mockTLDs) {
        await (prisma as any).domainTLD.upsert({
            where: { tld: tldData.tld },
            update: tldData,
            create: tldData
        });
    }

    res.status(200).json({ status: 'success', message: 'TLD pricing synced successfully' });
};

/**
 * Force run the automated cron job tasks (Admin Only)
 */
export const runCronJob = async (req: Request, res: Response) => {
    try {
        const { checkExpirations } = await import('../services/cronService');
        await checkExpirations();
        res.status(200).json({ status: 'success', message: 'Automated cron job tasks executed successfully.' });
    } catch (err: any) {
        console.error('Manual cron trigger failure:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
};
