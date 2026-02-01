import { z } from 'zod';
import { UserType, UserStatus, ContactType, ClientStatus, ServiceStatus } from '@prisma/client';

// Auth Schemas
export const registerSchema = z.object({
    body: z.object({
        username: z.string().min(3).max(100),
        email: z.string().email(),
        password: z.string()
            .min(8, "Password must be at least 8 characters")
            .regex(/[A-Z]/, "Password must contain at least one capital letter")
            .regex(/[0-9]/, "Password must contain at least one number")
            .regex(/[^A-Za-z0-9]/, "Password must contain at least one symbol"),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        phoneNumber: z.string().optional(),
        whatsAppNumber: z.string().optional(),
        userType: z.nativeEnum(UserType).optional(),
    }),
});

export const loginSchema = z.object({
    body: z.object({
        identifier: z.string().min(3),
        password: z.string(),
    }),
});

export const updateMeSchema = z.object({
    body: z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        phoneNumber: z.string().optional(),
        whatsAppNumber: z.string().optional(),
        currentPassword: z.string().optional(),
        newPassword: z.string()
            .min(8, "Password must be at least 8 characters")
            .regex(/[A-Z]/, "Password must contain at least one capital letter")
            .regex(/[0-9]/, "Password must contain at least one number")
            .regex(/[^A-Za-z0-9]/, "Password must contain at least one symbol")
            .optional()
            .or(z.literal('')),
    }),
});

// User Management Schemas
export const updateUserSchema = z.object({
    params: z.object({
        id: z.string().transform((val: string) => parseInt(val, 10)),
    }),
    body: z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        status: z.nativeEnum(UserStatus).optional(),
        userType: z.nativeEnum(UserType).optional(),
        resellerType: z.any().optional(), // Match ResellerType enum if needed
        commissionRate: z.number().optional(),
        phoneNumber: z.string().optional(),
        whatsAppNumber: z.string().optional(),
    }),
});

// Client Management Schemas
export const createClientSchema = z.object({
    body: z.object({
        username: z.string().min(3).max(100),
        email: z.string().email(),
        password: z.string()
            .min(8, "Password must be at least 8 characters")
            .regex(/[A-Z]/, "Password must contain at least one capital letter")
            .regex(/[0-9]/, "Password must contain at least one number")
            .regex(/[^A-Za-z0-9]/, "Password must contain at least one symbol"),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        companyName: z.string().optional(),
        businessType: z.string().optional(),
        taxId: z.string().optional(),
        currency: z.string().default('BDT'),
        resellerId: z.number().optional(),
        address1: z.string().optional(),
        address2: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zip: z.string().optional(),
        country: z.string().optional(),
        phone: z.string().optional(),
        whatsAppNumber: z.string().optional(),
    }),
});

export const updateClientSchema = z.object({
    params: z.object({
        id: z.string().transform((val: string) => parseInt(val, 10)),
    }),
    body: z.object({
        // User fields
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().email().optional(),
        password: z.string()
            .min(8, "Password must be at least 8 characters")
            .regex(/[A-Z]/, "Password must contain at least one capital letter")
            .regex(/[0-9]/, "Password must contain at least one number")
            .regex(/[^A-Za-z0-9]/, "Password must contain at least one symbol")
            .optional()
            .or(z.literal('')),

        // Client fields
        companyName: z.string().optional(),
        businessType: z.string().optional(),
        taxId: z.string().optional(),
        status: z.nativeEnum(ClientStatus).optional(),
        currency: z.string().optional(),
        notes: z.string().optional(),
        groupId: z.number().nullable().optional(),

        // Contact fields (updates primary contact)
        phone: z.string().optional(),
        whatsAppNumber: z.string().optional(),
        address1: z.string().optional(),
        address2: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zip: z.string().optional(),
        country: z.string().optional(),
    }),
});

// Client Contact Schemas
export const createContactSchema = z.object({
    params: z.object({
        clientId: z.string().transform((val: string) => parseInt(val, 10)),
    }),
    body: z.object({
        firstName: z.string(),
        lastName: z.string(),
        email: z.string().email(),
        contactType: z.nativeEnum(ContactType).optional(),
        phone: z.string().optional(),
        address1: z.string().optional(),
        city: z.string().optional(),
        country: z.string().optional(),
        isPrimary: z.boolean().optional(),
    }),
});

// Client Group Schemas
export const groupSchema = z.object({
    body: z.object({
        groupName: z.string().min(1),
        groupColor: z.string().optional(),
        discountPercentage: z.number().min(0).max(100).optional(),
        taxExempt: z.boolean().optional(),
    }),
});

// Product Service Schemas
export const serviceSchema = z.object({
    body: z.object({
        name: z.string().min(1),
        slug: z.string().min(1),
        description: z.string().optional(),
        parentServiceId: z.number().nullable().optional(),
        displayOrder: z.number().optional(),
        iconClass: z.string().optional(),
    }),
});

