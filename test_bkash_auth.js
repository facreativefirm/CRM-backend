require('dotenv').config();
const axios = require('axios');

async function testBkashAuth() {
    console.log('\n=== bKash Production Authentication Test ===\n');

    // Read credentials from environment or prompt user
    const credentials = {
        appKey: process.env.BKASH_APP_KEY || '',
        appSecret: process.env.BKASH_APP_SECRET || '',
        username: process.env.BKASH_USERNAME || '',
        password: process.env.BKASH_PASSWORD || ''
    };

    console.log('Credentials loaded:');
    console.log('Username:', credentials.username);
    console.log('App Key:', credentials.appKey ? credentials.appKey.substring(0, 10) + '...' : 'NOT SET');
    console.log('App Secret:', credentials.appSecret ? '***SET***' : 'NOT SET');
    console.log('Password:', credentials.password ? '***SET***' : 'NOT SET');

    if (!credentials.appKey || !credentials.appSecret || !credentials.username || !credentials.password) {
        console.error('\n❌ ERROR: Missing credentials in .env file');
        console.log('\nPlease ensure these are set in your .env:');
        console.log('  BKASH_APP_KEY=your_app_key');
        console.log('  BKASH_APP_SECRET=your_app_secret');
        console.log('  BKASH_USERNAME=your_username');
        console.log('  BKASH_PASSWORD=your_password');
        return;
    }

    const endpoints = [
        {
            name: 'Production Tokenized Checkout',
            url: 'https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout/token/grant',
            isTokenized: true
        },
        {
            name: 'Production Standard Checkout',
            url: 'https://checkout.pay.bka.sh/v1.2.0-beta/checkout/token/grant',
            isTokenized: false
        }
    ];

    console.log('\n=== Testing Both Endpoints ===\n');

    for (const endpoint of endpoints) {
        console.log(`\n📡 Testing: ${endpoint.name}`);
        console.log(`   URL: ${endpoint.url}`);

        try {
            const response = await axios.post(
                endpoint.url,
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
                    },
                    timeout: 10000
                }
            );

            if (response.data && response.data.id_token) {
                console.log('   ✅ SUCCESS! This is the CORRECT endpoint for your account.');
                console.log('   Token Type:', response.data.token_type);
                console.log('   Token Preview:', response.data.id_token.substring(0, 40) + '...');
                console.log('   Expires In:', response.data.expires_in, 'seconds');
                console.log('\n   🎯 SOLUTION: Update your database settings:');
                console.log(`      - Set account type to: ${endpoint.isTokenized ? 'TOKENIZED' : 'STANDARD'}`);
                console.log(`      - Or modify username to include "tokenized" if using tokenized endpoint`);
                return; // Stop after finding the working endpoint
            } else {
                console.log('   ❌ Unexpected response:', response.data);
            }
        } catch (error) {
            if (error.response) {
                console.log('   ❌ Failed with response:', error.response.data);
                console.log('   HTTP Status:', error.response.status);
            } else if (error.code === 'ECONNABORTED') {
                console.log('   ❌ Request timeout - bKash server not responding');
            } else {
                console.log('   ❌ Error:', error.message);
            }
        }
    }

    console.log('\n\n⚠️  BOTH ENDPOINTS FAILED');
    console.log('\nPossible reasons:');
    console.log('1. Credentials are incorrect (double-check with bKash)');
    console.log('2. Production account not yet activated by bKash');
    console.log('3. IP whitelisting required (check with bKash support)');
    console.log('4. Account credentials belong to a different API version');
    console.log('\n💡 Next steps:');
    console.log('- Contact bKash merchant support');
    console.log('- Verify credentials in your merchant portal');
    console.log('- Ask bKash which API version your account uses');
}

testBkashAuth().catch(console.error);
