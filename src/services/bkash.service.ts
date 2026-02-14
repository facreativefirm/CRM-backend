import axios from 'axios';
import logger from '../utils/logger';
import prisma from '../config/database';
import encryptionService from './encryption.service';

interface BkashCredentials {
    appKey: string;
    appSecret: string;
    username: string;
    password: string;
    baseUrl: string;
    isTokenized: boolean;
}

interface BkashPaymentRequest {
    amount: number;
    invoiceId: string;
    callbackUrl: string;
}

export class BkashService {
    private async getCredentials(): Promise<BkashCredentials> {
        const settings = await prisma.systemSetting.findMany({
            where: {
                settingKey: {
                    in: [
                        'bkashAppKey',
                        'bkashAppSecret',
                        'bkashUsername',
                        'bkashPassword',
                        'bkashRunMode'
                    ]
                }
            }
        });

        const settingsMap = settings.reduce((acc: any, curr) => {
            // Decrypt sensitive fields
            if (['bkashAppSecret', 'bkashPassword'].includes(curr.settingKey)) {
                try {
                    // Check if value is encrypted
                    if (encryptionService.isEncrypted(curr.settingValue)) {
                        acc[curr.settingKey] = encryptionService.decrypt(curr.settingValue);
                        logger.debug(`Decrypted ${curr.settingKey}`);
                    } else {
                        // Not encrypted yet (backward compatibility)
                        acc[curr.settingKey] = curr.settingValue;
                        logger.warn(`⚠️  ${curr.settingKey} is not encrypted. Please re-save credentials.`);
                    }
                } catch (error: any) {
                    logger.error(`Failed to decrypt ${curr.settingKey}:`, error.message);
                    throw new Error(`Failed to decrypt bKash credentials. Please check ENCRYPTION_KEY.`);
                }
            } else {
                acc[curr.settingKey] = curr.settingValue;
            }
            return acc;
        }, {});

        const runMode = settingsMap.bkashRunMode || process.env.BKASH_RUN_MODE || 'sandbox';

        // Use provided values or fallback to env
        const appKey = settingsMap.bkashAppKey || process.env.BKASH_APP_KEY || '';
        const appSecret = settingsMap.bkashAppSecret || process.env.BKASH_APP_SECRET || '';
        const username = settingsMap.bkashUsername || process.env.BKASH_USERNAME || '';
        const password = settingsMap.bkashPassword || process.env.BKASH_PASSWORD || '';

        // For production, default to tokenized (most common for new merchants)
        // For sandbox, check username
        const isTokenized = runMode === 'production'
            ? !username.toLowerCase().includes('standard') // Default to tokenized unless explicitly marked as standard
            : username.toLowerCase().includes('tokenized');

        let baseUrl = '';
        if (runMode === 'production') {
            baseUrl = isTokenized
                ? 'https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout/'
                : 'https://checkout.pay.bka.sh/v1.2.0-beta/checkout/';
        } else {
            baseUrl = isTokenized
                ? 'https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout/'
                : 'https://checkout.sandbox.bka.sh/v1.2.0-beta/checkout/';
        }

        if (!appKey || !appSecret || !username || !password) {
            throw new Error('bKash credentials are not fully configured');
        }

        logger.info(`bKash Config: Mode=${runMode}, Type=${isTokenized ? 'Tokenized' : 'Standard'}, BaseURL=${baseUrl}`);

        return { appKey, appSecret, username, password, baseUrl, isTokenized };
    }

