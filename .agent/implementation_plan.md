# Backend Update Plan: Alignment with Sidebar Features

This plan outlines the steps required to implement missing backend features to achieve full parity with the functionalities listed in `sidebar.html`.

## User Review Required

> [!IMPORTANT]
> Some features like "Attempt CC Capture" and "Generate Due Invoices" require background workers or cron jobs which are not yet fully defined in the architecture. I will implement the logic as service methods first.

## Proposed Changes

### Database Schema Updates
Add missing models to `prisma/schema.prisma`.

#### [MODIFY] [schema.prisma](file:///e:/Naimur%20Sharon/WHMCS/backend/prisma/schema.prisma)
- Add `BannedIP` model to track restricted access.
- Add `SecurityQuestion` and `ClientSecurityQuestion` models for enhanced security.
- Add `DomainTLD` model for TLD pricing and sync management.
- Update `LinkTracking` if needed for better campaign management.

### New Controllers & Services
Implement the business logic for the new features.

#### [NEW] [security.controller.ts](file:///e:/Naimur%20Sharon/WHMCS/backend/src/controllers/security.controller.ts)
- `getBannedIPs`, `banIP`, `unbanIP`.
- `getSecurityQuestions`, `manageSecurityQuestions`.

#### [MODIFY] [system.controller.ts](file:///e:/Naimur%20Sharon/WHMCS/backend/src/controllers/system.controller.ts)
- Implement `domainResolver` (DNS lookup logic).
- Implement `tldSync` logic.

#### [MODIFY] [invoices.controller.ts](file:///e:/Naimur%20Sharon/WHMCS/backend/src/controllers/invoices.controller.ts)
- Implement `generateDueInvoices` (logic to find services due for billing and create invoices).

#### [MODIFY] [finance.controller.ts](file:///e:/Naimur%20Sharon/WHMCS/backend/src/controllers/finance.controller.ts)
- Implement `attemptCCCapture` (mock logic for payment gateway processing).

### API Route Registration

#### [NEW] [security.routes.ts](file:///e:/Naimur%20Sharon/WHMCS/backend/src/routes/api/security.routes.ts)
- Register endpoints for IP banning and security questions.

#### [MODIFY] [index.ts (routes)](file:///e:/Naimur%20Sharon/WHMCS/backend/src/routes/api/index.ts)
- Register `security.routes.ts`.

## Verification Plan

### Automated Tests
- Create integration tests for each new endpoint using Jest and Supertest.
- Test scenarios:
    - Attempting login from a Banned IP should fail.
    - Generating invoices should correctly pick up active services with past-due `nextDueDate`.
    - TLD sync should update local pricing from a (mocked) registrar.

### Manual Verification
- Use Postman/Thunder Client to call the new endpoints and verify the database state.
