const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: "postgresql://postgres:postgres@localhost:5433/crm_database?schema=public"
        }
    }
});

async function main() {
    try {
        console.log('--- Checking Tax Configuration ---');
        const setting = await prisma.systemSetting.findUnique({
            where: { settingKey: 'taxRate' }
        });
        console.log('Tax Setting in DB:', setting);

        const latestInvoice = await prisma.invoice.findFirst({
            orderBy: { id: 'desc' },
            include: { client: { include: { group: true } } }
        });

        if (latestInvoice) {
            console.log('--- Latest Invoice ---');
            console.log('ID:', latestInvoice.id);
            console.log('Subtotal:', latestInvoice.subtotal);
            console.log('TaxAmount:', latestInvoice.taxAmount);
            console.log('Total:', latestInvoice.totalAmount);
            console.log('Time Created:', latestInvoice.createdAt);

            console.log('--- Client Info ---');
            console.log('Client ID:', latestInvoice.clientId);
            console.log('Tax Exempt Group?', latestInvoice.client?.group?.taxExempt);
        } else {
            console.log('No invoices found');
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
