
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function test() {
    try {
        console.log('Testing Domain findMany with include...');
        const domains = await prisma.domain.findMany({
            include: {
                client: {
                    include: {
                        user: true
                    }
                }
            }
        });
        console.log('Success! Found domains:', domains.length);
        process.exit(0);
    } catch (error: any) {
        console.error('Final Test Failed!');
        console.error(error);
        process.exit(1);
    }
}

test();
