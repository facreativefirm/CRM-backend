const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
console.log('Product model fields:', Object.keys(prisma.product));
process.exit(0);
