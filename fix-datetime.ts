import prisma from './src/config/database';

async function fixDatetimes() {
    try {
        console.log('Fixing invalid datetime values in user table...');

        // Use raw SQL to update invalid dates
        const result = await prisma.$executeRaw`
      UPDATE user 
      SET updatedAt = NOW() 
      WHERE updatedAt IS NULL 
         OR updatedAt = '0000-00-00 00:00:00' 
         OR YEAR(updatedAt) = 0 
         OR MONTH(updatedAt) = 0 
         OR DAY(updatedAt) = 0
    `;

        console.log(`Updated ${result} rows with invalid updatedAt values`);

        const result2 = await prisma.$executeRaw`
      UPDATE user 
      SET createdAt = NOW() 
      WHERE createdAt IS NULL 
         OR createdAt = '0000-00-00 00:00:00' 
         OR YEAR(createdAt) = 0 
         OR MONTH(createdAt) = 0 
         OR DAY(createdAt) = 0
    `;

        console.log(`Updated ${result2} rows with invalid createdAt values`);

        // Verify the fix
        const users = await prisma.user.findMany({
            take: 5,
            select: { id: true, username: true, createdAt: true, updatedAt: true }
        });

        console.log('Sample users after fix:', users);
        console.log('✅ Fix completed successfully!');

    } catch (err) {
        console.error('Error fixing datetimes:', err);
    } finally {
        await prisma.$disconnect();
    }
}

fixDatetimes();
