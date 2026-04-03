# firebase-function — Copilot Instructions

> **Destination**: Move this file to `firebase-function/.github/copilot-instructions.md`

Backend API for the Grabbitt loyalty rewards platform.

Cross-repo conventions: see `_docs/copilot-instructions.md` (shared).
Full project README: see `_docs/README.md`.
Active feature plan: see `_docs/TURBO_UPI_PLAN.md`.
Full API documentation: see `_docs/API_CONTRACT.md`.

---

## App Context

- **Runtime**: Firebase Cloud Functions (Node.js 18)
- **Database**: Cloud Firestore
- **Auth**: Firebase Authentication (JWT middleware on all protected routes)
- **Payments**: Razorpay Node SDK
- **Language**: TypeScript / JavaScript (mixed)

---

## Module Structure

```
functions/
  lib/
    modules/
      auth/                  # Login, signup, token refresh
      user/                  # getUserProfile, updateProfile, getUserQRData
      qr-code/
        scan-user-qr-code.js # ← Points calculation logic (reuse for Turbo UPI)
      payments/
        createOrder.js       # ← Razorpay order creation pattern (reuse for UPI orders)
        verifyPayment.js     # ← HMAC-SHA256 signature verification (reuse for UPI confirm)
      seller/                # Store listing, getStoreDetails, getSellerByVPA (NEW)
      redemption/            # createRedemptionQR, confirmRedemption
      subscription/          # Seller subscription management
      wallet/                # getWallet, points transactions
      upi/                   # NEW — createUPIPaymentOrder, confirmUPIPaymentAndAwardPoints, webhook
    index.ts                 # Route registration
    middleware/
      auth.ts                # Firebase JWT verification middleware
```

---

## Active Work: Turbo UPI — New Endpoints

See `_docs/API_CONTRACT.md` for full request/response schemas.

### Step 6 — `GET /getSellerByVPA`
- File: `modules/seller/getSellerByVPA.ts` (new)
- Firestore query: `seller_profiles WHERE upi_ids ARRAY_CONTAINS {vpa}`
- Return: `{ seller_id, shop_name, category, reward_config, points_preview }`
- 404 if no seller found with that VPA

### Step 7 — `POST /createUPIPaymentOrder`
- File: `modules/upi/createUPIPaymentOrder.ts` (new)
- Reuse: `payments/createOrder.js` for Razorpay order creation
- Firestore write: `upi_payment_orders/{order_id}` with `status: "pending"`
- Auth: JWT required (identifies the `user_id`)

### Step 8 — `POST /confirmUPIPaymentAndAwardPoints`
- File: `modules/upi/confirmUPIPaymentAndAwardPoints.ts` (new)
- Reuse: `payments/verifyPayment.js` for HMAC-SHA256 signature check
- Reuse: `qr-code/scan-user-qr-code.js` for points calculation (percentage / flat / slab)
- **Must use atomic Firestore batch write**:
  - Create points transaction doc
  - Increment `user_profiles/{user_id}.points`
  - Update `seller_profiles/{seller_id}` stats
  - Set `upi_payment_orders/{order_id}.status` to `"completed"`
- Idempotency: reject with 409 if `status !== "pending"`

### Step 9 — `POST /razorpayWebhook`
- File: `modules/upi/razorpayWebhook.ts` (new)
- No Firebase Auth — uses Razorpay webhook signature (`X-Razorpay-Signature` header)
- Signature verification: `HMAC-SHA256(rawBody, webhookSecret)`
- Same points-awarding logic as `/confirmUPIPaymentAndAwardPoints`
- Fully idempotent — safe to receive event multiple times

### Step 10 — Extend `/updateProfile` for UPI VPA
- Existing endpoint already accepts `{ section, ...data }`
- Add handling for `section === "payment"`: write `upi_vpa` to `user_profiles/{uid}`
- No new endpoint needed

---

## Key Rules

1. **Atomic writes**: Always use `db.batch()` or `db.runTransaction()` when modifying multiple Firestore documents in one operation.
2. **Idempotency**: Check order/transaction status before processing. Reject duplicates with 409.
3. **Signature verification**: All Razorpay payment confirmations MUST verify the HMAC-SHA256 signature before trusting the payload.
4. **No VPA logging**: Do not log UPI VPAs (payer or receiver) in Cloud Functions logs — treat as PII.
5. **Amounts in paise**: All amounts stored and processed in paise. Never store decimal INR amounts.
6. **Auth middleware**: All user-facing endpoints must use the Firebase JWT middleware. Only the webhook uses its own signature-based auth.
7. **Reuse existing logic**: Do not duplicate points calculation — call the existing function in `qr-code/scan-user-qr-code.js`.

---

## Build / Deploy Commands

```bash
# Run locally with emulator
firebase emulators:start --only functions,firestore

# Deploy all functions
firebase deploy --only functions

# Deploy specific function
firebase deploy --only functions:confirmUPIPaymentAndAwardPoints
```