    private async getToken(): Promise<string> {
        const credentials = await this.getCredentials();

        try {
            // Check if we have a valid cached token in DB
            const cachedToken = await prisma.systemSetting.findFirst({
                where: { settingKey: 'bkashToken' }
            });

            const tokenExpiry = await prisma.systemSetting.findFirst({
                where: { settingKey: 'bkashTokenExpiry' }
            });

            if (cachedToken && tokenExpiry && parseInt(tokenExpiry.settingValue) > Date.now()) {
                return cachedToken.settingValue;
            }

            logger.info('Generating new bKash token...');
            logger.debug(`bKash Auth Details - URL: ${credentials.baseUrl}token/grant, Username: ${credentials.username}`);

            // Try primary endpoint
            let response;
            let lastError;

            try {
                response = await axios.post(
                    `${credentials.baseUrl}token/grant`,
                    {
                        app_key: credentials.appKey,
                        app_secret: credentials.appSecret
                    },
                    {
                        headers: {
                            'username': credentials.username,
                            'password': credentials.password,
                            'accept': 'application/json',
                            'content-type': 'application/json'
                        }
                    }
                );

                if (response.data && response.data.id_token) {
                    // Success with primary endpoint
                    return await this.saveToken(response.data);
                }
            } catch (primaryError: any) {
                lastError = primaryError;
                const errorData = primaryError.response?.data;

                // If we get "Unknown error" or similar, try the alternative endpoint
                if (errorData?.msg === 'Unknown error' || errorData?.status === 'fail') {
                    logger.warn(`Primary endpoint failed. Trying alternative endpoint...`);

                    // Switch endpoint type
                    const alternativeBaseUrl = credentials.isTokenized
                        ? credentials.baseUrl.replace('/tokenized/checkout/', '/checkout/')
                        : credentials.baseUrl.replace('/checkout/', '/tokenized/checkout/');

                    logger.debug(`Alternative URL: ${alternativeBaseUrl}token/grant`);

                    try {
                        response = await axios.post(
                            `${alternativeBaseUrl}token/grant`,
                            {
                                app_key: credentials.appKey,
                                app_secret: credentials.appSecret
                            },
                            {
                                headers: {
                                    'username': credentials.username,
                                    'password': credentials.password,
                                    'accept': 'application/json',
                                    'content-type': 'application/json'
                                }
                            }
                        );

                        if (response.data && response.data.id_token) {
                            logger.info(`✅ Alternative endpoint worked! Update your account type.`);
                            return await this.saveToken(response.data);
                        }
                    } catch (altError: any) {
                        logger.error('Alternative endpoint also failed:', altError.response?.data);
                    }
                }
            }

            // If we reach here, both endpoints failed or returned invalid response
            const errorLog = {
                data: response?.data || lastError?.response?.data,
                status: response?.status || lastError?.response?.status,
                headers: response?.headers || lastError?.response?.headers
            };
            logger.error('bKash Token Generation Failed. Metadata:', errorLog);

            const errorMessage = response?.data?.statusMessage
                || response?.data?.errorMessage
                || response?.data?.msg
                || lastError?.response?.data?.msg
                || 'Failed to generate bKash token. Please verify your credentials with bKash support.';

            throw new Error(errorMessage);
        } catch (error: any) {
            const errorData = error.response?.data;
            const statusMessage = errorData?.statusMessage || errorData?.errorMessage || errorData?.msg || error.message;
            logger.error('bKash Token Auth Exception:', {
                httpStatus: error.response?.status,
                reponseData: errorData,
                originalMessage: error.message
            });
            throw new Error(statusMessage || 'bKash authentication failed');
        }
    }

    private async saveToken(tokenData: any): Promise<string> {
        const token = tokenData.id_token;
        const expiresIn = parseInt(tokenData.expires_in) * 1000;
        const expiryTime = Date.now() + expiresIn - 60000; // Subtract 1 min for safety

        // Save to DB
        await prisma.systemSetting.upsert({
            where: { settingKey: 'bkashToken' },
            update: { settingValue: token },
            create: { settingKey: 'bkashToken', settingValue: token, settingGroup: 'BKASH' }
        });

        await prisma.systemSetting.upsert({
            where: { settingKey: 'bkashTokenExpiry' },
            update: { settingValue: expiryTime.toString() },
            create: { settingKey: 'bkashTokenExpiry', settingValue: expiryTime.toString(), settingGroup: 'BKASH' }
        });

        logger.info('bKash token generated successfully');
        return token;
    }

