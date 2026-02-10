import dotenv from 'dotenv';
import path from 'path';

// Force load .env from the current working directory
dotenv.config({ path: path.join(process.cwd(), '.env') });
// Also try parent directory just in case (for nested dist structures)
dotenv.config({ path: path.join(process.cwd(), '..', '.env') });

/**
 * Clean up environment variables.
 * cPanel's Setup Node.js App UI often adds literal quotes (e.g., "mysql://...") 
 * to variables, which causes connection strings and secrets to fail.
 */
const cleanEnv = () => {
    const varsToClean = [
        'DATABASE_URL',
        'ALLOWED_ORIGINS',
        'JWT_SECRET',
        'REDIS_URL',
        'FRONTEND_URL',
        'BACKEND_URL'
    ];

    varsToClean.forEach(key => {
        if (process.env[key]) {
            process.env[key] = process.env[key]!.replace(/^["']|["']$/g, '').trim();
            const val = process.env[key]!;
            const masked = key.includes('URL') ? val.replace(/:([^:@]+)@/, ':****@') : (val.length > 5 ? val.substring(0, 5) + '...' : '***');
            console.log(`[Env] ${key} is LOADED and cleaned: ${masked}`);
        } else {
            console.warn(`[Env] ${key} is MISSING from process.env`);
        }
    });
};

cleanEnv();

export default process.env;
