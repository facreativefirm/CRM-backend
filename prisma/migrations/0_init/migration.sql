-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('BILLING', 'TECHNICAL', 'PRIMARY', 'OTHER');

-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED', 'TRANSFERRED', 'PENDING');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'UNPAID', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED', 'COLLECTIONS', 'PAYMENT_PENDING', 'PARTIALLY_PAID');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PROCESSING', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'FRAUD', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('HOSTING', 'VPS', 'DOMAIN', 'SSL', 'RESELLER', 'ADDON', 'OTHER', 'WEB_DEVELOPMENT', 'SOFTWARE_DEVELOPMENT', 'MARKETING');

-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('ONETIME', 'RECURRING', 'FREE', 'USAGE_BASED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED', 'TERMINATED', 'PENDING');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'STAFF', 'RESELLER', 'CLIENT', 'INVESTOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "ResellerType" AS ENUM ('BASIC', 'PROFESSIONAL', 'ENTERPRISE', 'WHITELABEL');

-- CreateEnum
CREATE TYPE "SalesTeamStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "ProspectStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'CONTACTED', 'NEGOTIATING', 'CONVERTED', 'LOST', 'FRAUD');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REQUIRES_MORE_INFO');

-- CreateEnum
CREATE TYPE "ProofType" AS ENUM ('PHOTO', 'GPS_LOCATION', 'SIGNATURE', 'BUSINESS_CARD', 'MEETING_NOTES', 'OTHER');

