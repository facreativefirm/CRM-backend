import crypto from 'crypto';
import logger from '../utils/logger';
import dotenv from 'dotenv';

/**
 * Encryption Service for securing sensitive data
 * Uses AES-256-GCM for authenticated encryption
 */
class EncryptionService {
    private algorithm = 'aes-256-gcm';
    private key: Buffer | null = null;
    private isInitialized = false;

    constructor() {
        // Initialization is now lazy-loaded on first use
    }

    /**
     * Initialize encryption service with key from environment
     */
    private initialize() {
        if (this.isInitialized) return;

        try {
            // Load environment variables
            dotenv.config();

            const encryptionKey = process.env.ENCRYPTION_KEY;

            if (!encryptionKey) {
                logger.warn('⚠️  ENCRYPTION_KEY not set in environment. Encryption service disabled.');
                return;
            }

            if (encryptionKey.length !== 64) {
                throw new Error('ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes)');
            }

            // Validate hex format
            if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
                throw new Error('ENCRYPTION_KEY must contain only hexadecimal characters (0-9, a-f, A-F)');
            }

            this.key = Buffer.from(encryptionKey, 'hex');
            this.isInitialized = true;
            logger.info('✅ Encryption service initialized successfully');
        } catch (error: any) {
            logger.error('❌ Failed to initialize encryption service:', error.message);
            throw error;
        }
    }

    /**
     * Encrypt a string value
     * @param plainText - The text to encrypt
     * @returns Encrypted string in format: iv:authTag:encryptedData
     */
    encrypt(plainText: string): string {
        this.initialize();

        if (!this.isInitialized || !this.key) {
            throw new Error('Encryption service not initialized. Check ENCRYPTION_KEY in environment.');
        }

        if (!plainText || plainText.trim() === '') {
            throw new Error('Cannot encrypt empty string');
        }

        try {
            // Generate random IV (Initialization Vector)
            const iv = crypto.randomBytes(16);

            // Create cipher
            const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

            // Encrypt the data
            let encrypted = cipher.update(plainText, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            // Get authentication tag (cast to any to access GCM-specific method)
            const authTag = (cipher as any).getAuthTag();

            // Return format: iv:authTag:encryptedData
            const result = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;

            logger.debug(`Encrypted data (length: ${plainText.length} -> ${result.length})`);
            return result;
        } catch (error: any) {
            logger.error('Encryption failed:', error.message);
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    /**
     * Decrypt an encrypted string
     * @param encryptedText - The encrypted text in format: iv:authTag:encryptedData
     * @returns Decrypted plain text
     */
    decrypt(encryptedText: string): string {
        this.initialize();

        if (!this.isInitialized || !this.key) {
            throw new Error('Encryption service not initialized. Check ENCRYPTION_KEY in environment.');
        }

        if (!encryptedText || encryptedText.trim() === '') {
            throw new Error('Cannot decrypt empty string');
        }

        try {
            // Split the encrypted text into components
            const parts = encryptedText.split(':');

            if (parts.length !== 3) {
                throw new Error('Invalid encrypted format. Expected format: iv:authTag:encryptedData');
            }

            const iv = Buffer.from(parts[0], 'hex');
            const authTag = Buffer.from(parts[1], 'hex');
            const encrypted = parts[2];

            // Validate component lengths
            if (iv.length !== 16) {
                throw new Error('Invalid IV length');
            }
            if (authTag.length !== 16) {
                throw new Error('Invalid auth tag length');
            }

            // Create decipher
            const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
            (decipher as any).setAuthTag(authTag);

            // Decrypt the data
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            logger.debug(`Decrypted data (length: ${encryptedText.length} -> ${decrypted.length})`);
            return decrypted;
        } catch (error: any) {
            logger.error('Decryption failed:', error.message);
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    /**
     * Check if a string is encrypted (has the expected format)
     * @param value - The string to check
     * @returns true if the string appears to be encrypted
     */
    isEncrypted(value: string): boolean {
        if (!value || typeof value !== 'string') {
            return false;
        }

        // Check for expected format: iv:authTag:encryptedData
        const parts = value.split(':');
        if (parts.length !== 3) {
            return false;
        }

        // Check if all parts are valid hex strings
        return parts.every(part => /^[0-9a-fA-F]+$/.test(part));
    }

    /**
     * Generate a new encryption key (for setup/rotation)
     * @returns A new 64-character hex string suitable for ENCRYPTION_KEY
     */
    static generateKey(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Verify that the encryption service is working correctly
     * @returns true if encryption/decryption works
     */
    async testEncryption(): Promise<boolean> {
        try {
            const testData = 'Test encryption data: ' + Date.now();
            const encrypted = this.encrypt(testData);
            const decrypted = this.decrypt(encrypted);

            if (testData !== decrypted) {
                logger.error('❌ Encryption test failed: Data mismatch');
                return false;
            }

            logger.info('✅ Encryption test passed');
            return true;
        } catch (error: any) {
            logger.error('❌ Encryption test failed:', error.message);
            return false;
        }
    }

    /**
     * Get encryption service status
     */
    getStatus(): { initialized: boolean; algorithm: string } {
        this.initialize();
        return {
            initialized: this.isInitialized,
            algorithm: this.algorithm
        };
    }
}

export default new EncryptionService();
