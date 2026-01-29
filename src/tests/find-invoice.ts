import prisma from '../config/database';

async function main() {
    const invoice = await prisma.invoice.findUnique({
        where: { id: 7 }
    });
    console.log(JSON.stringify(invoice, null, 2));
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
