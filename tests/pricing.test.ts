import { calculateProductPrice, BillingCycle } from '../src/services/pricingService';
import { Prisma } from '@prisma/client';

describe('PricingService', () => {
    const mockProduct: any = {
        monthlyPrice: new Prisma.Decimal(10.00),
        annualPrice: new Prisma.Decimal(100.00),
        setupFee: new Prisma.Decimal(5.00),
    };

    it('should calculate base monthly price correctly', () => {
        const result = calculateProductPrice(mockProduct, 'monthly');
        expect(result.finalPrice.toNumber()).toBe(10.00);
        expect(result.setupFee.toNumber()).toBe(5.00);
    });

    it('should calculate annual price correctly', () => {
        const result = calculateProductPrice(mockProduct, 'annually');
        expect(result.finalPrice.toNumber()).toBe(100.00);
    });

    it('should apply reseller markup correctly', () => {
        const resellerOverride: any = {
            markupPercentage: new Prisma.Decimal(20.00), // 20% markup
        };
        const result = calculateProductPrice(mockProduct, 'monthly', resellerOverride);
        expect(result.finalPrice.toNumber()).toBe(12.00); // 10 * 1.2
    });

    it('should apply client group discount correctly', () => {
        const clientGroup: any = {
            discountPercentage: new Prisma.Decimal(10.00), // 10% discount
        };
        const result = calculateProductPrice(mockProduct, 'monthly', undefined, clientGroup);
        expect(result.finalPrice.toNumber()).toBe(9.00); // 10 * 0.9
    });

    it('should handle both markup and discount (markup first then discount)', () => {
        const resellerOverride: any = {
            markupPercentage: new Prisma.Decimal(20.00),
        };
        const clientGroup: any = {
            discountPercentage: new Prisma.Decimal(10.00),
        };
        const result = calculateProductPrice(mockProduct, 'monthly', resellerOverride, clientGroup);
        // 10 + 20% = 12
        // 12 - 10% = 10.8
        expect(result.finalPrice.toNumber()).toBe(10.80);
    });
});
