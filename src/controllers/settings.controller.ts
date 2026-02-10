import { Request, Response } from 'express';
import prisma from '../config/database';
import encryptionService from '../services/encryption.service';
import logger from '../utils/logger';

export const getSettings = async (req: Request, res: Response) => {
    const settings = await prisma.systemSetting.findMany();

    // Sensitive fields that should never be sent to client
    const sensitiveFields = [
        'bkashAppSecret',
        'bkashPassword',
        'nagadPrivateKey',
        'nagadPublicKey',
        'smtpPass'
    ];

    // Transform to object and mask sensitive fields
    const settingsObj = settings.reduce((acc: any, curr) => {
        if (sensitiveFields.includes(curr.settingKey)) {
            // Mask sensitive values - show only last 4 characters
            const value = curr.settingValue || '';
            acc[curr.settingKey] = '••••••••' + (value.length > 4 ? value.slice(-4) : '');
        } else {
            acc[curr.settingKey] = curr.settingValue;
        }
        return acc;
    }, {});

    res.status(200).json({ status: 'success', data: { settings: settingsObj } });
};

export const updateSettings = async (req: Request, res: Response) => {
    const settings = req.body;

    // Sensitive fields that need encryption
    const sensitiveFields = [
        'bkashAppSecret',
        'bkashPassword',
        'nagadPrivateKey',
        'nagadPublicKey',
        'smtpPass'
    ];

    const updates = Object.keys(settings).map(key => {
        let group = 'general';
        if (key.startsWith('bkash')) group = 'BKASH';
        else if (key.startsWith('nagad')) group = 'NAGAD';
        else if (key.startsWith('smtp')) group = 'MAIL';

        let valueToStore = settings[key];

        // Encrypt sensitive fields
        if (sensitiveFields.includes(key)) {
            try {
                // Skip if value is masked (not being updated)
                if (valueToStore && valueToStore.startsWith('••••••••')) {
                    logger.debug(`Skipping update for masked field: ${key}`);
                    return Promise.resolve(); // Don't update masked values
                }

                // Encrypt the value
                if (valueToStore && valueToStore.trim() !== '') {
                    valueToStore = encryptionService.encrypt(valueToStore);
                    logger.info(`✅ Encrypted ${key} before saving`);
                }
            } catch (error: any) {
                logger.error(`Failed to encrypt ${key}:`, error.message);
                throw new Error(`Failed to encrypt ${key}. Please check ENCRYPTION_KEY.`);
            }
        }

        const isSensitive = sensitiveFields.includes(key);

        return prisma.systemSetting.upsert({
            where: { settingKey: key },
            update: {
                settingValue: valueToStore,
                encrypted: isSensitive && valueToStore && !valueToStore.startsWith('••••••••')
            },
            create: {
                settingKey: key,
                settingValue: valueToStore,
                settingGroup: group,
                encrypted: isSensitive
            }
        });
    });

    await Promise.all(updates.filter(Boolean)); // Filter out undefined promises

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
