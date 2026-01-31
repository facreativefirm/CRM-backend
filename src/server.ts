import './config/env';
import express from 'express';
import http from 'http';
import { configureMiddleware } from './config/middleware';
import routes from './routes';
import { globalRateLimiter } from './middleware/rateLimit.middleware';
import { errorHandler } from './middleware/error.middleware';
import { blockBannedIPs } from './middleware/security.middleware';
import { apiReference } from '@scalar/express-api-reference';
import { openApiSpec } from './docs/openapi';
import logger from './utils/logger';
import { initCronJobs } from './services/cronService';
import { initSocketService } from './services/socketService';
import prisma from './config/database';

const app = express();
const PORT = process.env.PORT || 3006;

// Test database connection on startup
const testConnection = async () => {
    try {
        await prisma.$connect();
        logger.info('✅ Database connection established successfully');
    } catch (err) {
        logger.error('❌ Failed to connect to the database on startup:', err instanceof Error ? err.message : err);
    }
};

// Middleware
configureMiddleware(app);

// Trust proxy for production environments (behind Nginx, Cloudflare, etc.)
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

app.use((req, res, next) => {
    if (process.env.NODE_ENV === 'development') {
        logger.debug(`[DEBUG] ${req.method} ${req.url}`);
    }
    next();
});

// Routes
app.use('/api', globalRateLimiter, blockBannedIPs, routes);

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// Root Welcome Page (Premium Aesthetics)
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>WHMCS Backend</title>
            <style>
                :root {
                    --primary: #6366f1;
                    --bg: #0f172a;
                    --text: #f8fafc;
                }
                body {
                    margin: 0;
                    font-family: 'Inter', -apple-system, sans-serif;
                    background-color: var(--bg);
                    color: var(--text);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    overflow: hidden;
                    background: radial-gradient(circle at top right, #1e1b4b, transparent),
                                radial-gradient(circle at bottom left, #1e1b4b, transparent),
                                var(--bg);
                }
                .container {
                    text-align: center;
                    padding: 3rem;
                    background: rgba(30, 41, 59, 0.5);
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(148, 163, 184, 0.1);
                    border-radius: 2rem;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                    animation: fadeIn 0.8s ease-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .logo {
                    font-size: 3rem;
                    font-weight: 800;
                    margin-bottom: 1rem;
                    background: linear-gradient(to right, #818cf8, #c084fc);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .status-badge {
                    display: inline-flex;
                    align-items: center;
                    padding: 0.5rem 1rem;
                    background: rgba(34, 197, 94, 0.1);
                    color: #4ade80;
                    border-radius: 9999px;
                    font-size: 0.875rem;
                    font-weight: 600;
                    margin-bottom: 2rem;
                    border: 1px solid rgba(34, 197, 94, 0.2);
                }
                .dot {
                    height: 8px;
                    width: 8px;
                    background-color: #22c55e;
                    border-radius: 50%;
                    margin-right: 8px;
                    box-shadow: 0 0 10px #22c55e;
                }
                h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #94a3b8; }
                p { color: #64748b; font-size: 0.9rem; }
                .footer { margin-top: 3rem; font-size: 0.75rem; color: #475569; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">WHMCS CORE</div>
                <div class="status-badge">
                    <span class="dot"></span>
                    SYSTEM LIVE & SECURED
                </div>
                <h1>Production Backend</h1>
                <p>The API is running successfully and accepting connections.</p>
                <div class="footer">
                    &copy; 2026 WHMCS Dashboard &bull; Version 1.0.0
                </div>
            </div>
        </body>
        </html>
    `);
});

// Documentation
app.use(
    '/docs',
    apiReference({
        spec: {
            content: openApiSpec,
        },
    })
);

// 404 Handler
app.use((req, res, next) => {
    // Ignore socket.io requests in 404 handler - they should be handled by the HTTP server
    if (req.url.startsWith('/socket.io')) {
        return next();
    }

    logger.warn(`[404 NOT FOUND] ${req.method} ${req.url}`);
    res.status(404).json({
        status: 'error',
        message: `Route ${req.method} ${req.url} not found on this server.`
    });
});

// Error handling
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
    testConnection();
    initCronJobs();

    // Create HTTP server
    const server = http.createServer(app);

    // Initialize Socket.IO
    initSocketService(server);

    // Listen on the HTTP server, NOT the app directly
    server.listen(PORT, () => {
        logger.info(`🚀 Server (HTTP + Socket.IO) successfully started on port ${PORT}`);
    });

    // Handle process signals for clean shutdown
    process.on('SIGTERM', () => {
        logger.info('SIGTERM signal received: closing HTTP server');
        server.close(() => {
            logger.info('HTTP server closed');
        });
    });
}

export default app;