    async createPayment(data: BkashPaymentRequest) {
        const credentials = await this.getCredentials();
        const token = await this.getToken();

        try {
            logger.info(`Creating bKash payment for Invoice ${data.invoiceId}, Amount: ${data.amount}`);

            const endpoint = credentials.isTokenized ? 'create' : 'payment/create';

            const payload: any = {
                amount: data.amount.toString(),
                currency: 'BDT',
                intent: 'sale',
                merchantInvoiceNumber: data.invoiceId,
                callbackURL: data.callbackUrl
            };

            // Tokenized requires 'mode'
            if (credentials.isTokenized) {
                payload.mode = '0011'; // Immediate capture
                payload.payerReference = data.invoiceId;
            }

            const response = await axios.post(
                `${credentials.baseUrl}${endpoint}`,
                payload,
                {
                    headers: {
                        'Authorization': token,
                        'X-APP-Key': credentials.appKey,
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data && (response.data.paymentID || response.data.paymentId)) {
                // Standardize the response key
                if (!response.data.paymentID && response.data.paymentId) {
                    response.data.paymentID = response.data.paymentId;
                }
                return response.data;
            } else {
                logger.error('bKash Payment Creation Failed:', response.data);
                throw new Error(response.data.statusMessage || response.data.errorMessage || 'Failed to create bKash payment');
            }
        } catch (error: any) {
            logger.error('bKash Create Payment Error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.statusMessage || error.response?.data?.errorMessage || 'bKash payment creation failed');
        }
    }

    async executePayment(paymentID: string) {
        const credentials = await this.getCredentials();
        const token = await this.getToken();

        try {
            logger.info(`Executing bKash payment ID: ${paymentID}`);

            const endpoint = credentials.isTokenized ? 'execute' : `payment/execute/${paymentID}`;

            const payload: any = credentials.isTokenized ? { paymentID } : {};

            const response = await axios.post(
                `${credentials.baseUrl}${endpoint}`,
                payload,
                {
                    headers: {
                        'Authorization': token,
                        'X-APP-Key': credentials.appKey,
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                }
            );

            // bKash returns 200 even for some failures, check statusCode
            if (response.data && (response.data.statusCode === '0000' || response.data.transactionStatus === 'Completed')) {
                return response.data;
            } else {
                logger.error('bKash Payment Execution Failed:', response.data);
                throw new Error(response.data.statusMessage || response.data.errorMessage || 'bKash payment execution failed');
            }
        } catch (error: any) {
            logger.error('bKash Execute Payment Error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.statusMessage || error.response?.data?.errorMessage || 'bKash payment execution failed');
        }
    }

    async queryPayment(paymentID: string) {
        const credentials = await this.getCredentials();
        const token = await this.getToken();

        try {
            const endpoint = credentials.isTokenized ? 'payment/status' : `payment/query/${paymentID}`;

            const config: any = {
                headers: {
                    'Authorization': token,
                    'X-APP-Key': credentials.appKey,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            };

            const response = credentials.isTokenized
                ? await axios.post(`${credentials.baseUrl}${endpoint}`, { paymentID }, config)
                : await axios.get(`${credentials.baseUrl}${endpoint}`, config);

            return response.data;
        } catch (error: any) {
            logger.error('bKash Query Payment Error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.statusMessage || error.response?.data?.errorMessage || 'bKash query failed');
        }
    }

    /**
     * Refund a bKash payment
     * 
     * Can refund a transaction which is no older than 15 days
     * 
     * @param data - Refund request data
     * @returns Refund response from bKash
     * 
     * @see https://developer.bka.sh/reference#post_checkout-payment-refund
     */
    async refundPayment(data: {
        paymentID: string;
        amount: number;
        trxID: string;
        reason: string;
        sku?: string;
    }) {
        const credentials = await this.getCredentials();
        const token = await this.getToken();

        try {
            logger.info(`Initiating bKash refund for Payment ID: ${data.paymentID}, Amount: ${data.amount}`);

            const payload: any = {
                paymentID: data.paymentID,
                amount: data.amount.toFixed(2),
                trxID: data.trxID,
                sku: data.sku || 'N/A',
                reason: data.reason || 'Refund requested'
            };

            const response = await axios.post(
                `${credentials.baseUrl}payment/refund`,
                payload,
                {
                    headers: {
                        'Authorization': token,
                        'X-APP-Key': credentials.appKey,
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                }
            );

            // bKash returns 200 even for some failures, check statusCode or transactionStatus
            if (response.data) {
                // Check for tokenized response
                if (response.data.statusCode === '0000' || response.data.statusMessage === 'Successful') {
                    logger.info(`bKash refund successful: ${response.data.refundTrxID || response.data.trxID}`);
                    return response.data;
                }
                // Check for checkout response
                else if (response.data.transactionStatus === 'Completed' && response.data.refundTrxID) {
                    logger.info(`bKash refund successful: ${response.data.refundTrxID}`);
                    return response.data;
                }
                // Error response
                else {
                    const errorMsg = response.data.statusMessage || response.data.errorMessage || 'Refund failed';
                    logger.error('bKash Refund Failed:', response.data);
                    throw new Error(errorMsg);
                }
            } else {
                throw new Error('Empty response from bKash refund API');
            }
        } catch (error: any) {
            logger.error('bKash Refund Error:', error.response?.data || error.message);
            throw new Error(
                error.response?.data?.statusMessage ||
                error.response?.data?.errorMessage ||
                error.message ||
                'bKash refund failed'
            );
        }
    }

    /**
     * Query the status of a refunded transaction
     * 
     * Get status if the transaction is already refunded, otherwise invalid payment id will return
     * 
     * @param paymentID - bKash payment ID
     * @param trxID - Original transaction ID
     * @returns Refund status response from bKash
     */
    async refundStatus(paymentID: string, trxID: string) {
        const credentials = await this.getCredentials();
        const token = await this.getToken();

        try {
            logger.info(`Querying bKash refund status for Payment ID: ${paymentID}`);

            const payload = {
                paymentID,
                trxID
            };

            const response = await axios.post(
                `${credentials.baseUrl}payment/refund`,
                payload,
                {
                    headers: {
                        'Authorization': token,
                        'X-APP-Key': credentials.appKey,
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                }
            );

            return response.data;
        } catch (error: any) {
            logger.error('bKash Refund Status Query Error:', error.response?.data || error.message);
            throw new Error(
                error.response?.data?.statusMessage ||
                error.response?.data?.errorMessage ||
                'bKash refund status query failed'
            );
        }
    }
}

export default new BkashService();
