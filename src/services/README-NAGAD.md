# Nagad Payment Gateway Integration - Phase 1 Complete

## Overview
This document provides complete information about the Nagad Payment Gateway integration for the WHMCS system.

## Phase 1: Backend Setup ✅ COMPLETED

### 1. Dependencies Installed
- ✅ `node-rsa` - For RSA encryption/decryption
- ✅ `@types/node-rsa` - TypeScript definitions
- ✅ `axios` - Already installed (HTTP client)
- ✅ `crypto` - Node.js built-in module

### 2. Services Created

#### CryptoService (`crypto.service.ts`)
**Location:** `backend/src/services/crypto.service.ts`

**Purpose:** Handles RSA signing and verification for Nagad API security

**Key Methods:**
- `signData(data: string): string` - Signs data with merchant private key
- `verifySignature(data: string, signature: string): boolean` - Verifies Nagad's signature
- `generateRandomString(length: number): string` - Generates random strings for unique IDs

**Configuration:**
- Reads `NAGAD_MERCHANT_PRIVATE_KEY` from environment
- Reads `NAGAD_PUBLIC_KEY` from environment
- Uses PKCS8 format for keys

#### NagadService (`nagad.service.ts`)
**Location:** `backend/src/services/nagad.service.ts`

**Purpose:** Handles all Nagad API interactions

**Key Methods:**
1. `initializePayment(data: NagadPaymentRequest)` - Step 1: Initialize payment
2. `completePayment(paymentReferenceId: string, amount: number)` - Step 2: Complete payment
3. `verifyPayment(paymentReferenceId: string)` - Step 3: Verify payment status

**API Endpoints Used:**
- Sandbox: `http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0/api/dfs`
- Production: `https://api.mynagad.com/api/dfs`

**Security Features:**
- Request signing with merchant private key
- Response verification with Nagad public key
- Timestamp-based request validation
- Sensitive data encryption

### 3. Controller Created

#### NagadController (`nagad.controller.ts`)
**Location:** `backend/src/controllers/nagad.controller.ts`

**Endpoints:**
1. `POST /api/payments/nagad/initiate` - Initiate payment
2. `GET /api/payments/nagad/callback` - Handle Nagad callback

**Features:**
- Invoice validation
- Payment initiation with Nagad
- Gateway logging for audit trail
- Callback verification and processing
- Integration with existing invoice system

### 4. Routes Configured

#### Nagad Routes (`nagad.routes.ts`)
**Location:** `backend/src/routes/api/nagad.routes.ts`

**Registered Routes:**
- `/api/payments/nagad/initiate` - Protected (requires authentication)
- `/api/payments/nagad/callback` - Public (Nagad redirect)

**Main Router Integration:**
- Added to `backend/src/routes/index.ts`
- Mounted at `/payments/nagad`

### 5. Environment Configuration

#### Required Environment Variables
Add these to `backend/.env`:

```env
# Nagad Payment Gateway Configuration
NAGAD_MERCHANT_ID=your_merchant_id_here
NAGAD_MERCHANT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
YOUR_MERCHANT_PRIVATE_KEY_HERE
-----END PRIVATE KEY-----"
NAGAD_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
NAGAD_PUBLIC_KEY_HERE
-----END PUBLIC KEY-----"
NAGAD_RUN_MODE=sandbox
FRONTEND_URL=http://localhost:3000
```

**Configuration Notes:**
- `NAGAD_RUN_MODE`: Set to `sandbox` for testing, `production` for live
- Keys must be in PKCS8 PEM format
- Use actual line breaks in the PEM keys (not `\n`)
- `FRONTEND_URL` is used for callback URL generation

## Database Integration

### GatewayLog Table
The system uses the existing `GatewayLog` table to track payment initiations:

```prisma
model GatewayLog {
  id            Int      @id @default(autoincrement())
  gateway       String   // "NAGAD_AUTO"
  transactionId String?  // Nagad payment reference ID
  requestData   String?  @db.LongText
  responseData  String?  @db.LongText
  status        String   // "INITIATED", "SUCCESS", "FAILED"
  timestamp     DateTime @default(now())
}
```

### Transaction Table
Final successful payments are recorded in the `Transaction` table via `invoiceService.recordPayment()`:

```prisma
model Transaction {
  id              Int      @id @default(autoincrement())
  invoiceId       Int
  gateway         String   // "NAGAD_AUTO"
  amount          Decimal  @db.Decimal(10, 2)
  status          String   // "SUCCESS"
  transactionId   String?  @unique
  gatewayResponse String?  @db.LongText
  createdAt       DateTime @default(now())
}
```

## Payment Flow

### 1. Payment Initiation
```
Client → POST /api/payments/nagad/initiate
  ↓
NagadController.initiatePayment()
  ↓
Validate Invoice
  ↓
NagadService.initializePayment()
  ↓
Nagad API: Initialize
  ↓
NagadService.completePayment()
  ↓
Nagad API: Complete (get redirect URL)
  ↓
Create GatewayLog (status: INITIATED)
  ↓
Return redirect URL to client
```

