import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const products = await prisma.product.findMany({});
    products.forEach(p => {
        if (Number(p.setupFee) > 0) {
            console.log(`ID: ${p.id}, Name: ${p.name}, Price: ${p.monthlyPrice}, SetupFee: ${p.setupFee}`);
        }
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
