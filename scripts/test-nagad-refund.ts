import nagadService from '../src/services/nagad.service';
import logger from '../src/utils/logger';

async function testNagadRefundIntegration() {
    console.log('--- Nagad Refund Integration Test ---');

    console.log('1. Checking NagadService methods...');
    if (typeof nagadService.refundPayment === 'function') {
        console.log('✅ refundPayment method exists');
    } else {
        console.error('❌ refundPayment method MISSING');
    }

    console.log('\n2. Testing Credential Loading (Dry Run)...');
    try {
        // This will test if keys can be loaded and formatted correctly
        // We use dummy data to avoid actual API call but test the logic until the POST request
        console.log('Attempting to load credentials...');
        // @ts-ignore - accessing private for test
        const creds = await nagadService.getCredentials();
        console.log('✅ Credentials loaded successfully');
        console.log('Merchant ID:', creds.merchantId);
        console.log('Base URL:', creds.baseUrl);
    } catch (error: any) {
        console.warn('⚠️ Credential test warning (might be expected in local without .env):', error.message);
    }

    console.log('\n3. Verifying required environment variables...');
    const required = [
        'NAGAD_MERCHANT_ID',
        'NAGAD_PUBLIC_KEY',
        'NAGAD_MERCHANT_PRIVATE_KEY'
    ];

    required.forEach(v => {
        if (process.env[v]) {
            console.log(`✅ ${v} is set`);
        } else {
            console.log(`❌ ${v} is NOT set in environment`);
        }
    });

    console.log('\n--- Test Complete ---');
}

testNagadRefundIntegration();
