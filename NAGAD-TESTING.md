# Nagad Backend Testing Guide

## Testing Overview

This guide covers testing the Nagad payment gateway backend implementation.

## Prerequisites

### Required for Full Testing
- [ ] Nagad Sandbox Merchant ID
- [ ] Nagad Sandbox Merchant Private Key (PKCS8 format)
- [ ] Nagad Sandbox Public Key (PKCS8 format)
- [ ] Backend server running
- [ ] Database accessible

### What We Can Test Now (Without Credentials)
- [x] Server startup
- [x] Route registration
- [x] TypeScript compilation
- [x] Code structure
- [x] Error handling for missing credentials

## Test Plan

### Phase 1: Environment & Startup Tests ✅
These tests verify the backend is properly configured and can start.

### Phase 2: API Endpoint Tests (Requires Credentials)
These tests require actual Nagad sandbox credentials.

### Phase 3: Integration Tests (Requires Credentials)
These tests verify the complete payment flow.

---

## Phase 1: Environment & Startup Tests

### Test 1.1: Verify Dependencies
```bash
cd backend
npm list node-rsa
```

**Expected:** `node-rsa@1.1.1`

### Test 1.2: TypeScript Compilation
```bash
cd backend
npx tsc --noEmit
```

**Expected:** No errors

### Test 1.3: Start Backend Server
```bash
cd backend
npm run dev
```

**Expected:** Server starts on port 3006 without errors

### Test 1.4: Verify Routes Registered
Check server logs for route registration.

**Expected:** Routes `/api/payments/nagad/initiate` and `/api/payments/nagad/callback` are registered

---

## Phase 2: API Endpoint Tests (Requires Credentials)

### Test 2.1: Test Payment Initiation (Without Auth)
```bash
curl -X POST http://localhost:3006/api/payments/nagad/initiate \
  -H "Content-Type: application/json" \
  -d '{"invoiceId": 1, "customerMobile": "01711111111"}'
```

**Expected:** 401 Unauthorized (authentication required)

### Test 2.2: Test Payment Initiation (With Auth, Invalid Invoice)
```bash
curl -X POST http://localhost:3006/api/payments/nagad/initiate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"invoiceId": 99999, "customerMobile": "01711111111"}'
```

**Expected:** 404 Invoice not found

### Test 2.3: Test Payment Initiation (With Valid Invoice)
**Prerequisites:**
- Valid authentication token
- Existing unpaid invoice
- Nagad credentials configured

```bash
curl -X POST http://localhost:3006/api/payments/nagad/initiate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"invoiceId": 1, "customerMobile": "01711111111"}'
```

**Expected:** 
```json
{
  "status": "success",
  "data": {
    "redirectUrl": "https://sandbox.mynagad.com/...",
    "paymentReferenceId": "NG-..."
  }
}
```

### Test 2.4: Test Callback Endpoint
```bash
curl "http://localhost:3006/api/payments/nagad/callback?payment_ref_id=TEST123&status=Success"
```

**Expected:** Response with payment status

---

## Phase 3: Integration Tests

### Test 3.1: Complete Payment Flow
1. Create test invoice
2. Initiate payment
3. Simulate Nagad callback
4. Verify invoice status updated
5. Verify transaction created
6. Verify gateway log created

### Test 3.2: Failed Payment Flow
1. Create test invoice
2. Initiate payment
3. Simulate failed callback
4. Verify invoice status unchanged
5. Verify gateway log shows failure

### Test 3.3: Cancelled Payment Flow
1. Create test invoice
2. Initiate payment
3. Simulate cancelled callback
4. Verify invoice status unchanged

---

## Manual Testing Checklist

### Environment Setup
- [ ] `.env` file has all Nagad variables
- [ ] Credentials are in correct format (PKCS8 PEM)
- [ ] `NAGAD_RUN_MODE=sandbox`
- [ ] Database is accessible
- [ ] Redis is running (if required)

### Server Startup
- [ ] Server starts without errors
- [ ] No TypeScript compilation errors
- [ ] Routes are registered
- [ ] Database connection successful

