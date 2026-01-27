export const openApiSpec = {
    openapi: '3.0.0',
    info: {
        title: 'WHMCS CRM API',
        version: '1.0.0',
        description: 'Production-ready WHMCS-style backend API for service management, billing, and support.',
    },
    servers: [
        {
            url: 'https://clientarea.facreativefirm.com/api',
            description: 'Production Server',
        },
        {
            url: 'http://localhost:5000/api',
            description: 'Development Server',
        },
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
            },
            Components: {},
        },
    },
    security: [
        {
            bearerAuth: [],
        },
    ],
    paths: {
        '/auth/register': {
            post: {
                summary: 'Register a new user',
                tags: ['Authentication'],
                responses: {
                    201: { description: 'User created successfully' },
                },
            },
        },
        '/auth/login': {
            post: {
                summary: 'Login to the system',
                tags: ['Authentication'],
                responses: {
                    200: { description: 'Login successful' },
                },
            },
        },
        '/clients': {
            get: {
                summary: 'List all clients',
                tags: ['Clients'],
                responses: {
                    200: { description: 'List of clients' },
                },
            },
        },
        '/orders': {
            post: {
                summary: 'Create a new order',
                tags: ['Orders'],
                responses: {
                    201: { description: 'Order created' },
                },
            },
        },
        '/invoices': {
            get: {
                summary: 'List invoices',
                tags: ['Billing'],
                responses: {
                    200: { description: 'List of invoices' },
                },
            },
        },
        '/support/tickets': {
            get: {
                summary: 'List support tickets',
                tags: ['Support'],
                responses: {
                    200: { description: 'List of tickets' },
                },
            },
        },
        '/reseller/dashboard': {
            get: {
                summary: 'Get reseller statistics',
                tags: ['Reseller'],
                responses: {
                    200: { description: 'Reseller stats' },
                },
            },
        },
        '/system/settings': {
            get: {
                summary: 'Get system settings',
                tags: ['System'],
                responses: {
                    200: { description: 'System settings' },
                },
            },
        },
    },
};
