const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log('--- Debugging Tax Settings ---');
        const taxRateSetting = await prisma.systemSetting.findUnique({ where: { settingKey: 'taxRate' } });
        console.log('Raw Setting (taxRate):', taxRateSetting);

        const taxRate = parseFloat(taxRateSetting?.settingValue || '0');
        console.log('Parsed Tax Rate (percentage):', taxRate);
        console.log('Calculated Multiplier (rate/100):', taxRate / 100);

        console.log('\n--- Checking Recent Invoice ---');
        const latestInvoice = await prisma.invoice.findFirst({
            orderBy: { id: 'desc' },
            include: { items: true }
        });

        if (latestInvoice) {
            console.log(`Invoice #${latestInvoice.invoiceNumber}`);
            console.log(`Subtotal: ${latestInvoice.subtotal}`);
            console.log(`Tax Amount: ${latestInvoice.taxAmount}`);
            console.log(`Total: ${latestInvoice.totalAmount}`);
            const expectedTax = Number(latestInvoice.subtotal) * (taxRate / 100);
            console.log(`Expected Tax (${taxRate}%):`, expectedTax);
        } else {
            console.log('No invoices found.');
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