-- CreateEnum
CREATE TYPE "PointTransactionType" AS ENUM ('PROSPECT_ENTRY', 'CONVERSION_BONUS', 'FRAUD_DEDUCTION', 'ADMIN_ADJUSTMENT', 'WITHDRAWAL', 'BONUS', 'PENALTY');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'APPROVED', 'PROCESSING', 'PAID', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "client" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "resellerId" INTEGER,
    "referredByReseller" BOOLEAN NOT NULL DEFAULT false,
    "companyName" TEXT,
    "businessType" TEXT,
    "taxId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "creditBalance" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "clientSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "groupId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "guestIpAddress" TEXT,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "erpMetadata" TEXT,
    "externalId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "syncError" TEXT,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientcontact" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "contactType" "ContactType" NOT NULL DEFAULT 'PRIMARY',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address1" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "country" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientcontact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientcustomfieldvalue" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "fieldId" INTEGER NOT NULL,
    "fieldValue" TEXT NOT NULL,

    CONSTRAINT "clientcustomfieldvalue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientgroup" (
    "id" SERIAL NOT NULL,
    "groupName" TEXT NOT NULL,
    "groupColor" TEXT,
    "discountPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    "taxExempt" BOOLEAN NOT NULL DEFAULT false,
    "settings" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientgroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientsecurityquestion" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "questionId" INTEGER NOT NULL,
    "answerHash" TEXT NOT NULL,

    CONSTRAINT "clientsecurityquestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "referralCode" TEXT NOT NULL,
    "commissionRate" DECIMAL(5,2) NOT NULL,
    "totalEarnings" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "paidEarnings" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "pendingEarnings" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "referralCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliatereferral" (
    "id" SERIAL NOT NULL,
    "affiliateId" INTEGER NOT NULL,
    "referredClientId" INTEGER NOT NULL,
    "referredOrderId" INTEGER,
    "commissionAmount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "referralDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliatereferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bannedip" (
    "id" SERIAL NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "reason" TEXT,
    "bannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "bannedBy" INTEGER,

    CONSTRAINT "bannedip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billableitem" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "recurringFrequency" TEXT,
    "nextInvoiceDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'UNINVOICED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billableitem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendarevent" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "createdById" INTEGER NOT NULL,
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendarevent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cancellationrequest" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actionDate" TIMESTAMP(3),

    CONSTRAINT "cancellationrequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customfield" (
    "id" SERIAL NOT NULL,
    "fieldName" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL,
    "optionsJson" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "adminOnly" BOOLEAN NOT NULL DEFAULT false,
    "showInvoice" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "customfield_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "securityquestion" (
    "id" SERIAL NOT NULL,
    "question" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "securityquestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "prefix" TEXT,
    "suffix" TEXT,
    "rate" DECIMAL(10,4) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "currency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "domainName" TEXT NOT NULL,
    "registrationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "registrar" TEXT NOT NULL,
    "status" "DomainStatus" NOT NULL DEFAULT 'ACTIVE',
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "dnsManagement" BOOLEAN NOT NULL DEFAULT false,
    "emailForwarding" BOOLEAN NOT NULL DEFAULT false,
    "idProtection" BOOLEAN NOT NULL DEFAULT false,
    "nameservers" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "eppCode" TEXT,

    CONSTRAINT "domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domainproduct" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "tld" TEXT NOT NULL,
    "registrationPrice" DECIMAL(10,2) NOT NULL,
    "renewalPrice" DECIMAL(10,2) NOT NULL,
    "transferPrice" DECIMAL(10,2) NOT NULL,
    "registrar" TEXT NOT NULL,
    "eppRequired" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "domainproduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domaintld" (
    "id" SERIAL NOT NULL,
    "tld" TEXT NOT NULL,
    "registrar" TEXT,
    "registrationPrice" DECIMAL(10,2) NOT NULL,
    "renewalPrice" DECIMAL(10,2) NOT NULL,
    "transferPrice" DECIMAL(10,2) NOT NULL,
    "dnsManagement" BOOLEAN NOT NULL DEFAULT false,
    "emailForwarding" BOOLEAN NOT NULL DEFAULT false,
    "idProtection" BOOLEAN NOT NULL DEFAULT false,
    "eppRequired" BOOLEAN NOT NULL DEFAULT false,
    "autoRegistration" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domaintld_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice" (
    "id" SERIAL NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "clientId" INTEGER NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "subtotal" DECIMAL(10,2) NOT NULL,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "paymentMethod" TEXT,
    "paidDate" TIMESTAMP(3),
    "lateFeeApplied" BOOLEAN NOT NULL DEFAULT false,
    "orderId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "adminNotes" TEXT,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "externalId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "syncError" TEXT,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoiceitem" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "serviceId" INTEGER,
    "domainId" INTEGER,
    "metadata" TEXT,

    CONSTRAINT "invoiceitem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linktracking" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "campaign" TEXT,
    "source" TEXT,
    "medium" TEXT,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "uniqueClicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "linktracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "networkissue" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "affectedServices" TEXT,
    "updates" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "networkissue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order" (
    "id" SERIAL NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "clientId" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "promoCode" TEXT,
    "fraudCheckData" TEXT,
    "notes" TEXT,
    "adminNotes" TEXT,
    "resellerId" INTEGER,
    "isResellerOrder" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orderitem" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "domainName" TEXT,
    "billingCycle" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "setupFee" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "configOptions" TEXT,

    CONSTRAINT "orderitem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orderstatushistory" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "oldStatus" TEXT NOT NULL,
    "newStatus" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changeReason" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orderstatushistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paymentgateway" (
    "id" SERIAL NOT NULL,
    "gatewayName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "settings" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "testMode" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "paymentgateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manualpaymentmethod" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "accountNumber" TEXT,
    "accountName" TEXT,
    "branchName" TEXT,
    "instructionsEn" TEXT,
    "instructionsBn" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manualpaymentmethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predefinedreply" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "predefinedreply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "productType" "ProductType" NOT NULL,
    "pricingModel" "PricingModel" NOT NULL,
    "description" TEXT,
    "features" TEXT,
    "setupFee" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "monthlyPrice" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "quarterlyPrice" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "semiAnnualPrice" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "annualPrice" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "biennialPrice" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "triennialPrice" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "stockQuantity" INTEGER,
    "autoSetup" BOOLEAN NOT NULL DEFAULT false,
    "serverId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "externalId" TEXT,
    "glAccountCode" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_services" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parentServiceId" INTEGER,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "iconClass" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "minimumOrderAmount" DECIMAL(10,2),
    "recurrence" INTEGER,
    "applicableProducts" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote" (
    "id" SERIAL NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "clientId" INTEGER NOT NULL,
    "proposalDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "terms" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId" INTEGER,
    "subject" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "taxTotal" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quoteitem" (
    "id" SERIAL NOT NULL,
    "quoteId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "productId" INTEGER,
    "billingCycle" TEXT,
    "domainName" TEXT,

    CONSTRAINT "quoteitem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resellercommission" (
    "id" SERIAL NOT NULL,
    "resellerId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "orderAmount" DECIMAL(10,2) NOT NULL,
    "commissionRate" DECIMAL(5,2) NOT NULL,
    "commissionAmount" DECIMAL(10,2) NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "payoutId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resellercommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resellerpayout" (
    "id" SERIAL NOT NULL,
    "resellerId" INTEGER NOT NULL,
    "payoutPeriodStart" TIMESTAMP(3) NOT NULL,
    "payoutPeriodEnd" TIMESTAMP(3) NOT NULL,
    "totalCommissions" DECIMAL(10,2) NOT NULL,
    "fees" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "netAmount" DECIMAL(10,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "transactionId" TEXT,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "paidDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resellerpayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resellerproduct" (
    "id" SERIAL NOT NULL,
    "resellerId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "markupPercentage" DECIMAL(5,2) NOT NULL DEFAULT 20.00,
    "customPrice" DECIMAL(10,2),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "maxQuantity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resellerproduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server" (
    "id" SERIAL NOT NULL,
    "serverName" TEXT NOT NULL,
    "serverType" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "username" TEXT,
    "passwordHash" TEXT,
    "apiKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "maxAccounts" INTEGER,
    "location" TEXT,
    "provider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "orderId" INTEGER,
    "domain" TEXT,
    "status" "ServiceStatus" NOT NULL DEFAULT 'PENDING',
    "nextDueDate" TIMESTAMP(3),
    "terminationDate" TIMESTAMP(3),
    "serverId" INTEGER,
    "username" TEXT,
    "passwordHash" TEXT,
    "ipAddress" TEXT,
    "diskUsage" DECIMAL(10,2),
    "bandwidthUsage" DECIMAL(10,2),
    "configOptions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "controlPanelUrl" TEXT,

    CONSTRAINT "service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "serviceaddon" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "applicableTo" TEXT,
    "productId" INTEGER,

    CONSTRAINT "serviceaddon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activeTicketId" INTEGER,
    "lastPresenceAt" TIMESTAMP(3),

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "department" TEXT,
    "permissionsLevel" TEXT NOT NULL DEFAULT 'limited',
    "signature" TEXT,
    "assignedTicketsCount" INTEGER NOT NULL DEFAULT 0,
    "performanceMetrics" TEXT,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supportticket" (
    "id" SERIAL NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "clientId" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "departmentId" INTEGER NOT NULL,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "lastReplyDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedToId" INTEGER,
    "serviceId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "staffId" INTEGER,

    CONSTRAINT "supportticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticketdepartment" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "autoresponderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "assignedSupportId" INTEGER,

    CONSTRAINT "ticketdepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticketreply" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "attachments" TEXT,
    "isInternalNote" BOOLEAN NOT NULL DEFAULT false,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticketreply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todoitem" (
    "id" SERIAL NOT NULL,
    "staffId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "todoitem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "systemsetting" (
    "id" SERIAL NOT NULL,
    "settingKey" TEXT NOT NULL,
    "settingValue" TEXT NOT NULL,
    "settingGroup" TEXT NOT NULL,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "systemsetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxrate" (
    "id" SERIAL NOT NULL,
    "country" TEXT,
    "state" TEXT,
    "taxRate" DECIMAL(5,2) NOT NULL,
    "compound" BOOLEAN NOT NULL DEFAULT false,
    "appliedToProducts" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taxrate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "gateway" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "fees" DECIMAL(10,2),
    "status" TEXT NOT NULL,
    "transactionId" TEXT,
    "gatewayResponse" TEXT,
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "externalId" TEXT,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whoislog" (
    "id" SERIAL NOT NULL,
    "domain" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "result" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whoislog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund" (
    "id" SERIAL NOT NULL,
    "transactionId" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_AUTHORIZATION',
    "requestedById" INTEGER NOT NULL,
    "authorizedById" INTEGER,
    "approvedById" INTEGER,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expirynotificationrecord" (
    "id" SERIAL NOT NULL,
    "serviceId" INTEGER,
    "domainId" INTEGER,
    "userId" INTEGER NOT NULL,
    "notificationType" TEXT NOT NULL,
    "daysToExpiry" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expirynotificationrecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activitylog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "activity" TEXT NOT NULL,
    "details" TEXT,
    "ipAddress" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activitylog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "userType" "UserType" NOT NULL DEFAULT 'CLIENT',
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "twoFactorAuth" BOOLEAN NOT NULL DEFAULT false,
    "lastLogin" TIMESTAMP(3),
    "resellerType" "ResellerType",
    "commissionRate" DECIMAL(5,2),
    "markupRate" DECIMAL(5,2),
    "whiteLabelEnabled" BOOLEAN NOT NULL DEFAULT false,
    "customDomain" TEXT,
    "brandSettings" TEXT,
    "monthlyFee" DECIMAL(10,2),
    "nextBillingDate" TIMESTAMP(3),
    "maxClients" INTEGER,
    "maxProducts" INTEGER,
    "diskSpaceLimit" DECIMAL(10,2),
    "bandwidthLimit" DECIMAL(10,2),
    "resellerFeatures" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "phoneNumber" TEXT,
    "whatsAppNumber" TEXT,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salesteammember" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "employeeId" TEXT,
    "department" TEXT,
    "territory" TEXT,
    "totalPoints" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "availablePoints" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "withdrawnPoints" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "totalProspects" INTEGER NOT NULL DEFAULT 0,
    "totalConversions" INTEGER NOT NULL DEFAULT 0,
    "conversionRate" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    "fraudCount" INTEGER NOT NULL DEFAULT 0,
    "status" "SalesTeamStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salesteammember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospectclient" (
    "id" SERIAL NOT NULL,
    "salesMemberId" INTEGER NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "alternatePhone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "gpsLatitude" DECIMAL(10,8),
    "gpsLongitude" DECIMAL(11,8),
    "businessType" TEXT,
    "industryCategory" TEXT,
    "companySize" TEXT,
    "annualRevenue" TEXT,
    "currentSoftware" TEXT,
    "painPoints" TEXT,
    "budgetRange" TEXT,
    "decisionMaker" TEXT,
    "purchaseTimeline" TEXT,
    "interestedServices" TEXT,
    "specificRequirements" TEXT,
    "competitorUsage" TEXT,
    "status" "ProspectStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "convertedToClientId" INTEGER,
    "convertedAt" TIMESTAMP(3),
    "pointsAwarded" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "conversionPointsAwarded" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedById" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "fraudFlag" BOOLEAN NOT NULL DEFAULT false,
    "fraudReason" TEXT,
    "visitDate" TIMESTAMP(3),
    "followUpDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prospectclient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proofsubmission" (
    "id" SERIAL NOT NULL,
    "prospectId" INTEGER NOT NULL,
    "submittedById" INTEGER NOT NULL,
    "proofType" "ProofType" NOT NULL,
    "fileUrl" TEXT,
    "gpsLatitude" DECIMAL(10,8),
    "gpsLongitude" DECIMAL(11,8),
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedById" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "verificationNotes" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proofsubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pointtransaction" (
    "id" SERIAL NOT NULL,
    "salesMemberId" INTEGER NOT NULL,
    "prospectId" INTEGER,
    "transactionType" "PointTransactionType" NOT NULL,
    "points" DECIMAL(10,2) NOT NULL,
    "balanceBefore" DECIMAL(10,2) NOT NULL,
    "balanceAfter" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "processedById" INTEGER,
    "approvedById" INTEGER,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pointtransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawalrequest" (
    "id" SERIAL NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "salesMemberId" INTEGER NOT NULL,
    "pointsRequested" DECIMAL(10,2) NOT NULL,
    "amountInCurrency" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentMethod" TEXT NOT NULL,
    "paymentDetails" TEXT,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedById" INTEGER,
    "processedAt" TIMESTAMP(3),
    "processingNotes" TEXT,
    "paidById" INTEGER,
    "paidAt" TIMESTAMP(3),
    "transactionReference" TEXT,
    "paymentProof" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawalrequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "userapplication" (
    "id" SERIAL NOT NULL,
    "userType" "UserType" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "reason" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "processedAt" TIMESTAMP(3),
    "processedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "userapplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "commissionType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "commissionValue" DECIMAL(10,2) NOT NULL,
    "totalEarnings" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "paidEarnings" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "pendingEarnings" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "walletBalance" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investorcommission" (
    "id" SERIAL NOT NULL,
    "investorId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "invoiceAmount" DECIMAL(10,2) NOT NULL,
    "commissionAmount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investorcommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investorpayout" (
    "id" SERIAL NOT NULL,
    "investorId" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "transactionId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investorpayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guestactivity" (
    "id" SERIAL NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "ticketId" INTEGER,
    "activityType" TEXT NOT NULL DEFAULT 'TICKET_INITIATION',
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guestactivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooksubscription" (
    "id" SERIAL NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "secretKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhooksubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrationqueue" (
    "id" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integrationqueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gatewaylog" (
    "id" SERIAL NOT NULL,
    "gateway" TEXT NOT NULL,
    "transactionId" TEXT,
    "requestData" TEXT,
    "responseData" TEXT,
    "status" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gatewaylog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_userId_key" ON "client"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "client_externalId_key" ON "client"("externalId");

-- CreateIndex
CREATE INDEX "Client_clientSince_idx" ON "client"("clientSince");

-- CreateIndex
CREATE INDEX "Client_companyName_idx" ON "client"("companyName");

-- CreateIndex
CREATE INDEX "Client_resellerId_idx" ON "client"("resellerId");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "client"("status");

-- CreateIndex
CREATE INDEX "client_groupId_idx" ON "client"("groupId");

-- CreateIndex
CREATE INDEX "ClientContact_clientId_idx" ON "clientcontact"("clientId");

-- CreateIndex
CREATE INDEX "ClientContact_email_idx" ON "clientcontact"("email");

-- CreateIndex
CREATE INDEX "ClientCustomFieldValue_clientId_idx" ON "clientcustomfieldvalue"("clientId");

-- CreateIndex
CREATE INDEX "ClientCustomFieldValue_fieldId_idx" ON "clientcustomfieldvalue"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCustomFieldValue_clientId_fieldId_key" ON "clientcustomfieldvalue"("clientId", "fieldId");

-- CreateIndex
CREATE INDEX "ClientSecurityQuestion_clientId_idx" ON "clientsecurityquestion"("clientId");

-- CreateIndex
CREATE INDEX "ClientSecurityQuestion_questionId_idx" ON "clientsecurityquestion"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientSecurityQuestion_clientId_questionId_key" ON "clientsecurityquestion"("clientId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_clientId_unique" ON "affiliate"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_referralCode_key" ON "affiliate"("referralCode");

-- CreateIndex
CREATE INDEX "Affiliate_status_idx" ON "affiliate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "affiliatereferral_referredOrderId_key" ON "affiliatereferral"("referredOrderId");

-- CreateIndex
CREATE INDEX "AffiliateReferral_affiliateId_idx" ON "affiliatereferral"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateReferral_referralDate_idx" ON "affiliatereferral"("referralDate");

-- CreateIndex
CREATE INDEX "AffiliateReferral_referredClientId_idx" ON "affiliatereferral"("referredClientId");

-- CreateIndex
CREATE INDEX "AffiliateReferral_status_idx" ON "affiliatereferral"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BannedIP_ipAddress_key" ON "bannedip"("ipAddress");

-- CreateIndex
CREATE INDEX "BannedIP_ipAddress_idx" ON "bannedip"("ipAddress");

-- CreateIndex
CREATE INDEX "BillableItem_clientId_idx" ON "billableitem"("clientId");

-- CreateIndex
CREATE INDEX "BillableItem_nextInvoiceDate_idx" ON "billableitem"("nextInvoiceDate");

-- CreateIndex
CREATE INDEX "BillableItem_status_idx" ON "billableitem"("status");

-- CreateIndex
CREATE INDEX "CalendarEvent_allDay_idx" ON "calendarevent"("allDay");

-- CreateIndex
CREATE INDEX "CalendarEvent_createdById_idx" ON "calendarevent"("createdById");

-- CreateIndex
CREATE INDEX "CalendarEvent_startDate_idx" ON "calendarevent"("startDate");

-- CreateIndex
CREATE INDEX "CancellationRequest_clientId_idx" ON "cancellationrequest"("clientId");

-- CreateIndex
CREATE INDEX "CancellationRequest_requestDate_idx" ON "cancellationrequest"("requestDate");

-- CreateIndex
CREATE INDEX "CancellationRequest_serviceId_idx" ON "cancellationrequest"("serviceId");

-- CreateIndex
CREATE INDEX "CancellationRequest_status_idx" ON "cancellationrequest"("status");

-- CreateIndex
CREATE INDEX "CustomField_fieldName_idx" ON "customfield"("fieldName");

-- CreateIndex
CREATE UNIQUE INDEX "Currency_code_key" ON "currency"("code");

-- CreateIndex
CREATE INDEX "Currency_isDefault_idx" ON "currency"("isDefault");

-- CreateIndex
CREATE INDEX "Domain_clientId_idx" ON "domain"("clientId");

-- CreateIndex
CREATE INDEX "Domain_domainName_idx" ON "domain"("domainName");

-- CreateIndex
CREATE INDEX "Domain_expiryDate_idx" ON "domain"("expiryDate");

-- CreateIndex
CREATE INDEX "Domain_status_idx" ON "domain"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DomainProduct_productId_key" ON "domainproduct"("productId");

-- CreateIndex
CREATE INDEX "DomainProduct_tld_idx" ON "domainproduct"("tld");

-- CreateIndex
CREATE UNIQUE INDEX "DomainTLD_tld_key" ON "domaintld"("tld");

-- CreateIndex
CREATE INDEX "DomainTLD_tld_idx" ON "domaintld"("tld");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_externalId_key" ON "invoice"("externalId");

-- CreateIndex
CREATE INDEX "Invoice_clientId_idx" ON "invoice"("clientId");

-- CreateIndex
CREATE INDEX "Invoice_dueDate_idx" ON "invoice"("dueDate");

-- CreateIndex
CREATE INDEX "Invoice_invoiceDate_idx" ON "invoice"("invoiceDate");

-- CreateIndex
CREATE INDEX "Invoice_invoiceNumber_idx" ON "invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "invoice"("status");

-- CreateIndex
CREATE INDEX "invoice_orderId_idx" ON "invoice"("orderId");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "invoiceitem"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceItem_serviceId_idx" ON "invoiceitem"("serviceId");

-- CreateIndex
CREATE INDEX "invoiceitem_domainId_idx" ON "invoiceitem"("domainId");

-- CreateIndex
CREATE INDEX "LinkTracking_campaign_idx" ON "linktracking"("campaign");

-- CreateIndex
CREATE INDEX "LinkTracking_createdAt_idx" ON "linktracking"("createdAt");

-- CreateIndex
CREATE INDEX "LinkTracking_source_medium_idx" ON "linktracking"("source", "medium");

-- CreateIndex
CREATE INDEX "NetworkIssue_startDate_idx" ON "networkissue"("startDate");

-- CreateIndex
CREATE INDEX "NetworkIssue_status_idx" ON "networkissue"("status");

-- CreateIndex
CREATE INDEX "NetworkIssue_type_idx" ON "networkissue"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_clientId_idx" ON "order"("clientId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_orderNumber_idx" ON "order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_resellerId_idx" ON "order"("resellerId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "order"("status");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "orderitem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "orderitem"("productId");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_idx" ON "orderstatushistory"("orderId");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_timestamp_idx" ON "orderstatushistory"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentGateway_gatewayName_key" ON "paymentgateway"("gatewayName");

-- CreateIndex
CREATE INDEX "PaymentGateway_enabled_idx" ON "paymentgateway"("enabled");

-- CreateIndex
CREATE INDEX "manualpaymentmethod_enabled_idx" ON "manualpaymentmethod"("enabled");

-- CreateIndex
CREATE INDEX "manualpaymentmethod_displayOrder_idx" ON "manualpaymentmethod"("displayOrder");

-- CreateIndex
CREATE INDEX "PredefinedReply_category_idx" ON "predefinedreply"("category");

-- CreateIndex
CREATE INDEX "PredefinedReply_tags_idx" ON "predefinedreply"("tags");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "product_externalId_key" ON "product"("externalId");

-- CreateIndex
CREATE INDEX "Product_serviceId_idx" ON "product"("serviceId");

-- CreateIndex
CREATE INDEX "Product_slug_idx" ON "product"("slug");

-- CreateIndex
CREATE INDEX "Product_status_idx" ON "product"("status");

-- CreateIndex
CREATE INDEX "product_serverId_idx" ON "product"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "product_services_slug_key" ON "product_services"("slug");

-- CreateIndex
CREATE INDEX "product_services_slug_idx" ON "product_services"("slug");

-- CreateIndex
CREATE INDEX "product_services_parentServiceId_idx" ON "product_services"("parentServiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_code_key" ON "promotion"("code");

-- CreateIndex
CREATE INDEX "Promotion_code_idx" ON "promotion"("code");

-- CreateIndex
CREATE INDEX "Promotion_type_idx" ON "promotion"("type");

-- CreateIndex
CREATE INDEX "Promotion_validUntil_idx" ON "promotion"("validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_quoteNumber_key" ON "quote"("quoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "quote_invoiceId_key" ON "quote"("invoiceId");

-- CreateIndex
CREATE INDEX "Quote_clientId_idx" ON "quote"("clientId");

-- CreateIndex
CREATE INDEX "Quote_status_idx" ON "quote"("status");

-- CreateIndex
CREATE INDEX "Quote_validUntil_idx" ON "quote"("validUntil");

-- CreateIndex
CREATE INDEX "QuoteItem_quoteId_idx" ON "quoteitem"("quoteId");

-- CreateIndex
CREATE INDEX "quoteitem_productId_idx" ON "quoteitem"("productId");

-- CreateIndex
CREATE INDEX "ResellerCommission_createdAt_idx" ON "resellercommission"("createdAt");

-- CreateIndex
CREATE INDEX "ResellerCommission_payoutId_idx" ON "resellercommission"("payoutId");

-- CreateIndex
CREATE INDEX "ResellerCommission_resellerId_idx" ON "resellercommission"("resellerId");

-- CreateIndex
CREATE INDEX "ResellerCommission_status_idx" ON "resellercommission"("status");

-- CreateIndex
CREATE INDEX "resellercommission_clientId_idx" ON "resellercommission"("clientId");

-- CreateIndex
CREATE INDEX "resellercommission_orderId_idx" ON "resellercommission"("orderId");

-- CreateIndex
CREATE INDEX "resellercommission_productId_idx" ON "resellercommission"("productId");

-- CreateIndex
CREATE INDEX "ResellerPayout_payoutPeriodEnd_idx" ON "resellerpayout"("payoutPeriodEnd");

-- CreateIndex
CREATE INDEX "ResellerPayout_resellerId_idx" ON "resellerpayout"("resellerId");

-- CreateIndex
CREATE INDEX "ResellerPayout_status_idx" ON "resellerpayout"("status");

-- CreateIndex
CREATE INDEX "ResellerProduct_resellerId_idx" ON "resellerproduct"("resellerId");

-- CreateIndex
CREATE INDEX "resellerproduct_productId_idx" ON "resellerproduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ResellerProduct_resellerId_productId_key" ON "resellerproduct"("resellerId", "productId");

-- CreateIndex
CREATE INDEX "Service_clientId_idx" ON "service"("clientId");

-- CreateIndex
CREATE INDEX "Service_domain_idx" ON "service"("domain");

-- CreateIndex
CREATE INDEX "Service_nextDueDate_idx" ON "service"("nextDueDate");

-- CreateIndex
CREATE INDEX "Service_serverId_idx" ON "service"("serverId");

-- CreateIndex
CREATE INDEX "Service_status_idx" ON "service"("status");

-- CreateIndex
CREATE INDEX "service_orderId_idx" ON "service"("orderId");

-- CreateIndex
CREATE INDEX "service_productId_idx" ON "service"("productId");

-- CreateIndex
CREATE INDEX "ServiceAddon_productId_idx" ON "serviceaddon"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "session"("expiresAt");

-- CreateIndex
CREATE INDEX "Session_sessionToken_idx" ON "session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_userId_key" ON "staff"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_ticketNumber_key" ON "supportticket"("ticketNumber");

-- CreateIndex
CREATE INDEX "SupportTicket_assignedToId_idx" ON "supportticket"("assignedToId");

-- CreateIndex
CREATE INDEX "SupportTicket_clientId_idx" ON "supportticket"("clientId");

-- CreateIndex
CREATE INDEX "SupportTicket_lastReplyDate_idx" ON "supportticket"("lastReplyDate");

-- CreateIndex
CREATE INDEX "SupportTicket_priority_idx" ON "supportticket"("priority");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "supportticket"("status");

-- CreateIndex
CREATE INDEX "SupportTicket_ticketNumber_idx" ON "supportticket"("ticketNumber");

-- CreateIndex
CREATE INDEX "supportticket_departmentId_idx" ON "supportticket"("departmentId");

-- CreateIndex
CREATE INDEX "supportticket_serviceId_idx" ON "supportticket"("serviceId");

-- CreateIndex
CREATE INDEX "supportticket_staffId_idx" ON "supportticket"("staffId");

-- CreateIndex
CREATE INDEX "ticketdepartment_assignedSupportId_idx" ON "ticketdepartment"("assignedSupportId");

-- CreateIndex
CREATE INDEX "TicketReply_ticketId_idx" ON "ticketreply"("ticketId");

-- CreateIndex
CREATE INDEX "TicketReply_timestamp_idx" ON "ticketreply"("timestamp");

-- CreateIndex
CREATE INDEX "TicketReply_userId_idx" ON "ticketreply"("userId");

-- CreateIndex
CREATE INDEX "TodoItem_dueDate_idx" ON "todoitem"("dueDate");

-- CreateIndex
CREATE INDEX "TodoItem_priority_idx" ON "todoitem"("priority");

-- CreateIndex
CREATE INDEX "TodoItem_staffId_idx" ON "todoitem"("staffId");

-- CreateIndex
CREATE INDEX "TodoItem_status_idx" ON "todoitem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_settingKey_key" ON "systemsetting"("settingKey");

-- CreateIndex
CREATE INDEX "SystemSetting_settingGroup_idx" ON "systemsetting"("settingGroup");

-- CreateIndex
CREATE INDEX "TaxRate_country_idx" ON "taxrate"("country");

-- CreateIndex
CREATE INDEX "TaxRate_state_idx" ON "taxrate"("state");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_transactionId_key" ON "transaction"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_externalId_key" ON "transaction"("externalId");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "transaction"("createdAt");

-- CreateIndex
CREATE INDEX "Transaction_gateway_idx" ON "transaction"("gateway");

-- CreateIndex
CREATE INDEX "Transaction_invoiceId_idx" ON "transaction"("invoiceId");

-- CreateIndex
CREATE INDEX "Transaction_transactionId_idx" ON "transaction"("transactionId");

-- CreateIndex
CREATE INDEX "WhoisLog_domain_idx" ON "whoislog"("domain");

-- CreateIndex
CREATE INDEX "WhoisLog_timestamp_idx" ON "whoislog"("timestamp");

-- CreateIndex
CREATE INDEX "WhoisLog_userId_idx" ON "whoislog"("userId");

-- CreateIndex
CREATE INDEX "refund_approvedById_idx" ON "refund"("approvedById");

-- CreateIndex
CREATE INDEX "refund_authorizedById_idx" ON "refund"("authorizedById");

-- CreateIndex
CREATE INDEX "refund_requestedById_idx" ON "refund"("requestedById");

-- CreateIndex
CREATE INDEX "refund_transactionId_idx" ON "refund"("transactionId");

-- CreateIndex
CREATE INDEX "notification_userId_idx" ON "notification"("userId");

-- CreateIndex
CREATE INDEX "notification_isRead_idx" ON "notification"("isRead");

-- CreateIndex
CREATE INDEX "expirynotificationrecord_serviceId_idx" ON "expirynotificationrecord"("serviceId");

-- CreateIndex
CREATE INDEX "expirynotificationrecord_domainId_idx" ON "expirynotificationrecord"("domainId");

-- CreateIndex
CREATE INDEX "expirynotificationrecord_userId_idx" ON "expirynotificationrecord"("userId");

-- CreateIndex
CREATE INDEX "ActivityLog_activity_idx" ON "activitylog"("activity");

-- CreateIndex
CREATE INDEX "ActivityLog_timestamp_idx" ON "activitylog"("timestamp");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_idx" ON "activitylog"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "user"("email");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "user"("status");

-- CreateIndex
CREATE INDEX "User_userType_idx" ON "user"("userType");

-- CreateIndex
CREATE UNIQUE INDEX "salesteammember_userId_key" ON "salesteammember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "salesteammember_employeeId_key" ON "salesteammember"("employeeId");

-- CreateIndex
CREATE INDEX "salesteammember_userId_idx" ON "salesteammember"("userId");

-- CreateIndex
CREATE INDEX "salesteammember_status_idx" ON "salesteammember"("status");

-- CreateIndex
CREATE INDEX "salesteammember_territory_idx" ON "salesteammember"("territory");

-- CreateIndex
CREATE UNIQUE INDEX "prospectclient_convertedToClientId_key" ON "prospectclient"("convertedToClientId");

-- CreateIndex
CREATE INDEX "prospectclient_salesMemberId_idx" ON "prospectclient"("salesMemberId");

-- CreateIndex
CREATE INDEX "prospectclient_status_idx" ON "prospectclient"("status");

-- CreateIndex
CREATE INDEX "prospectclient_verificationStatus_idx" ON "prospectclient"("verificationStatus");

-- CreateIndex
CREATE INDEX "prospectclient_email_idx" ON "prospectclient"("email");

-- CreateIndex
CREATE INDEX "prospectclient_convertedToClientId_idx" ON "prospectclient"("convertedToClientId");

-- CreateIndex
CREATE INDEX "prospectclient_verifiedById_idx" ON "prospectclient"("verifiedById");

-- CreateIndex
CREATE INDEX "proofsubmission_prospectId_idx" ON "proofsubmission"("prospectId");

-- CreateIndex
CREATE INDEX "proofsubmission_submittedById_idx" ON "proofsubmission"("submittedById");

-- CreateIndex
CREATE INDEX "proofsubmission_verificationStatus_idx" ON "proofsubmission"("verificationStatus");

-- CreateIndex
CREATE INDEX "proofsubmission_verifiedById_idx" ON "proofsubmission"("verifiedById");

-- CreateIndex
CREATE INDEX "pointtransaction_salesMemberId_idx" ON "pointtransaction"("salesMemberId");

-- CreateIndex
CREATE INDEX "pointtransaction_transactionType_idx" ON "pointtransaction"("transactionType");

-- CreateIndex
CREATE INDEX "pointtransaction_createdAt_idx" ON "pointtransaction"("createdAt");

-- CreateIndex
CREATE INDEX "pointtransaction_approvedById_idx" ON "pointtransaction"("approvedById");

-- CreateIndex
CREATE INDEX "pointtransaction_processedById_idx" ON "pointtransaction"("processedById");

-- CreateIndex
CREATE INDEX "pointtransaction_prospectId_idx" ON "pointtransaction"("prospectId");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawalrequest_requestNumber_key" ON "withdrawalrequest"("requestNumber");

-- CreateIndex
CREATE INDEX "withdrawalrequest_salesMemberId_idx" ON "withdrawalrequest"("salesMemberId");

-- CreateIndex
CREATE INDEX "withdrawalrequest_status_idx" ON "withdrawalrequest"("status");

-- CreateIndex
CREATE INDEX "withdrawalrequest_requestedAt_idx" ON "withdrawalrequest"("requestedAt");

-- CreateIndex
CREATE INDEX "withdrawalrequest_paidById_idx" ON "withdrawalrequest"("paidById");

-- CreateIndex
CREATE INDEX "withdrawalrequest_processedById_idx" ON "withdrawalrequest"("processedById");

-- CreateIndex
CREATE UNIQUE INDEX "userapplication_email_key" ON "userapplication"("email");

-- CreateIndex
CREATE UNIQUE INDEX "userapplication_username_key" ON "userapplication"("username");

-- CreateIndex
CREATE UNIQUE INDEX "investor_userId_key" ON "investor"("userId");

-- CreateIndex
CREATE INDEX "investor_userId_idx" ON "investor"("userId");

-- CreateIndex
CREATE INDEX "investorcommission_investorId_idx" ON "investorcommission"("investorId");

-- CreateIndex
CREATE INDEX "investorcommission_invoiceId_idx" ON "investorcommission"("invoiceId");

-- CreateIndex
CREATE INDEX "investorpayout_investorId_idx" ON "investorpayout"("investorId");

-- CreateIndex
CREATE INDEX "investorpayout_status_idx" ON "investorpayout"("status");

-- CreateIndex
CREATE INDEX "guestactivity_ipAddress_createdAt_idx" ON "guestactivity"("ipAddress", "createdAt");

-- CreateIndex
CREATE INDEX "guestactivity_expiresAt_idx" ON "guestactivity"("expiresAt");

-- CreateIndex
CREATE INDEX "guestactivity_ticketId_idx" ON "guestactivity"("ticketId");

-- CreateIndex
CREATE INDEX "integrationqueue_status_nextAttemptAt_idx" ON "integrationqueue"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "GatewayLog_gateway_idx" ON "gatewaylog"("gateway");

-- CreateIndex
CREATE INDEX "GatewayLog_timestamp_idx" ON "gatewaylog"("timestamp");

-- CreateIndex
CREATE INDEX "GatewayLog_transactionId_idx" ON "gatewaylog"("transactionId");

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "clientgroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientcontact" ADD CONSTRAINT "clientcontact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientcustomfieldvalue" ADD CONSTRAINT "clientcustomfieldvalue_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientcustomfieldvalue" ADD CONSTRAINT "clientcustomfieldvalue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "customfield"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientsecurityquestion" ADD CONSTRAINT "clientsecurityquestion_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientsecurityquestion" ADD CONSTRAINT "clientsecurityquestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "securityquestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate" ADD CONSTRAINT "affiliate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliatereferral" ADD CONSTRAINT "affiliatereferral_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliatereferral" ADD CONSTRAINT "affiliatereferral_referredClientId_fkey" FOREIGN KEY ("referredClientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliatereferral" ADD CONSTRAINT "affiliatereferral_referredOrderId_fkey" FOREIGN KEY ("referredOrderId") REFERENCES "order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billableitem" ADD CONSTRAINT "billableitem_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendarevent" ADD CONSTRAINT "calendarevent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellationrequest" ADD CONSTRAINT "cancellationrequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellationrequest" ADD CONSTRAINT "cancellationrequest_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain" ADD CONSTRAINT "domain_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domainproduct" ADD CONSTRAINT "domainproduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoiceitem" ADD CONSTRAINT "invoiceitem_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoiceitem" ADD CONSTRAINT "invoiceitem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoiceitem" ADD CONSTRAINT "invoiceitem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orderitem" ADD CONSTRAINT "orderitem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orderitem" ADD CONSTRAINT "orderitem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orderstatushistory" ADD CONSTRAINT "orderstatushistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "server"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "product_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_services" ADD CONSTRAINT "product_services_parentServiceId_fkey" FOREIGN KEY ("parentServiceId") REFERENCES "product_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quoteitem" ADD CONSTRAINT "quoteitem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quoteitem" ADD CONSTRAINT "quoteitem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resellercommission" ADD CONSTRAINT "resellercommission_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resellercommission" ADD CONSTRAINT "resellercommission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resellercommission" ADD CONSTRAINT "resellercommission_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "resellerpayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resellercommission" ADD CONSTRAINT "resellercommission_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resellercommission" ADD CONSTRAINT "resellercommission_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resellerpayout" ADD CONSTRAINT "resellerpayout_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resellerproduct" ADD CONSTRAINT "resellerproduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resellerproduct" ADD CONSTRAINT "resellerproduct_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service" ADD CONSTRAINT "service_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service" ADD CONSTRAINT "service_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service" ADD CONSTRAINT "service_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service" ADD CONSTRAINT "service_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "server"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serviceaddon" ADD CONSTRAINT "serviceaddon_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supportticket" ADD CONSTRAINT "supportticket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supportticket" ADD CONSTRAINT "supportticket_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supportticket" ADD CONSTRAINT "supportticket_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "ticketdepartment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supportticket" ADD CONSTRAINT "supportticket_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supportticket" ADD CONSTRAINT "supportticket_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticketdepartment" ADD CONSTRAINT "ticketdepartment_assignedSupportId_fkey" FOREIGN KEY ("assignedSupportId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticketreply" ADD CONSTRAINT "ticketreply_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "supportticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticketreply" ADD CONSTRAINT "ticketreply_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todoitem" ADD CONSTRAINT "todoitem_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whoislog" ADD CONSTRAINT "whoislog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expirynotificationrecord" ADD CONSTRAINT "expirynotificationrecord_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expirynotificationrecord" ADD CONSTRAINT "expirynotificationrecord_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expirynotificationrecord" ADD CONSTRAINT "expirynotificationrecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activitylog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salesteammember" ADD CONSTRAINT "salesteammember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospectclient" ADD CONSTRAINT "prospectclient_convertedToClientId_fkey" FOREIGN KEY ("convertedToClientId") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospectclient" ADD CONSTRAINT "prospectclient_salesMemberId_fkey" FOREIGN KEY ("salesMemberId") REFERENCES "salesteammember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospectclient" ADD CONSTRAINT "prospectclient_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proofsubmission" ADD CONSTRAINT "proofsubmission_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospectclient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proofsubmission" ADD CONSTRAINT "proofsubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "salesteammember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proofsubmission" ADD CONSTRAINT "proofsubmission_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pointtransaction" ADD CONSTRAINT "pointtransaction_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pointtransaction" ADD CONSTRAINT "pointtransaction_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pointtransaction" ADD CONSTRAINT "pointtransaction_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospectclient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pointtransaction" ADD CONSTRAINT "pointtransaction_salesMemberId_fkey" FOREIGN KEY ("salesMemberId") REFERENCES "salesteammember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawalrequest" ADD CONSTRAINT "withdrawalrequest_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawalrequest" ADD CONSTRAINT "withdrawalrequest_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawalrequest" ADD CONSTRAINT "withdrawalrequest_salesMemberId_fkey" FOREIGN KEY ("salesMemberId") REFERENCES "salesteammember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor" ADD CONSTRAINT "investor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investorcommission" ADD CONSTRAINT "investorcommission_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "investor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investorcommission" ADD CONSTRAINT "investorcommission_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investorpayout" ADD CONSTRAINT "investorpayout_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "investor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guestactivity" ADD CONSTRAINT "guestactivity_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "supportticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

