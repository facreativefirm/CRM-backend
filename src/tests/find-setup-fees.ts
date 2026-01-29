import prisma from '../config/database';

async function main() {
    const products = await prisma.product.findMany({
        where: { setupFee: { gt: 0 } },
        select: { id: true, name: true, setupFee: true, monthlyPrice: true }
    });
    console.log(JSON.stringify(products, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
