import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Helper to safely get environment variable (returns empty string if not defined during build)
const getEnvVar = (name: string): string => {
    return process.env[name] || ''
}

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
    },
    datasource: {
        url: getEnvVar('DATABASE_URL'),
    },
})
