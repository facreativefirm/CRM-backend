import crypto from 'crypto';
import logger from '../utils/logger';

export class CryptoService {
    private merchantPrivateKey: string;
    private nagadPublicKey: string;

    constructor() {
        const privKey = process.env.NAGAD_MERCHANT_PRIVATE_KEY || '';
        const pubKey = process.env.NAGAD_PUBLIC_KEY || '';

        // Format keys to PKCS#1 format (RSA PRIVATE KEY / PUBLIC KEY)
        this.merchantPrivateKey = this.formatPrivateKey(privKey);
        this.nagadPublicKey = this.formatPublicKey(pubKey);

        if (this.merchantPrivateKey) {
            logger.info(`Merchant Private Key loaded (Starts with: ${this.merchantPrivateKey.substring(0, 32)}...)`);
        }
    }

    /**
     * Format private key to PKCS#1 RSA PRIVATE KEY format
     */
    private formatPrivateKey(key: string): string {
        if (!key) return '';

        // Remove existing headers/footers, quotes, and whitespace
        const cleanKey = key
            .replace(/-----BEGIN.*?-----/g, '')
            .replace(/-----END.*?-----/g, '')
            .replace(/["']/g, '') // Remove any quotes
            .replace(/\s/g, '');

        // Use the generic PRIVATE KEY header (PKCS#8) which is preferred by OpenSSL 3.1+
        // and handles both PKCS#1 and PKCS#8 raw data correctly in Node.js
        return `-----BEGIN PRIVATE KEY-----\n${cleanKey}\n-----END PRIVATE KEY-----`;
    }

    /**
     * Format public key to standard PUBLIC KEY format
     */
    private formatPublicKey(key: string): string {
        if (!key) return '';

        // Remove existing headers/footers, quotes, and whitespace
        const cleanKey = key
            .replace(/-----BEGIN.*?-----/g, '')
            .replace(/-----END.*?-----/g, '')
            .replace(/["']/g, '') // Remove any quotes
            .replace(/\s/g, '');

        return `-----BEGIN PUBLIC KEY-----\n${cleanKey}\n-----END PUBLIC KEY-----`;
    }

    /**
     * Encrypt data with Nagad public key (OpenSSL compatible)
     */
    /**
     * Encrypt data with Nagad public key (OpenSSL compatible)
     */
    encryptWithPublicKey(data: string, publicKey?: string): string {
        const keyToUse = publicKey ? this.formatPublicKey(publicKey) : this.nagadPublicKey;

        if (!keyToUse) {
            throw new Error('Nagad Public Key not configured');
        }

        const buffer = Buffer.from(data, 'utf8');
        const encrypted = crypto.publicEncrypt(
            {
                key: keyToUse,
                padding: crypto.constants.RSA_PKCS1_PADDING
            },
            buffer
        );

        return encrypted.toString('base64');
    }

    /**
     * Decrypt data with merchant private key (OpenSSL compatible)
     */
    decryptWithPrivateKey(encryptedData: string, privateKey?: string): string {
        const keyToUse = privateKey ? this.formatPrivateKey(privateKey) : this.merchantPrivateKey;

        if (!keyToUse) {
            throw new Error('Merchant Private Key not configured');
        }

        if (!encryptedData || typeof encryptedData !== 'string') {
            throw new Error('Invalid encrypted data: must be a non-empty string');
        }

        try {
            const cleanData = encryptedData.replace(/\s/g, '');
            const buffer = Buffer.from(cleanData, 'base64');

            logger.debug(`RSA Decrypting: ${buffer.length} bytes using Node.js ${process.version}`);

            let keyObject;
            try {
                keyObject = crypto.createPrivateKey({
                    key: keyToUse,
                    format: 'pem'
                });
            } catch (keyError: any) {
                logger.error(`Failed to load Private Key: ${keyError.message}`);
                throw new Error(`Private Key Load Failed: ${keyError.message}`);
            }

            // WORKAROUND for Node 21+ / OpenSSL 3.0 restriction:
            // Use RSA_NO_PADDING to get the raw math result, then manually strip PKCS#1 v1.5 padding.
            // PKCS#1 v1.5 format: 00 02 [PaddingString] 00 [Data]
            try {
                const rawBuffer = crypto.privateDecrypt(
                    {
                        key: keyObject,
                        padding: crypto.constants.RSA_NO_PADDING
                    },
                    buffer
                );

                // Find the separator (00) after the initial padding marker (02)
                // RSA_NO_PADDING may or may not include the leading 00 depending on the library
                let startIdx = 0;

                // If the first byte is 0x00, skip it
                if (rawBuffer[0] === 0) startIdx++;

                // Check for PKCS#1 v1.5 padding marker (02)
                if (rawBuffer[startIdx] !== 2) {
                    throw new Error(`Invalid PKCS#1 v1.5 padding marker: expected 02, got ${rawBuffer[startIdx].toString(16)}`);
                }

                // Look for the 0x00 separator after the padding string (starts after 02)
                let separatorIdx = -1;
                for (let i = startIdx + 1; i < rawBuffer.length; i++) {
                    if (rawBuffer[i] === 0) {
                        separatorIdx = i;
                        break;
                    }
                }

                if (separatorIdx === -1) {
                    throw new Error('PKCS#1 v1.5 separator (00) not found');
                }

                // Data starts after the 0x00 separator
                // Trim any trailing null bytes or padding that might be present in a raw RSA block
                const dataBuffer = rawBuffer.slice(separatorIdx + 1);
                return dataBuffer.toString('utf8').replace(/\0+$/, '').trim();

            } catch (decryptionError: any) {
                logger.error(`Manual RSA Decryption failed: ${decryptionError.message}`);
                throw decryptionError;
            }
        } catch (error: any) {
            logger.error(`Crypto Decryption Error Details: ${error.message}`);
            throw error;
        }
    }

    /**
     * Sign data with merchant private key using SHA256
     */
    signData(data: string, privateKey?: string): string {
        const keyToUse = privateKey ? this.formatPrivateKey(privateKey) : this.merchantPrivateKey;

        if (!keyToUse) {
            throw new Error('Nagad Merchant Private Key not configured');
        }

        const sign = crypto.createSign('SHA256');
        sign.update(data);
        sign.end();

        const signature = sign.sign(keyToUse);
        return signature.toString('base64');
    }

    /**
     * Verify signature with Nagad public key
     */
    verifySignature(data: string, signature: string, publicKey?: string): boolean {
        const keyToUse = publicKey ? this.formatPublicKey(publicKey) : this.nagadPublicKey;

        if (!keyToUse) {
            throw new Error('Nagad Public Key not configured');
        }

        const verify = crypto.createVerify('SHA256');
        verify.update(data);
        verify.end();

        return verify.verify(keyToUse, signature, 'base64');
    }

    /**
     * Generate random string for unique IDs
     */
    generateRandomString(length: number = 40): string {
        const characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let result = '';

        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }

        return result;
    }

    /**
     * Generate random 4-digit number for order ID suffix
     */
    generateOrderSuffix(): string {
        return Math.floor(1001 + Math.random() * 8999).toString();
    }
}

export default new CryptoService();
