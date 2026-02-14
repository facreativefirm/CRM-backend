# bKash Integration & Refund System Analysis Report

**Date:** 2026-02-14  
**Analyst:** System Audit  
**Status:** ⚠️ **INCOMPLETE - REFUND API NOT INTEGRATED**

---

## Executive Summary

The bKash payment integration is **functional for payments** but **DOES NOT have refund API integration**. The current refund system is manual and does not communicate with bKash's refund API.

### Critical Findings:

| Component | Status | Notes |
|-----------|--------|-------|
| **bKash Payment Creation** | ✅ Functional | Working with tokenized/standard modes |
| **bKash Payment Execution** | ✅ Functional | Callback handling implemented |
| **bKash Payment Query** | ✅ Functional | Status checking available |
| **bKash Refund API** | ❌ **NOT IMPLEMENTED** | Missing entirely |
| **Internal Refund System** | ⚠️ Partial | Manual process only |

---

## 1. Current bKash Implementation

### ✅ **What's Working:**

#### **A. Payment Flow**
Location: `backend/src/services/bkash.service.ts`

**Implemented Methods:**
1. ✅ `createPayment()` - Initiates payment with bKash
2. ✅ `executePayment()` - Completes payment after user authorization
3. ✅ `queryPayment()` - Checks payment status

**Features:**
- ✅ Token management (auto-refresh)
- ✅ Supports both Tokenized and Standard checkout
- ✅ Production and Sandbox modes
- ✅ Encrypted credential storage
- ✅ Proper error handling
- ✅ Callback URL handling

#### **B. Payment Controller**
Location: `backend/src/controllers/bkash.controller.ts`

**Implemented Endpoints:**
- ✅ `POST /api/bkash/initiate` - Start payment
- ✅ `GET /api/bkash/callback` - Handle bKash callback

**Features:**
- ✅ Invoice validation
- ✅ Payment logging in `gatewayLog` table
- ✅ Automatic payment recording
- ✅ Success/failure redirects to frontend
- ✅ Idempotency handling (prevents duplicate payments)

---

## 2. Current Refund System

### ⚠️ **What Exists (Manual Process):**

Location: `backend/src/controllers/finance.controller.ts`

**Implemented Endpoints:**
1. ✅ `POST /api/finance/refunds` - Request refund
2. ✅ `PUT /api/finance/refunds/:id/authorize` - Authorize refund (Admin)
3. ✅ `PUT /api/finance/refunds/:id/approve` - Approve refund (Super Admin)
4. ✅ `GET /api/finance/refunds` - List refunds

**Current Workflow:**
```
User requests refund
    ↓
Admin authorizes (if not Super Admin)
    ↓
Super Admin approves
    ↓
System creates negative transaction
    ↓
Updates invoice status
    ↓
Sends email notification
```

**Features:**
- ✅ Multi-level approval system
- ✅ Partial refund support
- ✅ Refund amount validation
- ✅ Email notifications
- ✅ Invoice status updates
- ❌ **NO bKash API integration**
- ❌ **NO automatic refund to customer's bKash wallet**

---

## 3. Missing bKash Refund Integration

### ❌ **What's NOT Implemented:**

#### **A. bKash Refund API Method**
**Missing from:** `backend/src/services/bkash.service.ts`

**Required Method:**
```typescript
async refundPayment(paymentID: string, amount: number, reason: string) {
    // NOT IMPLEMENTED
}
```

**bKash API Endpoint:**
```
POST {{tokenized_url}}/v1.2.0-beta/tokenized/checkout/payment/refund
```

**Required Headers:**
- `Authorization`: id_token
- `X-APP-Key`: app_key

**Required Payload:**
```json
{
  "paymentID": "TR0011ABC123",
  "amount": "100.00",
  "trxID": "8HJ78UIJK",
  "sku": "product-sku",
  "reason": "Product defective"
}
```

#### **B. Integration with Finance Controller**
**Missing from:** `backend/src/controllers/finance.controller.ts`

The `processRefundCompletion()` function currently:
- ✅ Creates internal negative transaction
- ✅ Updates invoice
- ✅ Sends email
- ❌ **Does NOT call bKash refund API**
- ❌ **Does NOT refund money to customer's wallet**

---

## 4. How Current Refund System Works

### **Current Process (Manual):**

1. **User/Admin requests refund** via `/api/finance/refunds`
   - Validates transaction exists and is successful
   - Checks refund amount doesn't exceed transaction total
   - Creates refund record with status `PENDING_AUTHORIZATION`

2. **Admin authorizes** (if requester is not Super Admin)
   - Changes status to `PENDING_APPROVAL`

3. **Super Admin approves**
   - Changes status to `COMPLETED`
   - Calls `processRefundCompletion()`

4. **System processes refund internally:**
   ```typescript
   // Creates a NEGATIVE transaction
   prisma.transaction.create({
       gateway: 'Internal Refund',
       amount: refund.amount.negated(), // Negative amount
       status: 'SUCCESS'
   })
   
   // Updates invoice
   invoice.amountPaid -= refund.amount
   invoice.status = 'REFUNDED' or 'PARTIALLY_PAID'
   
   // Sends email to customer
   EmailTemplates.refundProcessed(...)
   ```

5. **❌ Money is NOT returned to customer's bKash wallet**
   - Admin must manually process refund via bKash merchant portal
   - OR transfer money through other means

---

## 5. What Needs to Be Done

### **Required Changes for Full bKash Refund Integration:**

#### **Step 1: Add Refund Method to bKash Service**

**File:** `backend/src/services/bkash.service.ts`

