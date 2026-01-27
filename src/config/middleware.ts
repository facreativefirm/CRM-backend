import { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import express from 'express';
import logger from '../utils/logger';

export const configureMiddleware = (app: Express) => {
    // 1. Helmet Security
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
    }));

    // 2. Manual CORS Handling (More reliable for cPanel/Express 5)
    app.use((req, res, next) => {
        const origin = req.headers.origin;
        const rawAllowed = process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000';
        const allowedOrigins = rawAllowed
            .split(',')
            .map(o => o.trim().replace(/^["']|["']$/g, ''));

        // If origin matches allowed list, set CORS headers
        if (origin) {
            const isMatch = allowedOrigins.includes(origin) || origin.includes('localhost') || origin.includes('127.0.0.1');

            if (isMatch) {
                res.header('Access-Control-Allow-Origin', origin);
                res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
                res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token, X-Requested-With, Accept, Origin');
                res.header('Access-Control-Allow-Credentials', 'true');
                res.header('Access-Control-Expose-Headers', 'X-Session-Token');

                if (req.method === 'OPTIONS') {
                    console.log(`[CORS] Preflight MATCHED for origin: ${origin}`);
                    return res.sendStatus(200);
                }
            } else {
                console.warn(`[CORS] Origin MISMATCH: ${origin}. Allowed: ${JSON.stringify(allowedOrigins)}`);
            }
        }

        next();
    });

    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ limit: '10mb', extended: true }));
};
