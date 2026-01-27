import { Product, ResellerProduct, ClientGroup, Prisma } from '@prisma/client';

export type BillingCycle = 'monthly' | 'quarterly' | 'semi-annually' | 'annually' | 'biennially' | 'triennially';

export const calculateProductPrice = (
    product: Product,
    cycle: BillingCycle,
    resellerOverride?: ResellerProduct,
    clientGroup?: ClientGroup
) => {
    let basePrice: Prisma.Decimal;

    // 1. Get base price from cycle
    // 1. Get base price from cycle (Normalizing input to lowercase to match logic)
    const normalizedCycle = cycle.toLowerCase();

    switch (normalizedCycle) {
        case 'monthly':
            basePrice = product.monthlyPrice;
            break;
        case 'quarterly':
            basePrice = Number(product.quarterlyPrice) > 0 ? product.quarterlyPrice : product.monthlyPrice.mul(3);
            break;
        case 'semi-annually':
            basePrice = Number(product.semiAnnualPrice) > 0 ? product.semiAnnualPrice : product.monthlyPrice.mul(6);
            break;
        case 'annually':
            basePrice = Number(product.annualPrice) > 0 ? product.annualPrice : product.monthlyPrice.mul(10.8); // 12 months * 0.9 (10% discount)
            break;
        case 'biennially':
            basePrice = Number(product.biennialPrice) > 0 ? product.biennialPrice : product.monthlyPrice.mul(21.6); // 24 months * 0.9
            break;
        case 'triennially':
            basePrice = Number(product.triennialPrice) > 0 ? product.triennialPrice : product.monthlyPrice.mul(32.4); // 36 months * 0.9
            break;
        default:
            basePrice = product.monthlyPrice;
    }

    let finalPrice = new Prisma.Decimal(basePrice.toString());

    // 2. Apply Reseller Custom Price if exists
    if (resellerOverride?.customPrice) {
        finalPrice = new Prisma.Decimal(resellerOverride.customPrice.toString());
    }
    // 3. Else apply Reseller Markup if exists
    else if (resellerOverride?.markupPercentage) {
        const markup = new Prisma.Decimal(resellerOverride.markupPercentage.toString()).div(100).add(1);
        finalPrice = finalPrice.mul(markup);
    }

    // 4. Apply Client Group Discount if exists
    if (clientGroup?.discountPercentage) {
        const discount = new Prisma.Decimal(1).sub(new Prisma.Decimal(clientGroup.discountPercentage.toString()).div(100));
        finalPrice = finalPrice.mul(discount);
    }

    return {
        basePrice,
        setupFee: product.setupFee,
        finalPrice,
        cycle
    };
};
