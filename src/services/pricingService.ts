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
        case 'monthly': basePrice = product.monthlyPrice; break;
        case 'quarterly': basePrice = product.quarterlyPrice; break;
        case 'semi-annually': basePrice = product.semiAnnualPrice; break;
        case 'annually': basePrice = product.annualPrice; break;
        case 'biennially': basePrice = product.biennialPrice; break;
        case 'triennially': basePrice = product.triennialPrice; break;
        default: basePrice = product.monthlyPrice;
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