// Product Schemas
export const productSchema = z.object({
    body: z.object({
        name: z.string().min(1),
        slug: z.string().min(1),
        serviceId: z.number(),
        productType: z.any(), // Match ProductType enum
        pricingModel: z.any(), // Match PricingModel
        description: z.string().optional(),
        features: z.any().optional(),
        setupFee: z.number().nullable().optional().or(z.literal('')).transform(val => (val === '' || val === null) ? 0 : val),
        monthlyPrice: z.number().nullable().optional().or(z.literal('')).transform(val => (val === '' || val === null) ? 0 : val),
        quarterlyPrice: z.number().nullable().optional().or(z.literal('')).transform(val => (val === '' || val === null) ? 0 : val),
        semiAnnualPrice: z.number().nullable().optional().or(z.literal('')).transform(val => (val === '' || val === null) ? 0 : val),
        annualPrice: z.number().nullable().optional().or(z.literal('')).transform(val => (val === '' || val === null) ? 0 : val),
        biennialPrice: z.number().nullable().optional().or(z.literal('')).transform(val => (val === '' || val === null) ? 0 : val),
        triennialPrice: z.number().nullable().optional().or(z.literal('')).transform(val => (val === '' || val === null) ? 0 : val),
        status: z.any().optional(), // Match ProductStatus
        stockQuantity: z.number().nullable().optional().or(z.literal('')).transform(val => (val === '' || val === null) ? null : val),
        autoSetup: z.boolean().optional(),
        serverId: z.number().nullable().optional(),
    }),
});

// Reseller Product Markup Schema
export const resellerProductSchema = z.object({
    body: z.object({
        productId: z.number(),
        markupPercentage: z.number().optional(),
        customPrice: z.number().optional(),
        status: z.string().optional(),
    }),
});
// Order Management Schemas
export const createOrderSchema = z.object({
    body: z.object({
        clientId: z.number().optional(),
        paymentMethod: z.string().optional(),
        promoCode: z.string().optional(),
        notes: z.string().optional(),
        items: z.array(z.object({
            productId: z.number(),
            billingCycle: z.string(),
            quantity: z.number().int().positive().default(1),
            domainName: z.string().optional(),
            configOptions: z.any().optional(),
        })).min(1),
    }),
});

export const updateOrderStatusSchema = z.object({
    params: z.object({
        id: z.string().transform((val: string) => parseInt(val, 10)),
    }),
    body: z.object({
        status: z.any(), // Match OrderStatus enum
        reason: z.string().optional(),
    }),
});
// Billing & Financial Schemas
export const invoiceSchema = z.object({
    body: z.object({
        clientId: z.number(),
        dueDate: z.string().transform((val) => new Date(val)),
        status: z.any().optional(), // Match InvoiceStatus enum
        paymentMethod: z.string().optional(),
        items: z.array(z.object({
            description: z.string(),
            quantity: z.number().default(1),
            unitPrice: z.number(),
            taxRate: z.number().optional(),
        })).min(1),
    }),
});

export const currencySchema = z.object({
    body: z.object({
        code: z.string().length(3),
        prefix: z.string().optional(),
        suffix: z.string().optional(),
        rate: z.number(),
        isDefault: z.boolean().optional(),
    }),
});

export const taxRateSchema = z.object({
    body: z.object({
        country: z.string().optional(),
        state: z.string().optional(),
        taxRate: z.number(),
        compound: z.boolean().optional(),
        appliedToProducts: z.array(z.number()).optional(),
    }),
});

export const billableItemSchema = z.object({
    body: z.object({
        clientId: z.number(),
        description: z.string(),
        quantity: z.number().default(1),
        unitPrice: z.number(),
        recurringFrequency: z.string().optional(),
        nextInvoiceDate: z.string().transform((val) => new Date(val)).optional(),
    }),
});

export const paymentSchema = z.object({
    body: z.object({
        invoiceId: z.number(),
        amount: z.number(),
        paymentMethod: z.enum(['BKASH', 'NAGAD']),
        transactionId: z.string(),
    }),
});
// Service Provisioning Schemas
export const serverSchema = z.object({
    body: z.object({
        serverName: z.string().min(1),
        serverType: z.enum(['shared', 'vps', 'dedicated']),
        hostname: z.string(),
        ipAddress: z.string().regex(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/),
        username: z.string().optional(),
        password: z.string().optional(),
        apiKey: z.string().optional(),
        maxAccounts: z.number().int().optional(),
        status: z.string().optional(),
    }),
});

// Service Provisioning Schemas
export const createServiceSchema = z.object({
    body: z.object({
        clientId: z.number(),
        productId: z.number(),
        serverId: z.number().optional().nullable(),
        domain: z.string().optional().nullable(),
        billingCycle: z.string().default('monthly'),
        status: z.nativeEnum(ServiceStatus).default(ServiceStatus.PENDING),
        amount: z.number().optional(),
        nextDueDate: z.string().transform(val => new Date(val)).optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        ipAddress: z.string().optional(),
        controlPanelUrl: z.string().optional(),
    }),
});

