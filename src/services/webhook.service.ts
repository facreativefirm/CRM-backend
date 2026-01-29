import axios from 'axios';
import crypto from 'crypto';
import prisma from '../config/database';

export class WebhookService {
    /**
     * Dispatch an event to all subscribed webhooks
     */
    static async dispatch(event: string, payload: any) {
        try {
            const subscriptions = await prisma.webhookSubscription.findMany({
                where: { isActive: true }
            });

            if (subscriptions.length === 0) return;

            console.log(`[Webhook] Dispatching event: ${event}`);

            for (const sub of subscriptions) {
                let events: string[] = [];
                try {
                    events = typeof sub.events === 'string' ? JSON.parse(sub.events) : sub.events;
                } catch (e) {
                    console.error(`[Webhook] Failed to parse events for subscription ${sub.id}`);
                    continue;
                }

                if (events.includes(event) || events.includes('*')) {
                    // Fire and forget - don't block main thread
                    this.send(sub, event, payload).catch(err => {
                        console.error(`[Webhook] Async send failed: ${err.message}`);
                    });
                }
            }
        } catch (error) {
            console.error(`[Webhook] Dispatch error:`, error);
        }
    }

    /**
     * Send webhook payload to specific URL with HMAC signature
     */
    static async send(subscription: any, event: string, payload: any) {
        const body = {
            id: crypto.randomUUID(),
            event,
            createdAt: new Date().toISOString(),
            data: payload
        };

        const jsonBody = JSON.stringify(body);
        const signature = crypto
            .createHmac('sha256', subscription.secretKey)
            .update(jsonBody)
            .digest('hex');

        try {
            await axios.post(subscription.targetUrl, body, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Signature': signature,
                    'X-Event-Type': event,
                    'User-Agent': 'WHMCS-CRM-Webhook/1.0'
                },
                timeout: 10000 // 10s timeout
            });
            console.log(`[Webhook] Delivered ${event} to ${subscription.targetUrl}`);
        } catch (error: any) {
            console.warn(`[Webhook] Delivery failed to Subscription #${subscription.id}: ${error.message}`);

            // Queue for retry
            // We use 'WebhookSubscription' as entityType and the subscription ID as entityId
            // The payload contains the full event data needed for replay
            await prisma.integrationQueue.create({
                data: {
                    entityType: 'WebhookSubscription',
                    entityId: subscription.id,
                    action: event,
                    payload: jsonBody,
                    status: 'PENDING',
                    attempts: 0,
                    nextAttemptAt: new Date() // Retry immediately by cron
                }
            });
        }
    }
}
