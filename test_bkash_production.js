require('dotenv').config();
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testBkashAuth() {
    try {
        // Fetch credentials from database
        const settings = await prisma.systemSetting.findMany({
            where: {
                settingKey: {
                    in: ['bkashAppKey', 'bkashAppSecret', 'bkashUsername', 'bkashPassword', 'bkashRunMode']
                }
            }
        });

        const settingsMap = settings.reduce((acc, curr) => {
            acc[curr.settingKey] = curr.settingValue;
            return acc;
        }, {});

        console.log('\n=== bKash Configuration ===');
        console.log('Run Mode:', settingsMap.bkashRunMode || 'sandbox');
        console.log('Username:', settingsMap.bkashUsername);
        console.log('App Key:', settingsMap.bkashAppKey?.substring(0, 10) + '...');
        console.log('App Secret:', settingsMap.bkashAppSecret ? '***' : 'NOT SET');
        console.log('Password:', settingsMap.bkashPassword ? '***' : 'NOT SET');

        const endpoints = [
            {
                name: 'Production Checkout (Non-Tokenized)',
                url: 'https://checkout.pay.bka.sh/v1.2.0-beta/checkout/token/grant'
            },
            {
                name: 'Production Tokenized',
                url: 'https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout/token/grant'
            }
        ];

        console.log('\n=== Testing Endpoints ===');

        for (const endpoint of endpoints) {
            console.log(`\nTesting: ${endpoint.name}`);
            console.log(`URL: ${endpoint.url}`);

            try {
                const response = await axios.post(
                    endpoint.url,
                    {
                        app_key: settingsMap.bkashAppKey,
                        app_secret: settingsMap.bkashAppSecret
                    },
                    {
                        headers: {
                            'username': settingsMap.bkashUsername,
                            'password': settingsMap.bkashPassword,
                            'accept': 'application/json',
                            'content-type': 'application/json'
                        }
                    }
                );

                if (response.data && response.data.id_token) {
                    console.log('✅ SUCCESS! This is the correct endpoint.');
                    console.log('Token received:', response.data.id_token.substring(0, 30) + '...');
                    console.log('Expires in:', response.data.expires_in, 'seconds');
                    console.log('\n🎯 Use this configuration in your system settings:');
                    console.log('   - Endpoint type:', endpoint.name.includes('Tokenized') ? 'TOKENIZED' : 'NON-TOKENIZED');
                } else {
                    console.log('❌ Failed:', response.data);
                }
            } catch (error) {
                console.log('❌ Error:', error.response?.data || error.message);
            }
        }

    } catch (error) {
        console.error('Script error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testBkashAuth();