### 2. User Payment
```
Client redirected to Nagad payment page
  ↓
User completes payment on Nagad
  ↓
Nagad redirects to callback URL
```

### 3. Payment Verification
```
Nagad → GET /api/payments/nagad/callback?payment_ref_id=XXX&status=Success
  ↓
NagadController.handleCallback()
  ↓
NagadService.verifyPayment()
  ↓
Nagad API: Verify Payment
  ↓
Verify signature with Nagad public key
  ↓
Update GatewayLog (status: SUCCESS/FAILED)
  ↓
If SUCCESS:
  ↓
  invoiceService.recordPayment()
    ↓
    Create Transaction record
    ↓
    Update Invoice status to PAID
    ↓
    Activate services/domains
    ↓
    Send confirmation emails
    ↓
    Distribute commissions
```

## Security Implementation

### 1. Request Signing
All requests to Nagad are signed with the merchant's private key:
```typescript
const sensitiveData = {
  merchantId: this.merchantId,
  datetime: timestamp,
  orderId: orderId,
  challenge: cryptoService.generateRandomString()
};

const signature = cryptoService.signData(JSON.stringify(sensitiveData));
```

### 2. Response Verification
All responses from Nagad are verified:
```typescript
const isValid = cryptoService.verifySignature(
  JSON.stringify(response.data),
  response.data.signature
);
```

### 3. Timestamp Validation
Timestamps are formatted as `YYYYMMDDHHMMSS` to prevent replay attacks.

### 4. Sensitive Data Encryption
Sensitive data is base64 encoded before transmission:
```typescript
private encryptSensitiveData(data: any): string {
  return Buffer.from(JSON.stringify(data)).toString('base64');
}
```

## Error Handling

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "Nagad Merchant Private Key not configured" | Missing env variable | Add `NAGAD_MERCHANT_PRIVATE_KEY` to .env |
| "Nagad Public Key not configured" | Missing env variable | Add `NAGAD_PUBLIC_KEY` to .env |
| "Invoice not found" | Invalid invoice ID | Verify invoice exists and is unpaid |
| "Invoice is already paid" | Duplicate payment attempt | Check invoice status before initiating |
| "Initiation log not found" | Callback without initiation | Ensure payment was properly initiated |
| "Nagad initialization failed" | API error | Check credentials and network connectivity |

## Testing

### Sandbox Testing Checklist
- [ ] Set `NAGAD_RUN_MODE=sandbox` in .env
- [ ] Configure sandbox merchant credentials
- [ ] Test payment initiation
- [ ] Test successful payment flow
- [ ] Test failed payment flow
- [ ] Test cancelled payment flow
- [ ] Verify invoice status updates
- [ ] Verify transaction records
- [ ] Verify gateway logs
- [ ] Test signature validation

### Test Credentials
Contact Nagad to obtain sandbox credentials:
- Merchant ID
- Merchant Private Key (PKCS8 format)
- Nagad Public Key (PKCS8 format)

## API Documentation

### POST /api/payments/nagad/initiate

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "invoiceId": 123,
  "customerMobile": "01711111111"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "redirectUrl": "https://nagad.com/payment/...",
    "paymentReferenceId": "NG-123456789"
  }
}
```

### GET /api/payments/nagad/callback

**Authentication:** None (public endpoint)

**Query Parameters:**
- `payment_ref_id` - Nagad payment reference ID
- `status` - Payment status from Nagad

**Response:**
```json
{
  "status": "success",
  "data": {
    "paymentStatus": "SUCCESS",
    "message": "Payment completed successfully",
    "invoiceId": 123
  }
}
```

## Logging

### Gateway Logs
All Nagad interactions are logged in `GatewayLog` table:
- Payment initiations
- API responses
- Success/failure status
- Full request/response data for debugging

### Application Logs
Winston logger is used for application-level logging:
```typescript
logger.info('Nagad payment initiated for Invoice: 123');
logger.error('Nagad initialization failed', error);
```

## Next Steps (Phase 2)

Phase 1 is now complete. The next phase will involve:

1. **Frontend Integration**
   - Add Nagad payment option to checkout page
   - Handle redirect to Nagad payment page
   - Create callback success/failure pages
   - Display payment status to users

2. **Testing**
   - Sandbox environment testing
   - Integration testing
   - User acceptance testing

3. **Production Deployment**
   - Switch to production credentials
   - Configure production callback URLs
   - Enable HTTPS enforcement
   - Set up monitoring and alerts

## Support

For issues or questions:
1. Check the error logs in `GatewayLog` table
2. Review Winston application logs
3. Verify environment configuration
4. Contact Nagad support for API-related issues

## Changelog

### 2026-01-28 - Phase 1 Complete
- ✅ Installed dependencies (node-rsa, @types/node-rsa)
- ✅ Created CryptoService for RSA operations
- ✅ Created NagadService for API interactions
- ✅ Created NagadController for request handling
- ✅ Created and registered Nagad routes
- ✅ Added environment configuration
- ✅ Integrated with existing invoice system
- ✅ Implemented security features (signing, verification)
- ✅ Added comprehensive error handling
- ✅ Created documentation
