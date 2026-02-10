// import axios from 'axios';
import logger from '../utils/logger';
import { AppError } from '../middleware/error.middleware';

/**
 * Payment Gateway Integration Service
 * Focus: bKash & Nagad (Bangladesh)
 */

export class PaymentGatewayService {
    /**
     * bKash Payment Initialization
     */
    static async initBKashPayment(amount: number, invoiceId: string) {
        logger.info(`Initializing bKash payment for Invoice: ${invoiceId}, Amount: ${amount}`);

        try {
            const bkashService = (await import('./bkash.service')).default;
            const backendBaseUrl = process.env.BACKEND_URL || 'http://localhost:3006';
            const callbackUrl = `${backendBaseUrl}/api/bkash/callback`;

            logger.debug(`bKash Generated Callback URL (GatewayService): ${callbackUrl}`);

            const result = await bkashService.createPayment({
                amount,
                invoiceId,
                callbackUrl
            });

            return {
                status: 'success',
                gateway: 'BKASH',
                redirectURL: result.bkashURL,
                paymentID: result.paymentID
            };
        } catch (error: any) {
            logger.error('bKash Initialization failed', error);
            throw new AppError(error.message || 'bKash gateway unavailable', 503);
        }
    }

    /**
     * Nagad Payment Initialization
     */
    static async initNagadPayment(amount: number, invoiceId: string) {
        logger.info(`Initializing Nagad payment for Invoice: ${invoiceId}, Amount: ${amount}`);

        try {
            const nagadService = (await import('./nagad.service')).default;

            // Get client IP from request context (you may need to pass this from controller)
            const clientIp = '103.191.240.1'; // Default Bangladesh IP for now

            const result = await nagadService.initializePayment({
                invoiceId,
                amount,
                orderId: invoiceId,
                clientIp
            });

            return {
                status: 'success',
                gateway: 'NAGAD',
                orderId: result.orderId,
                sensitiveData: result.sensitiveData,
                paymentReferenceId: result.paymentReferenceId
            };
        } catch (error: any) {
            logger.error('Nagad payment initiation error:', error);
            throw new AppError(error.message || 'Nagad payment initialization failed', 500);
        }
    }

    /**
     * Verify bKash Payment
     */
    static async verifyBKashPayment(paymentID: string) {
        // In production, call bKash Execute/Capture API
        return {
            status: 'Completed',
            trxID: `TRX-${paymentID.split('-')[1]}`,
            amount: 100, // actual amount from response
        };
    }
}