export const serviceUpdateSchema = z.object({
    params: z.object({
        id: z.string().transform((val: string) => parseInt(val, 10)),
    }),
    body: z.object({
        status: z.nativeEnum(ServiceStatus).optional(),
        domain: z.string().optional(),
        nextDueDate: z.string().transform((val) => new Date(val)).optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        ipAddress: z.string().optional(),
        diskUsage: z.number().optional(),
        bandwidthUsage: z.number().optional(),
        amount: z.number().optional(),
        billingCycle: z.string().optional(),
        serverId: z.number().optional().nullable(),
        controlPanelUrl: z.string().optional(),
    }),
});

export const cancellationRequestSchema = z.object({
    body: z.object({
        serviceId: z.number(),
        reason: z.string().min(10, 'Please provide a detailed reason (at least 10 characters)'),
        type: z.enum(['IMMEDIATE', 'END_OF_CYCLE']),
    }),
});
// Support Ticket Schemas
export const ticketSchema = z.object({
    body: z.object({
        clientId: z.number().optional(),
        subject: z.string().min(5),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
        departmentId: z.number(),
        serviceId: z.number().optional().nullable(),
        message: z.string().min(10), // Initial message
    }),
});

export const replySchema = z.object({
    body: z.object({
        message: z.string().min(2),
        isInternalNote: z.boolean().optional(),
        attachments: z.array(z.any()).optional(),
    }),
});

export const departmentSchema = z.object({
    body: z.object({
        name: z.string().min(2),
        email: z.string().email(),
        autoresponderEnabled: z.boolean().optional(),
        assignedSupportId: z.number().int().optional().nullable(),
    }),
});

export const predefinedReplySchema = z.object({
    body: z.object({
        title: z.string().min(1),
        category: z.string().min(1),
        message: z.string().min(1),
        tags: z.string().optional().default(''),
    }),
});
// Marketing & Affiliate Schemas
export const affiliateSchema = z.object({
    body: z.object({
        commissionRate: z.number().min(0).max(100),
        referralCode: z.string().min(3).optional(),
    }),
});

export const promotionSchema = z.object({
    body: z.object({
        code: z.string().min(3),
        type: z.enum(['percentage', 'fixed']),
        value: z.number().positive(),
        validFrom: z.string().transform((val) => new Date(val)),
        validUntil: z.string().transform((val) => new Date(val)).optional(),
        usageLimit: z.number().int().optional(),
        minimumOrderAmount: z.number().optional(),
        applicableProducts: z.array(z.number()).optional(),
    }),
});
// System & Logging Schemas
export const systemSettingSchema = z.object({
    body: z.object({
        settingKey: z.string().min(1),
        settingValue: z.string(),
        settingGroup: z.string(),
        encrypted: z.boolean().optional(),
    }),
});
// Reporting Schemas
export const reportSchema = z.object({
    query: z.object({
        startDate: z.string().transform((val) => new Date(val)).optional(),
        endDate: z.string().transform((val) => new Date(val)).optional(),
        groupBy: z.enum(['day', 'month', 'year']).optional(),
    }),
});
// Domain Management Schemas
export const tldSchema = z.object({
    body: z.object({
        tld: z.string().min(2),
        registrar: z.string().optional().nullable(),
        registrationPrice: z.number().nonnegative(),
        renewalPrice: z.number().nonnegative(),
        transferPrice: z.number().nonnegative(),
        dnsManagement: z.boolean().optional(),
        emailForwarding: z.boolean().optional(),
        idProtection: z.boolean().optional(),
        eppRequired: z.boolean().optional(),
        autoRegistration: z.boolean().optional(),
    }),
});

export const registerDomainSchema = z.object({
    body: z.object({
        clientId: z.number(),
        domainName: z.string().min(3),
        regPeriod: z.number().min(1).max(10),
        registrar: z.string().optional(),
        autoRenew: z.boolean().optional(),
        dnsManagement: z.boolean().optional(),
        emailForwarding: z.boolean().optional(),
        idProtection: z.boolean().optional(),
        status: z.any().optional(),
        eppCode: z.string().optional(),
    }),
});

export const updateDomainSchema = z.object({
    params: z.object({
        id: z.string().transform((val: string) => parseInt(val, 10)),
    }),
    body: z.object({
        clientId: z.number().optional(),
        domainName: z.string().optional(),
        status: z.any().optional(), // Match DomainStatus
        expiryDate: z.string().transform(val => new Date(val)).optional(),
        autoRenew: z.boolean().optional(),
        dnsManagement: z.boolean().optional(),
        emailForwarding: z.boolean().optional(),
        idProtection: z.boolean().optional(),
        registrar: z.string().optional(),
        eppCode: z.string().optional(),
    }),
});

// System Admin Phase 10 Schemas
export const todoItemSchema = z.object({
    body: z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high']),
        dueDate: z.string().transform((val) => new Date(val)).optional(),
        status: z.string().optional(),
    }),
});

export const calendarEventSchema = z.object({
    body: z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        startDate: z.string().transform((val) => new Date(val)),
        endDate: z.string().transform((val) => new Date(val)).optional(),
        allDay: z.boolean().optional(),
        color: z.string().optional(),
    }),
});

export const whoisLookupSchema = z.object({
    body: z.object({
        domain: z.string().min(3),
    }),
});
