# Nagad Integration - Environment Setup Guide

## Quick Setup Instructions

### 1. Install Dependencies (✅ COMPLETED)
```bash
npm install node-rsa
npm install -D @types/node-rsa
```

### 2. Configure Environment Variables

Add these to your `backend/.env` file:

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

### 3. Obtain Nagad Credentials

#### For Sandbox Testing:
Contact Nagad to get:
- Sandbox Merchant ID
- Sandbox Merchant Private Key (PKCS8 format)
- Nagad Sandbox Public Key (PKCS8 format)

#### For Production:
After testing, obtain:
- Production Merchant ID
- Production Merchant Private Key (PKCS8 format)
- Nagad Production Public Key (PKCS8 format)

### 4. Key Format Requirements

**Important:** Keys must be in PKCS8 PEM format.

**Merchant Private Key Format:**
```
-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...
(multiple lines of base64 encoded key)
...
-----END PRIVATE KEY-----
```

**Nagad Public Key Format:**
```
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
(multiple lines of base64 encoded key)
...
-----END PUBLIC KEY-----
```

### 5. Environment Modes

**Sandbox Mode (Testing):**
```env
NAGAD_RUN_MODE=sandbox
```
- Uses: `http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0/api/dfs`
- For development and testing only
- Use sandbox credentials

**Production Mode (Live):**
```env
NAGAD_RUN_MODE=production
```
- Uses: `https://api.mynagad.com/api/dfs`
- For live transactions
- Use production credentials
- Requires HTTPS callback URLs

### 6. Frontend URL Configuration

Set the frontend URL for callback redirects:

**Development:**
```env
FRONTEND_URL=http://localhost:3000
```

**Production:**
```env
FRONTEND_URL=https://yourdomain.com
```

This URL is used to construct callback URLs:
- Success: `{FRONTEND_URL}/payment/nagad-callback?payment_ref_id=XXX&status=Success`
- Cancel: `{FRONTEND_URL}/payment/nagad-cancel`

### 7. Verify Installation

Run TypeScript compilation to verify everything is set up correctly:

```bash
cd backend
npx tsc --noEmit
```

If no errors appear, Phase 1 is successfully configured!

### 8. Test the Setup

Start the backend server:

```bash
npm run dev
```

The Nagad endpoints should now be available:
- `POST http://localhost:3006/api/payments/nagad/initiate`
- `GET http://localhost:3006/api/payments/nagad/callback`

## Troubleshooting

### Issue: "Cannot find module 'node-rsa'"
**Solution:** Run `npm install node-rsa`

### Issue: "Nagad Merchant Private Key not configured"
**Solution:** Verify `NAGAD_MERCHANT_PRIVATE_KEY` is set in `.env` with proper format

### Issue: "Invalid key format"
**Solution:** Ensure keys are in PKCS8 PEM format with proper BEGIN/END markers

### Issue: TypeScript errors
**Solution:** Run `npm install -D @types/node-rsa`

## Security Checklist

- [ ] Never commit `.env` file to version control
- [ ] Keep private keys secure and encrypted
- [ ] Use environment-specific credentials (sandbox vs production)
- [ ] Rotate keys periodically in production
- [ ] Monitor gateway logs for suspicious activity
- [ ] Implement rate limiting on payment endpoints
- [ ] Use HTTPS in production
- [ ] Validate all callback requests

## Next Steps

Once environment is configured:

1. **Test in Sandbox:**
   - Create a test invoice
   - Initiate payment via API
   - Complete payment on Nagad sandbox
   - Verify callback processing
   - Check invoice status update

2. **Move to Production:**
   - Update credentials to production
   - Change `NAGAD_RUN_MODE` to `production`
   - Update `FRONTEND_URL` to production domain
   - Test with small amount first
   - Monitor logs closely

## Support Resources

- **Nagad Documentation:** Contact Nagad for API documentation
- **Technical Support:** Nagad merchant support
- **Integration Issues:** Check `backend/src/services/README-NAGAD.md`

## Files Created in Phase 1

✅ `backend/src/services/crypto.service.ts` - RSA signing/verification
✅ `backend/src/services/nagad.service.ts` - Nagad API integration
✅ `backend/src/controllers/nagad.controller.ts` - Request handlers
✅ `backend/src/routes/api/nagad.routes.ts` - Route definitions
✅ `backend/.env` - Environment configuration (updated)
✅ `backend/src/services/README-NAGAD.md` - Full documentation

## Phase 1 Status: ✅ COMPLETE

All backend components are implemented and ready for testing!