### API Testing
- [ ] `/api/payments/nagad/initiate` endpoint exists
- [ ] `/api/payments/nagad/callback` endpoint exists
- [ ] Authentication is enforced on initiate
- [ ] Callback endpoint is public

### Error Handling
- [ ] Missing credentials error is clear
- [ ] Invalid invoice ID returns 404
- [ ] Already paid invoice returns 400
- [ ] Network errors are caught
- [ ] Errors are logged properly

### Database Operations
- [ ] GatewayLog records are created
- [ ] Transaction records are created on success
- [ ] Invoice status is updated correctly
- [ ] No duplicate transactions

### Security
- [ ] Requests are signed
- [ ] Responses are verified
- [ ] Timestamps are validated
- [ ] No sensitive data in logs

---

## Automated Test Script

Create this file: `backend/test-nagad.js`

```javascript
const axios = require('axios');

const BASE_URL = 'http://localhost:3006/api';

async function testNagadEndpoints() {
  console.log('🧪 Testing Nagad Backend Implementation\n');

  // Test 1: Initiate without auth
  console.log('Test 1: Initiate payment without authentication');
  try {
    await axios.post(`${BASE_URL}/payments/nagad/initiate`, {
      invoiceId: 1,
      customerMobile: '01711111111'
    });
    console.log('❌ FAILED: Should require authentication\n');
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ PASSED: Authentication required\n');
    } else {
      console.log(`❌ FAILED: Unexpected error: ${error.message}\n`);
    }
  }

  // Test 2: Callback endpoint exists
  console.log('Test 2: Callback endpoint accessibility');
  try {
    const response = await axios.get(`${BASE_URL}/payments/nagad/callback`, {
      params: {
        payment_ref_id: 'TEST123',
        status: 'Success'
      }
    });
    console.log('✅ PASSED: Callback endpoint accessible\n');
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('❌ FAILED: Callback endpoint not found\n');
    } else {
      console.log(`⚠️  Response: ${error.response?.status || error.message}\n`);
    }
  }

  console.log('🏁 Testing complete!');
}

testNagadEndpoints().catch(console.error);
```

Run with: `node backend/test-nagad.js`

---

## Expected Errors (Without Credentials)

These errors are NORMAL when testing without actual Nagad credentials:

1. **"Nagad Merchant Private Key not configured"**
   - This is expected if you haven't added real credentials
   - Solution: Add actual credentials to `.env`

2. **"Nagad initialization failed"**
   - This is expected when calling Nagad API without valid credentials
   - Solution: Use sandbox credentials from Nagad

3. **"Invalid signature"**
   - This is expected if using placeholder keys
   - Solution: Use actual keys from Nagad

---

## Success Criteria

### Without Credentials ✅
- [x] Server starts successfully
- [x] Routes are registered
- [x] TypeScript compiles without errors
- [x] Authentication is enforced
- [x] Error messages are clear

### With Credentials (Pending)
- [ ] Payment initiation returns redirect URL
- [ ] Callback processing works
- [ ] Invoice status updates
- [ ] Transaction records created
- [ ] Gateway logs created
- [ ] No errors in production code

---

## Next Steps

1. **Obtain Credentials:**
   - Contact Nagad for sandbox access
   - Get Merchant ID, Private Key, Public Key

2. **Update Environment:**
   - Add credentials to `.env`
   - Verify key format (PKCS8 PEM)

3. **Test Payment Flow:**
   - Create test invoice
   - Initiate payment
   - Complete payment on Nagad sandbox
   - Verify callback processing

4. **Monitor Logs:**
   - Check application logs (Winston)
   - Check gateway logs (database)
   - Verify no errors

---

## Troubleshooting

### Server Won't Start
- Check `.env` file exists
- Verify database connection
- Check port 3006 is available

### Routes Not Found
- Verify routes are imported in `src/routes/index.ts`
- Check server logs for route registration
- Restart server

### TypeScript Errors
- Run `npx tsc --noEmit`
- Check for missing imports
- Verify type definitions

### Database Errors
- Verify database is running
- Check connection string in `.env`
- Run Prisma migrations if needed

---

## Support

For issues:
1. Check server logs
2. Check database logs
3. Review `README-NAGAD.md`
4. Contact Nagad support for API issues
