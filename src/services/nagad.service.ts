import axios from 'axios';
import cryptoService from './crypto.service';
import { getBangladeshDateTime } from '../utils/datetime.util';
import logger from '../utils/logger';
import prisma from '../config/database'; // Import prisma

interface NagadPaymentRequest {
    invoiceId: string;
    amount: number;
    orderId: string;
    customerMobile?: string;
    clientIp: string; // REQUIRED by Nagad
}

interface NagadInitResponse {
    orderId: string;
    paymentReferenceId?: string;
    challenge?: string;
    sensitiveData: string; // Encrypted response from Nagad
}

export class NagadService {
    // Legacy properties - kept for compatibility but overwritten dynamically
    private baseUrl: string;
    private merchantId: string;

    constructor() {
        this.merchantId = process.env.NAGAD_MERCHANT_ID || '';
        this.baseUrl = process.env.NAGAD_RUN_MODE === 'production'
            ? 'https://api.mynagad.com/api/dfs/'
            : 'https://sandbox-ssl.mynagad.com/api/dfs/';
    }

    /**
     * Get credentials dynamically from DB or Env
     */
    private async getCredentials() {
        try {
            const settings = await prisma.systemSetting.findMany({
                where: {
                    settingKey: {
                        in: ['nagadMerchantId', 'nagadPublicKey', 'nagadPrivateKey', 'nagadRunMode']
                    }
                }
            });

            const settingsMap = settings.reduce((acc: any, curr) => {
                acc[curr.settingKey] = curr.settingValue;
                return acc;
            }, {});

            const merchantId = settingsMap.nagadMerchantId || process.env.NAGAD_MERCHANT_ID || '';
            const publicKey = settingsMap.nagadPublicKey || process.env.NAGAD_PUBLIC_KEY || '';
            const privateKey = settingsMap.nagadPrivateKey || process.env.NAGAD_MERCHANT_PRIVATE_KEY || '';
            const runMode = settingsMap.nagadRunMode || process.env.NAGAD_RUN_MODE || 'sandbox';

            const baseUrl = runMode === 'production'
                ? 'https://api.mynagad.com/api/dfs/'
                : 'https://sandbox-ssl.mynagad.com/api/dfs/';

            return { merchantId, publicKey, privateKey, baseUrl };
        } catch (error) {
            logger.error('Failed to fetch Nagad credentials from DB, falling back to ENV', error);
            // Fallback
            return {
                merchantId: this.merchantId,
                publicKey: process.env.NAGAD_PUBLIC_KEY || '',
                privateKey: process.env.NAGAD_MERCHANT_PRIVATE_KEY || '',
                baseUrl: this.baseUrl
            };
        }
    }

    /**
     * Step 1: Initialize Payment
     * Based on official Nagad plugin implementation
     */
    async initializePayment(data: NagadPaymentRequest): Promise<NagadInitResponse> {
        const { merchantId, publicKey, privateKey, baseUrl } = await this.getCredentials();

        // Generate order ID within Nagad's 20-character limit
        // Format: INV{invoiceId}{4digits} (e.g., INV1234567) - Strictly alphanumeric
        // This ensures we stay under 20 chars even for large invoice IDs
        const orderIdWithSuffix = `INV${data.invoiceId}${cryptoService.generateOrderSuffix()}`;

        if (orderIdWithSuffix.length > 20) {
            // If still too long, use just invoice ID + suffix
            const shortOrderId = `${data.invoiceId}${cryptoService.generateOrderSuffix()}`;
            logger.warn(`Order ID too long, using short format: ${shortOrderId}`);
            return this.initializePaymentWithOrderId(data, shortOrderId, merchantId, publicKey, privateKey, baseUrl);
        }

        return this.initializePaymentWithOrderId(data, orderIdWithSuffix, merchantId, publicKey, privateKey, baseUrl);
    }

    /**
     * Internal method to initialize payment with a specific order ID
     */
    private async initializePaymentWithOrderId(
        data: NagadPaymentRequest,
        orderIdWithSuffix: string,
        merchantId: string,
        publicKey: string,
        privateKey: string,
        baseUrl: string
    ): Promise<NagadInitResponse> {
        const timestamp = getBangladeshDateTime();

        // Sensitive data to encrypt
        const sensitiveData = {
            merchantId: merchantId,
            datetime: timestamp,
            orderId: orderIdWithSuffix,
            challenge: cryptoService.generateRandomString(40)
        };

        // Prepare request payload
        const postData = {
            dateTime: timestamp,
            sensitiveData: cryptoService.encryptWithPublicKey(JSON.stringify(sensitiveData), publicKey),
            signature: cryptoService.signData(JSON.stringify(sensitiveData), privateKey)
        };

        try {
            logger.info(`Initializing Nagad payment for Order: ${orderIdWithSuffix}`);

            const response = await axios.post(
                `${baseUrl}check-out/initialize/${merchantId}/${orderIdWithSuffix}?locale=EN`,
                postData,
                {
                    headers: this.getHeaders(data.clientIp),
                    timeout: 30000
                }
            );

            logger.info('Nagad initialization successful');

            return {
                orderId: orderIdWithSuffix,
                sensitiveData: response.data.sensitiveData // This contains encrypted paymentReferenceId and challenge
            };
        } catch (error: any) {
            const errorData = error.response?.data ? JSON.stringify(error.response.data) : error.message;
            logger.error(`Nagad initialization failed: ${errorData}`);
            throw new Error(error.response?.data?.message || 'Nagad initialization failed');
        }
    }

