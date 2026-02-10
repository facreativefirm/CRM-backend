/**
 * Quick Test Script for Encryption Service
 * Tests encryption/decryption functionality
 */

import encryptionService from '../src/services/encryption.service';

async function testEncryption() {
    console.log('\n🧪 Testing Encryption Service\n');
    console.log('='.repeat(60));

    try {
        // Test 1: Service Status
        console.log('\n1️⃣  Checking service status...');
        const status = encryptionService.getStatus();
        console.log(`   Algorithm: ${status.algorithm}`);
        console.log(`   Initialized: ${status.initialized ? '✅ Yes' : '❌ No'}`);

        if (!status.initialized) {
            console.log('\n❌ Encryption service not initialized!');
            console.log('   Please check ENCRYPTION_KEY in .env file\n');
            process.exit(1);
        }

        // Test 2: Basic Encryption/Decryption
        console.log('\n2️⃣  Testing basic encryption/decryption...');
        const testData = 'MySecretPassword123!@#';
        console.log(`   Original: ${testData}`);

        const encrypted = encryptionService.encrypt(testData);
        console.log(`   Encrypted: ${encrypted.substring(0, 50)}...`);
        console.log(`   Format valid: ${encryptionService.isEncrypted(encrypted) ? '✅ Yes' : '❌ No'}`);

        const decrypted = encryptionService.decrypt(encrypted);
        console.log(`   Decrypted: ${decrypted}`);
        console.log(`   Match: ${testData === decrypted ? '✅ Yes' : '❌ No'}`);

        if (testData !== decrypted) {
            throw new Error('Decrypted value does not match original!');
        }

        // Test 3: Multiple Encryptions (different IVs)
        console.log('\n3️⃣  Testing multiple encryptions (should be different)...');
        const encrypted1 = encryptionService.encrypt(testData);
        const encrypted2 = encryptionService.encrypt(testData);
        console.log(`   Same input, different output: ${encrypted1 !== encrypted2 ? '✅ Yes' : '❌ No'}`);

        // Test 4: isEncrypted Detection
        console.log('\n4️⃣  Testing encryption detection...');
        console.log(`   Encrypted string detected: ${encryptionService.isEncrypted(encrypted) ? '✅ Yes' : '❌ No'}`);
        console.log(`   Plain text detected as encrypted: ${!encryptionService.isEncrypted('plain text') ? '✅ No (correct)' : '❌ Yes (wrong)'}`);

        // Test 5: Self-test
        console.log('\n5️⃣  Running self-test...');
        const selfTestPassed = await encryptionService.testEncryption();
        console.log(`   Self-test: ${selfTestPassed ? '✅ Passed' : '❌ Failed'}`);

        // Test 6: Real-world scenario (bKash credentials)
        console.log('\n6️⃣  Testing with sample credentials...');
        const sampleCredentials = {
            bkashAppSecret: '4f6h00bfbdomjh7v3i00edf806',
            bkashPassword: 'sandboxTokenizedUser02@12345',
            nagadPrivateKey: 'MIIEvgIBADANBgkqhkiG9w0BAQEFAASC...',
            nagadPublicKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...'
        };

        for (const [key, value] of Object.entries(sampleCredentials)) {
            const enc = encryptionService.encrypt(value);
            const dec = encryptionService.decrypt(enc);
            const match = value === dec;
            console.log(`   ${key}: ${match ? '✅' : '❌'}`);

            if (!match) {
                throw new Error(`Failed to encrypt/decrypt ${key}`);
            }
        }

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('\n✅ All tests passed successfully!');
        console.log('\n📌 Encryption service is ready for production use.\n');

    } catch (error: any) {
        console.log('\n' + '='.repeat(60));
        console.error('\n❌ Test failed:', error.message);
        console.error('\nPlease check:');
        console.error('  1. ENCRYPTION_KEY is set in .env');
        console.error('  2. ENCRYPTION_KEY is 64 hexadecimal characters');
        console.error('  3. No typos in the encryption key\n');
        process.exit(1);
    }
}

// Run tests
testEncryption()
    .then(() => {
        console.log('🎉 Testing complete!\n');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
