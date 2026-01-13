import prisma from './src/config/database';

async function fixAllDates() {
    try {
        console.log('Identifying all datetime columns in the database...');

        const columns: any[] = await prisma.$queryRaw`
      SELECT TABLE_NAME, COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'whmcs_crm' 
      AND DATA_TYPE IN ('datetime', 'timestamp')
    `;

        console.log(`Found ${columns.length} datetime/timestamp columns.`);

        for (const col of columns) {
            const { TABLE_NAME, COLUMN_NAME } = col;

            try {
                // We use $executeRawUnsafe because column/table names can't be parameterized in $executeRaw
                const result = await prisma.$executeRawUnsafe(`
          UPDATE \`${TABLE_NAME}\`
          SET \`${COLUMN_NAME}\` = NOW()
          WHERE \`${COLUMN_NAME}\` IS NULL 
             OR \`${COLUMN_NAME}\` = '0000-00-00 00:00:00'
             OR YEAR(\`${COLUMN_NAME}\`) = 0
        `);

                if (result > 0) {
                    console.log(`Updated ${result} rows in \`${TABLE_NAME}\`.\`${COLUMN_NAME}\``);
                }
            } catch (err: any) {
                // Some tables might not have any data or have other constraints, just log and continue
                // console.log(`Skipping \`${TABLE_NAME}\`.\`${COLUMN_NAME}\`: ${err.message}`);
            }
        }

        console.log('✅ Global date fix completed!');

    } catch (err) {
        console.error('Error during global date fix:', err);
    } finally {
        await prisma.$disconnect();
    }
}

fixAllDates();
