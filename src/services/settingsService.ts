import prisma from '../config/database';

export const getSetting = async (key: string, defaultValue: string = ''): Promise<string> => {
    try {
        const setting = await prisma.systemSetting.findUnique({
            where: { settingKey: key }
        });
        return setting?.settingValue ?? defaultValue;
    } catch (error) {
        return defaultValue;
    }
};

export const getTaxRate = async (): Promise<number> => {
    // Default to 5% if not set, to match legacy behavior and ensure tax is applied
    const rateStr = await getSetting('taxRate', '0');
    const rate = parseFloat(rateStr);
    return isNaN(rate) ? 0.05 : rate / 100;
};

export const getTaxName = async (): Promise<string> => {
    return await getSetting('taxName', 'Tax');
};

export const getCurrency = async (): Promise<string> => {
    return await getSetting('defaultCurrency', 'USD');
};

export const getCurrencySymbol = async (): Promise<string> => {
    const code = await getCurrency();
    const symbols: Record<string, string> = {
        'BDT': 'TK ',
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'INR': '₹'
    };
    return symbols[code] || code;
};
