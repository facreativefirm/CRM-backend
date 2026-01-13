
import prisma from './src/config/database';

async function test() {
    try {
        const models = Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$'));
        console.log('Prisma models count:', models.length);
        console.log('Prisma models:', models.join(', '));
        const users = await (prisma as any).user.findMany({
            take: 1,
            include: {
                client: true,
                staff: true,
            }
        });
        console.log('Successfully fetched users');

        const departments = await (prisma as any).ticketDepartment.findMany({ take: 1 });
        console.log('Successfully fetched departments');
    } catch (err) {
        console.error('Error fetching users:', err);
    } finally {
        await prisma.$disconnect();
    }
}

test();