```typescript
async refundPayment(data: {
    paymentID: string;
    amount: number;
    trxID: string;
    reason: string;
    sku?: string;
}) {
    const credentials = await this.getCredentials();
    const token = await this.getToken();

    try {
        const response = await axios.post(
            `${credentials.baseUrl}payment/refund`,
            {
                paymentID: data.paymentID,
                amount: data.amount.toFixed(2),
                trxID: data.trxID,
                sku: data.sku || 'N/A',
                reason: data.reason
            },
            {
                headers: {
                    'Authorization': token,
                    'X-APP-Key': credentials.appKey,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data?.statusCode === '0000') {
            return response.data;
        } else {
            throw new Error(response.data.statusMessage || 'Refund failed');
        }
    } catch (error: any) {
        logger.error('bKash Refund Error:', error.response?.data);
        throw new Error(error.response?.data?.statusMessage || 'bKash refund failed');
    }
}
```

#### **Step 2: Integrate with Finance Controller**

**File:** `backend/src/controllers/finance.controller.ts`

**Modify `processRefundCompletion()` function:**

```typescript
async function processRefundCompletion(refundId: number) {
    const refund = await prisma.refund.findUnique({
        where: { id: refundId },
        include: { 
            transaction: { 
                include: { invoice: true } 
            } 
        }
    });

    if (!refund) return;

    const originalTransaction = refund.transaction;
    const invoice = originalTransaction.invoice;

    // NEW: Check if original payment was via bKash
    if (originalTransaction.gateway === 'BKASH') {
        try {
            // Extract bKash payment details from transaction
            const gatewayLog = await prisma.gatewayLog.findFirst({
                where: {
                    transactionId: originalTransaction.transactionId,
                    gateway: 'BKASH',
                    status: 'SUCCESS'
                }
            });

            if (gatewayLog) {
                const responseData = JSON.parse(gatewayLog.responseData as string);
                const paymentID = responseData.paymentID;
                const trxID = responseData.trxID;

                // Call bKash refund API
                const bkashService = (await import('../services/bkash.service')).default;
                const refundResult = await bkashService.refundPayment({
                    paymentID,
                    amount: parseFloat(refund.amount.toString()),
                    trxID,
                    reason: refund.reason,
                    sku: invoice.invoiceNumber
                });

                logger.info(`bKash refund successful: ${refundResult.refundTrxID}`);

                // Update refund record with bKash refund details
                await prisma.refund.update({
                    where: { id: refundId },
                    data: {
                        gatewayRefundId: refundResult.refundTrxID,
                        gatewayResponse: JSON.stringify(refundResult)
                    }
                });
            }
        } catch (error: any) {
            logger.error('bKash refund API failed:', error.message);
            // Continue with internal refund even if bKash API fails
            // Admin will need to process manually
        }
    }

    // Continue with existing internal refund logic...
    const newAmountPaid = (invoice.amountPaid || new Prisma.Decimal(0)).sub(refund.amount);
    // ... rest of existing code
}
```

#### **Step 3: Update Refund Schema (if needed)**

**File:** `backend/prisma/schema.prisma`

Add fields to track gateway refund details:

```prisma
model Refund {
  // ... existing fields
  gatewayRefundId  String?  // bKash refund transaction ID
  gatewayResponse  String?  @db.Text  // Full bKash response
}
```

Then run:
```bash
npx prisma migrate dev --name add_gateway_refund_fields
```

---

## 6. Testing Requirements

### **Before Deployment:**

1. **Sandbox Testing:**
   - Test full refund via bKash sandbox
   - Test partial refund via bKash sandbox
   - Test refund failure handling
   - Verify customer receives money in wallet

2. **Error Scenarios:**
   - bKash API timeout
   - Invalid payment ID
   - Refund amount exceeds original
   - Already refunded payment

3. **Integration Testing:**
   - End-to-end: Payment → Refund → Wallet credit
   - Verify database records are correct
   - Check email notifications
   - Validate invoice status updates

---

## 7. Current System Limitations

### **❌ Problems with Current Manual Refund:**

1. **No Automatic Wallet Credit**
   - Customer doesn't receive money in bKash wallet
   - Admin must manually process via bKash merchant portal

2. **No Gateway Tracking**
   - System doesn't know if refund was actually processed
   - No bKash refund transaction ID stored

3. **Manual Reconciliation Required**
   - Admin must match internal refunds with bKash refunds
   - Prone to human error

4. **Poor Customer Experience**
   - Customer sees "refund processed" but money not in wallet
   - Requires follow-up and manual intervention

---

## 8. Recommendations

### **Priority 1: Implement bKash Refund API (HIGH)**
- Add `refundPayment()` method to bKash service
- Integrate with `processRefundCompletion()`
- Test thoroughly in sandbox

### **Priority 2: Add Refund Tracking (MEDIUM)**
- Store bKash refund transaction ID
- Add gateway response logging
- Create admin view for refund status

### **Priority 3: Error Handling (MEDIUM)**
- Handle bKash API failures gracefully
- Implement retry mechanism
- Alert admins when API refund fails

### **Priority 4: Reporting (LOW)**
- Add refund reports to admin dashboard
- Show gateway vs internal refunds
- Track refund success rate

---

## 9. Conclusion

### **Current State:**
- ✅ bKash payment integration is **fully functional**
- ❌ bKash refund integration is **completely missing**
- ⚠️ Internal refund system works but is **manual**

### **Impact:**
- Customers do NOT receive automatic refunds to their bKash wallet
- Admins must manually process refunds via bKash merchant portal
- High risk of errors and poor customer experience

### **Recommendation:**
**DO NOT deploy refund feature to production** until bKash refund API is integrated. Current system only creates internal accounting records but doesn't actually refund money to customers.

---

**Report Generated:** 2026-02-14  
**Next Steps:** Implement bKash refund API integration before enabling refund feature in production.
