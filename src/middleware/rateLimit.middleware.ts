import rateLimit from 'express-rate-limit';

export const globalRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 0, // max: 0 with skip: true
    skip: () => true, // Disable entirely
    message: {
        status: 'error',
        message: 'Too many requests from this IP, please try again after 15 minutes'
    },
});

export const authRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 0, // Disabled
    skip: () => true, // Disable entirely
    message: {
        status: 'error',
        message: 'Too many failed login attempts. Please try again after an hour.'
    },
});
