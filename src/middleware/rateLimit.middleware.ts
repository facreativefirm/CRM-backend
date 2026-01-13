import rateLimit from 'express-rate-limit';

export const globalRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 1000, // Higher limit for development
    message: 'Too many requests from this IP',
});
