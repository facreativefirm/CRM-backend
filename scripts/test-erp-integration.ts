
import axios from 'axios';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function testERPIntegration() {
    console.log('🚀 Starting ERP Integration Test Simulation...');

    // 1. Setup Mock Webhook Subscription
    console.log('\n[1/4] Setting up Mock Webhook Subscription...');
    const SUBSCRIPTION_URL = 'http://localhost:9999/webhook-test-capture'; // We won't actually run a server here, we just want to see it try
    const SECRET = 'test_secret_123';

    try {
        const sub = await prisma.webhookSubscription.create({
            data: {
                targetUrl: SUBSCRIPTION_URL,
                events: JSON.stringify(['invoice.created', 'client.updated']),
                secretKey: SECRET,
                isActive: true
            }
        });
        console.log('✅ Webhook Subscription Created:', sub.id);

        // 2. Trigger Event (Create Client)
        console.log('\n[2/4] Triggering Event (Create Test Client)...');
        const testClient = await prisma.client.create({
            data: {
                user: {
                    create: {
                        username: `erptest_${Date.now()}`,
                        email: `erptest_${Date.now()}@example.com`,
                        passwordHash: 'hash',
                        firstName: 'ERP',
                        lastName: 'TestUser',
                        userType: 'CLIENT',
                        status: 'ACTIVE'
                    }
                },
                companyName: 'ERP Test Co'
            },
            include: { user: true }
        });
        console.log('✅ Test Client Created:', testClient.id);

        // Manually invoke Webhook Dispatch (since we are running a script, not the app server middleware)
        console.log('   > Manually dispatching webhook event...');
        const { WebhookService } = require('../src/services/webhook.service');
        await WebhookService.dispatch('client.created', testClient);

        // Wait a bit for processing
        await new Promise(r => setTimeout(r, 2000));

        // 3. Verify Queue (Should be in queue or failed because localhost:9999 is down)
        console.log('\n[3/4] Verifying Integration Queue...');
        const queueItems = await prisma.integrationQueue.findMany({
            where: { entityType: 'WebhookSubscription', entityId: sub.id },
            orderBy: { createdAt: 'desc' },
            take: 1
        });

        if (queueItems.length > 0) {
            console.log('✅ Queue Item Found:', queueItems[0].status);
            console.log('   Payload Preview:', queueItems[0].payload.substring(0, 100) + '...');
        } else {
            console.log('⚠️ No Queue Item found. Check console for dispatch errors.');
        }

        // 4. Test Incoming ID Mapping
        console.log('\n[4/4] Testing Incoming ID Mapping (ERP -> CRM)...');
        const ERP_ID = `CUST-ERP-${Date.now()}`;

        // Simulate API Controller Logic
        const { mapExternalId } = require('../src/controllers/integration.controller');

        // Mock Express Request/Response
        const req = {
            body: {
                entity: 'client',
                localId: testClient.id,
                externalId: ERP_ID
            }
        };
        const res = {
            status: (code: number) => ({
                json: (data: any) => {
                    console.log(`   > API Response: [${code}]`, data);
                }
            })
        };

        try {
            await mapExternalId(req, res);

            // Verify DB update
            const updatedClient = await prisma.client.findUnique({ where: { id: testClient.id } });
            if (updatedClient?.externalId === ERP_ID && updatedClient?.syncStatus === 'SYNCED') {
                console.log('✅ Client successfully mapped to ERP ID:', updatedClient.externalId);
            } else {
                console.log('❌ Client mapping failed:', updatedClient);
            }

        } catch (e: any) {
            console.error('❌ API Call Failed:', e.message);
        }

        // Cleanup
        console.log('\n🧹 Cleaning up test data...');
        await prisma.client.delete({ where: { id: testClient.id } }); // Cascades to user ?? No, usually user->client cascade. 
        // Need to delete User actually
        await prisma.user.delete({ where: { id: testClient.userId } });
        await prisma.webhookSubscription.delete({ where: { id: sub.id } });
        // Clean queue items for this sub
        await prisma.integrationQueue.deleteMany({ where: { entityId: sub.id } });

        console.log('✨ Test Complete!');

    } catch (e) {
        console.error('Test Failed:', e);
    } finally {
        await prisma.$disconnect();
    }
}

testERPIntegration();
