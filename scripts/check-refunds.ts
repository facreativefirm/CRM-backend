import prisma from '../src/config/database';

async function checkCompletedRefunds() {
    try {
        const refunds = await prisma.refund.findMany({
            where: {
                status: 'COMPLETED'
            },
            include: {
                transaction: true
            },
            orderBy: {
                updatedAt: 'desc'
            },
            take: 5
        });

        console.log(JSON.stringify(refunds, null, 2));

    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

checkCompletedRefunds();
