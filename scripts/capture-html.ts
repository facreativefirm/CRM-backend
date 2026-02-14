import prisma from '../src/config/database';

async function captureFullHtml() {
    try {
        const log = await prisma.gatewayLog.findFirst({
            where: {
                transactionId: { startsWith: 'REF-' },
                responseData: { contains: '<html' }
            },
            orderBy: { timestamp: 'desc' }
        });

        if (log && log.responseData) {
            // Print the first 2000 chars of the HTML
            console.log(log.responseData.substring(0, 5000));
        }
    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

captureFullHtml();
