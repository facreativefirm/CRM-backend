import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const password = '12345678';
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { username: 'admin' },
                { userType: 'ADMIN' },
                { userType: 'SUPER_ADMIN' }
            ]
        }
    });

    if (!user) {
        console.error('Admin user not found');
        return;
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash }
    });

    console.log(`Password for user ${user.username} (ID: ${user.id}) has been updated to ${password}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