    /**
     * Step 2: Complete Payment
     * Based on official Nagad plugin implementation
     */
    async completePayment(
        amount: number,
        orderId: string,
        sensitiveDataFromInit: string,
        originalOrderNo: string,
        clientIp: string
    ) {
        const { merchantId, publicKey, privateKey, baseUrl } = await this.getCredentials();

        try {
            // Decrypt the sensitiveData from Step 1 to get the challenge
            logger.debug(`Decrypting Step 1 sensitiveData. Length: ${sensitiveDataFromInit?.length}`);
            logger.debug(`Data content (first 50 chars): ${sensitiveDataFromInit?.substring(0, 50)}`);

            const decryptedData = JSON.parse(cryptoService.decryptWithPrivateKey(sensitiveDataFromInit, privateKey));

            if (!decryptedData.paymentReferenceId || !decryptedData.challenge) {
                throw new Error('Invalid response from initialization step');
            }

            const merchantCallbackURL = `${process.env.FRONTEND_URL}/payment/nagad-callback`;

            // Prepare sensitive data for Step 2 (using challenge from Step 1)
            const orderSensitiveData = {
                merchantId: merchantId,
                orderId: orderId,
                currencyCode: '050', // BDT
                amount: amount.toFixed(2),
                challenge: decryptedData.challenge // IMPORTANT: Reuse challenge from Step 1
            };

            // Prepare request payload
            const postData = {
                sensitiveData: cryptoService.encryptWithPublicKey(JSON.stringify(orderSensitiveData), publicKey),
                signature: cryptoService.signData(JSON.stringify(orderSensitiveData), privateKey),
                merchantCallbackURL: merchantCallbackURL,
                additionalMerchantInfo: {
                    order_no: originalOrderNo,
                    serviceLogoURL: process.env.BRAND_LOGO_URL || ''
                }
            };

            logger.info(`Completing Nagad payment for Ref: ${decryptedData.paymentReferenceId}`);

            const response = await axios.post(
                `${baseUrl}check-out/complete/${decryptedData.paymentReferenceId}`,
                postData,
                {
                    headers: this.getHeaders(clientIp),
                    timeout: 30000
                }
            );

            logger.info('Nagad completion successful');

            return {
                ...response.data,
                paymentReferenceId: decryptedData.paymentReferenceId
            };
        } catch (error: any) {
            const errorData = error.response?.data ? JSON.stringify(error.response.data) : error.message;
            logger.error(`Nagad completion failed: ${errorData}`);
            throw new Error(error.response?.data?.message || 'Nagad completion failed');
        }
    }

    /**
     * Step 3: Verify Payment
     * Based on official Nagad plugin implementation
     */
    async verifyPayment(paymentReferenceId: string) {
        const { baseUrl } = await this.getCredentials();

        try {
            logger.info(`Verifying Nagad payment for Ref: ${paymentReferenceId}`);

            const response = await axios.get(
                `${baseUrl}verify/payment/${paymentReferenceId}`,
                {
                    headers: {
                        'X-KM-Api-Version': 'v-0.2.0'
                    },
                    timeout: 30000
                }
            );

            logger.info('Nagad verification successful');

            return response.data;
        } catch (error: any) {
            const errorData = error.response?.data ? JSON.stringify(error.response.data) : error.message;
            logger.error(`Nagad verification failed: ${errorData}`);
            throw new Error(error.response?.data?.message || 'Nagad verification failed');
        }
    }

    /**
     * Get headers required by Nagad API
     * Based on official plugin
     */
    private getHeaders(clientIp: string) {
        return {
            'Content-Type': 'application/json',
            'X-KM-Api-Version': 'v-0.2.0',
            'X-KM-IP-V4': clientIp, // CRITICAL: Must be actual client IP
            'X-KM-Client-Type': 'PC_WEB'
        };
    }
}

export default new NagadService();
