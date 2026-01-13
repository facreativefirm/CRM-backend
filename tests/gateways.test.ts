import { PaymentGatewayService } from '../src/services/gatewayService';

describe('PaymentGatewayService', () => {
    it('should initialize bKash payment with correct structure', async () => {
        const result = await PaymentGatewayService.initBKashPayment(100, 'INV-001');
        expect(result.status).toBe('success');
        expect(result.gateway).toBe('BKASH');
        expect(result.redirectURL).toContain('invoice=INV-001');
    });

    it('should initialize Nagad payment with correct structure', async () => {
        const result = await PaymentGatewayService.initNagadPayment(200, 'INV-002');
        expect(result.status).toBe('success');
        expect(result.gateway).toBe('NAGAD');
        expect(result.redirectURL).toContain('amount=200');
    });
});
