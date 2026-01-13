const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
console.log('User model fields:', Object.keys(prisma.user));
process.exit(0);
