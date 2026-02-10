import { Request, Response } from 'express';
import prisma from '../config/database';

export const getSettings = async (req: Request, res: Response) => {
    const settings = await prisma.systemSetting.findMany();
    // Transform to object
    const settingsObj = settings.reduce((acc: any, curr) => {
        acc[curr.settingKey] = curr.settingValue;
        return acc;
    }, {});

    res.status(200).json({ status: 'success', data: { settings: settingsObj } });
};

export const updateSettings = async (req: Request, res: Response) => {
    const settings = req.body;

    const updates = Object.keys(settings).map(key => {
        let group = 'general';
        if (key.startsWith('bkash')) group = 'BKASH';
        else if (key.startsWith('nagad')) group = 'NAGAD';
        else if (key.startsWith('smtp')) group = 'MAIL';

        return prisma.systemSetting.upsert({
            where: { settingKey: key },
            update: { settingValue: settings[key] },
            create: { settingKey: key, settingValue: settings[key], settingGroup: group }
        });
    });

    await Promise.all(updates);

    res.status(200).json({ status: 'success', message: 'Settings updated' });
};

export const getPublicSettings = async (req: Request, res: Response) => {
    try {
        const settings = await prisma.systemSetting.findMany();
        const safeKeys = [
            'appName',
            'supportEmail',
            'maintenanceMode',
            'defaultLanguage',
            'defaultCurrency',
            'phoneNumber',
            'taxRate',
            'taxName',
            'companyAddress'
        ];

        const settingsObj = settings.reduce((acc: any, curr) => {
            if (safeKeys.includes(curr.settingKey)) {
                acc[curr.settingKey] = curr.settingValue;
            }
            return acc;
        }, {});

        res.status(200).json({ status: 'success', data: { settings: settingsObj } });
    } catch (err: any) {
        console.error('Error in getPublicSettings:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
};
