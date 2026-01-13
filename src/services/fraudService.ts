import logger from '../utils/logger';

export interface FraudCheckResult {
    isFraud: boolean;
    score: number;
    reason?: string;
}

/**
 * Basic fraud detection service
 * Placeholder for MaxMind or similar integration
 */
export const checkOrderFraud = async (orderData: any): Promise<FraudCheckResult> => {
    logger.info(`Performing fraud check for order: ${orderData.orderNumber}`);

    // Basic rules
    // 1. Check for suspicious emails
    const suspiciousEmails = ['proxy', 'test', 'fake'];
    if (suspiciousEmails.some(s => orderData.email.includes(s))) {
        return { isFraud: true, score: 90, reason: 'Suspicious email address' };
    }

    // 2. Mock success
    return { isFraud: false, score: 5, reason: 'Order appears legitimate' };
};
