# Grabbitt Platform — Architecture Tracker

> **Scope**: Cross-repo (firebase-function · grabbitt-user · grabbitt-seller)  
> **Owner**: Architect Agent (`/.github/agents/architect.agent.md`)  
> **Last Updated**: 2026-04-03  
> **Update Protocol**: When resolving an item, move it to the Done section, fill `Resolved` date and `PR/Commit` link.
> **DB Review Date**: 2026-04-03 (comprehensive Firestore security, performance, and best practices audit)

---

## How to Use This Tracker

- **Status legend**: `🔴 Open` · `🟡 In Progress` · `✅ Done` · `⏸ Deferred`
- **Priority tiers**:
  - **T1** — Security / Data loss / Correctness blocker
  - **T2** — Code quality / Maintainability
  - **T3** — Duplication / DX improvement
  - **T4** — Feature completeness / Nice-to-have
- Agents and developers update this file when work begins or ends.
- Do NOT reorder items inside tiers — append new ones at the bottom of each tier.

---

## T1 — Security & Critical Correctness

| # | Status | Repo | Issue | Fix | Resolved | PR/Commit |
|---|--------|------|-------|-----|----------|-----------|
| T1-01 | ✅ Done | firebase-function | **Dual source of truth**: `lib/*.js` files contain production handlers with no TypeScript source in `src/`. Direct edits to `lib/` are overwritten on `tsc` build. | Migrate all `lib/modules/**/*.js` → `src/modules/**/*.ts`. Add `lib/` to `.gitignore`. | 2026-04-03 | See `FIX_T1-01.md` — requires `git rm -r --cached functions/lib/` |
| T1-02 | 🔴 Open | firebase-function | **Inconsistent error response shapes**: 3 different formats across 50+ handlers (`{error}`, `{success,error}`, `{errorCode,message}`). | Standardize to `{ success: boolean, data?: T, error?: { code: string, message: string, statusCode: number } }`. Create shared `sendError()` / `sendSuccess()` helpers. | — | — |
| T1-03 | 🔴 Open | firebase-function | **No request validation middleware**: Handlers manually validate (or skip) input. Invalid data reaches Firestore with no schema guard. | Add `zod` schemas per endpoint. Validate in shared Express middleware before handlers execute. | — | — |
| T1-04 | 🔴 Open | firebase-function | **CORS too permissive**: `cors({ origin: true })` accepts any origin. | Whitelist specific origins. Evaluate Firebase App Check for additional protection. | — | — |
| T1-05 | 🔴 Open | grabbitt-user, grabbitt-seller | **Tokens in AsyncStorage (unencrypted)**: `idToken` + `refreshToken` stored in plain AsyncStorage. On non-secured Android devices these are readable. | Migrate to `expo-secure-store` for both apps. | — | — |
| T1-06 | 🔴 Open | firebase-function | **No rate limiting**: All endpoints open to unlimited calls. Risk: brute-force login, payment order spam, redemption manipulation. | Add `express-rate-limit`. Priority endpoints: `/loginUser`, `/createUPIPaymentOrder`, `/scanUserQRCode`. | — | — |
| T1-07 | 🔴 Open | firebase-function | **UPI VPA logging risk (PII)**: `console.error()` calls may capture request body containing `upi_vpa`, `vpa`, `payer_vpa`. | Add request sanitization middleware that strips PII fields before any logging statement. | — | — |
| T1-08 | 🔴 Open | firebase-function | **🚨 CRITICAL: No Firestore security rules**: No `firestore.rules` file exists. All collections are publicly readable/writable by default. PII (phone, email, addresses), point balances, payment orders are accessible by anyone with Firebase config. | Create `firestore.rules` with least-privilege access control. Only Cloud Functions write to critical collections. Users read own data only. Deploy before production. | — | — |
| T1-09 | 🔴 Open | firebase-function | **🚨 CRITICAL: No Firestore composite indexes**: No `firestore.indexes.json` file. Compound queries (e.g., `points` filtered by `user_id` + `seller_id`) **will fail in production**. Currently works in emulator only. | Create `firestore.indexes.json` with 7 composite indexes (see DB review tracker). Update `firebase.json` to reference it. Deploy indexes before first production query. | — | — |
| T1-10 | 🔴 Open | firebase-function | **Non-atomic redemption flow** (`process-redemption.ts` lines 118-137): Uses `Promise.all()` instead of `db.batch()`. If transaction write fails but redemption updates succeed, points are deducted with no transaction record (data loss). | Replace `Promise.all([redemptionRef.update(), db.collection().add(), sellerRef.update()])` with atomic `db.batch()` write. See pattern in `points-transaction-helpers.ts`. | — | — |
| T1-11 | 🔴 Open | firebase-function | **Non-atomic subscription payment updates** (`verifyPayment.ts` lines 103-131, `verifyIAPPurchase.ts`): Multiple sequential writes without batch/transaction. Risk of partial state if one fails. | Convert to `db.batch()` for all subscription-related writes (payment doc + seller profile + subscription doc). | — | — |

---

## T2 — Code Quality & Maintainability

| # | Status | Repo | Issue | Fix | Resolved | PR/Commit |
|---|--------|------|-------|-----|----------|-----------|
| T2-01 | 🔴 Open | firebase-function | **Monolithic handlers (~100+ lines each)**: Auth + validation + business logic + Firestore + response all in one function. Not unit-testable. | Extract services layer: thin handler delegates to `services/<domain>Service.ts` (pure, testable). Handler only does auth verification + input parsing + calling the service. | — | — |
| T2-02 | 🔴 Open | firebase-function | **No centralized error handling middleware**: Each handler has its own `try/catch` with `console.error` + `res.status(500)`. | Create Express error middleware `middleware/errorHandler.ts`. Wire all handlers to throw typed errors, caught centrally. | — | — |
| T2-03 | 🔴 Open | firebase-function | **No structured logging**: Only `console.error()` / `console.log()`. No correlation IDs, no severity levels, no Cloud Logging integration. | Integrate `winston` or native `@google-cloud/logging` for structured log entries with severity + request context. | — | — |
| T2-04 | 🔴 Open | firebase-function | **No crash/error monitoring**: No Sentry or equivalent. Silent failures in production are undetectable. | Add Sentry (`@sentry/node`) or Google Cloud Error Reporting. | — | — |
| T2-05 | 🔴 Open | grabbitt-user, grabbitt-seller | **No crash reporting in mobile apps**: Unhandled exceptions are silent in production. | Integrate `@sentry/react-native` or Expo Crash Reporter. | — | — |
| T2-10 | 🔴 Open | firebase-function | **N+1 query pattern in `/get-balance`** (`get-balance.ts` line 70): Fetches seller profiles one-by-one via `Promise.all(sellerIds.map(id => db.collection().doc(id).get()))`. If user has 20 sellers, makes 20 individual reads. | Replace with batched read: `const sellerRefs = sellerIds.map(id => db.collection("seller_profiles").doc(id)); const sellerDocs = await db.getAll(...sellerRefs);` | — | — |
| T2-11 | 🔴 Open | firebase-function | **Full collection scan** (`helper.ts` line 82): `db.collection("payments").get()` fetches ALL payments with no filters. Unbounded read cost. | Add `.where()` filters or `.limit()`. If for admin/reporting, document why full scan is acceptable. | — | — |
| T2-12 | 🔴 Open | firebase-function | **Mixed timestamp types**: Some writes use `new Date()` (client clock, manipulable), others use `serverTimestamp()` (correct). Transaction records in `qr-code/scan-user-qr-code.ts` use `timestamp: new Date()`. | Replace all `new Date()` audit timestamps with `adminRef.firestore.FieldValue.serverTimestamp()`. Standardize on server-side timestamps. | — | — |
| T2-06 | 🔴 Open | grabbitt-seller | **Missing `errorHandler.ts` utility**: The user app has `utils/errorHandler.ts` with `getErrorMessage()` + `showErrorAlert()`. The seller app does not. | Copy and adapt `errorHandler.ts` from user app. Wire into all error-prone flows. | — | — |
| T2-07 | 🔴 Open | grabbitt-seller | **Missing DEV logging in axiosInstance**: User app logs full request URLs + response times in dev mode. Seller app does not. | Add same DEV interceptor block as user app's `axiosInstance.ts`. | — | — |
| T2-08 | 🟡 In Progress | firebase-function | **Auth middleware fragmentation**: Both `middleware/auth.js` and `middleware/authMiddleware.js` exist. Unclear which is canonical. | Audit both files, consolidate into single `middleware/auth.ts`, delete the redundant one. | — | — |
| T2-09 | 🔴 Open | grabbitt-user, grabbitt-seller | **Long `_layout.tsx` files (100+ lines)**: Header rendering, notification badge logic, and drawer config all in layout files. | Extract custom header to `components/shared/AppHeader.tsx`. Move `unreadCount` logic to a `useNotificationBadge()` hook. | — | — |

---

## T3 — Duplication & DX

| # | Status | Repo | Issue | Fix | Resolved | PR/Commit |
|---|--------|------|-------|-----|----------|-----------|
| T3-01 | 🔴 Open | grabbitt-user, grabbitt-seller | **90% duplicate `authStore.ts`**: Both stores have identical Zustand shape. Only minor field differences. | Option A (preferred): Extract `@grabbitt/shared` package with common store atoms. Option B: Document which is canonical and sync manually on changes. | — | — |
| T3-02 | 🔴 Open | grabbitt-user, grabbitt-seller | **Identical `axiosInstance.ts`**: Diverges only in DEV logging and timeout (15s vs default). | Merge into single implementation with env-based config. | — | — |
| T3-03 | 🔴 Open | grabbitt-user, grabbitt-seller | **Duplicate `services/api.ts` domain groups**: `userApi`, `storeApi`, `walletApi` are near-identical across both apps. | Share via `@grabbitt/shared` package or clearly owned copies with sync policy. | — | — |
| T3-04 | 🔴 Open | grabbitt-user, grabbitt-seller | **Type divergence**: `types/auth.ts` → `UserProfile` interface has different shapes in each app for the same Firestore document. | Align interfaces. Single source of truth. Document extra seller-only / user-only fields explicitly. | — | — |
| T3-08 | 🔴 Open | firebase-function | **No data lifecycle cleanup (TTL)**: Old notifications (`user_notifications/{uid}/notifications`), expired QR tokens (`qr_tokens`), stale push tokens (`push_tokens`), and daily scans (`daily_scans`) accumulate forever. Collections grow unbounded → read latency + cost increase. | Create cron function `expireOldData` that runs daily: (1) Delete notifications > 90 days old, (2) Delete expired QR tokens (status: "active", last_used_at > 5 min), (3) Delete push tokens last_used > 180 days, (4) Archive daily_scans > 1 year to Cloud Storage. | — | — |
| T3-09 | 🔴 Open | firebase-function | **Stale push tokens accumulation**: `push_tokens` collection never prunes failed/expired Expo tokens. Notification sends waste resources on dead tokens. | Add failed delivery counter to push token docs. Increment on Expo error. Delete tokens with `failed_count > 5` or `last_used_at > 180 days` in daily cleanup cron. | — | — |
| T3-10 | 🔴 Open | firebase-function | **Old notifications never deleted**: Subcollection `user_notifications/{uid}/notifications` grows indefinitely. Users with 1 year activity may have 1000+ docs, slowing reads. | Add TTL cleanup in `expireOldData` cron: delete notifications where `created_at < now - 90 days`. Consider materialized view for "last 20 notifications" pattern. | — | — |
| T3-05 | 🔴 Open | grabbitt-seller | **Missing `@tanstack/react-query`**: User app has it, seller app doesn't. Seller screens may implement ad-hoc data fetching without cache/dedup. | Add React Query to seller app. Adopt consistent `useQuery` / `useMutation` pattern across both apps. | — | — |
| T3-06 | 🔴 Open | grabbitt-seller | **Missing `turbo-upi-preview` EAS build profile**: User app has the feature-flagged profile. Seller app needs it too for UPI VPA setup testing. | Add `turbo-upi-preview` profile to `eas.json` with `EXPO_PUBLIC_TURBO_UPI_ENABLED=true`. | — | — |
| T3-07 | 🔴 Open | firebase-function, grabbitt-user, grabbitt-seller | **Inconsistent naming conventions**: Backend DB uses `snake_case` collections/fields; code mixes `camelCase` and `snake_case` for the same concepts. `UserProfile` vs `AppUser` for the same Firestore document. | Establish and document naming convention: `camelCase` for code/variables, `snake_case` for Firestore documents/fields. Standardize interfaces to `UserProfile` everywhere. | — | — |

---

## T4 — Feature Completeness

| # | Status | Repo | Issue | Fix | Resolved | PR/Commit |
| T4-06 | 🔴 Open | firebase-function | **No Firestore schema documentation**: 25+ collections exist with no single source of truth for field names, types, or relationships. Onboarding developers requires reading code. | Create `_docs/FIRESTORE_SCHEMA.md` documenting all collections, fields, access patterns, denormalization rules, and index requirements. | — | — |
| T4-07 | 🔴 Open | firebase-function | **No Firestore cost monitoring**: No budget alerts for runaway read/write costs. During high traffic or infinite loops, costs could spike undetected. | Set up Google Cloud billing alerts for Firestore: (1) Daily read > 1M docs, (2) Daily write > 500K docs, (3) Monthly cost > $X threshold. Integrate with Cloud Monitoring dashboard. | — | — |
|---|--------|------|-------|-----|----------|-----------|
| T4-01 | 🟡 In Progress | grabbitt-user | **Turbo UPI `scan-pay/index.tsx` exists but not fully implemented**: Screen placeholder present. | Complete UPI scan & pay flow per `TURBO_UPI_PLAN.md`. | — | — |
| T4-02 | 🟡 In Progress | grabbitt-seller | **Payment QR display screen (`payment-qr.tsx`)**: File exists, no full "Show My Payment QR" implementation. | Implement UPI deeplink QR: `upi://pay?pa={vpa}&pn={shop_name}&cu=INR`. Use `react-native-qrcode-svg`. | — | — |
| T4-03 | 🔴 Open | grabbitt-seller | **UPI VPA not surfaced in seller profile setup**: `profile-setup.tsx` may lack `upi_vpa` input. | Add required `upi_vpa` text input. On save, write to `seller_profiles.upi_ids[]` array. | — | — |
| T4-04 | 🔴 Open | grabbitt-user, grabbitt-seller | **Firebase credentials in source**: `config/firebase.ts` contains hardcoded projectId, apiKey, etc. | Move to `app.json` extras + `.env.local`. Not a production blocker (web API keys are public-safe) but poor hygiene. | — | — |
| T4-05 | 🔴 Open | grabbitt-user, grabbitt-seller | **No SSL/certificate pinning**: Axios uses standard HTTPS with no pinning. | Implement certificate pinning for production builds. Lower priority for Expo managed workflow. | — | — |

---

## ✅ Done

| # | Repo | Issue | Resolved | PR/Commit |
|---|------|-------|----------|-----------|
| — | — | — | — | — |

---

## Architecture Decision Log

Capture decisions here when a significant architectural choice is made.

| Date | Decision | Rationale | Alternatives Considered |
| 2026-04-03 | Security rules as code (Firestore rules file required) | Least-privilege access control. Prevents client-side data manipulation. PII protection. | Trust client validation (rejected: trivially bypassable) |
| 2026-04-03 | Composite indexes explicit in `firestore.indexes.json` | Predictable query performance. Prevents production failures from missing indexes. | Auto-create on first query (rejected: unpredictable latency) |
| 2026-04-03 | Server-side timestamps only (`serverTimestamp()`) | Prevents client clock manipulation. Accurate audit trails. | Client-provided `new Date()` (rejected: security risk) |
| 2026-04-03 | Batched reads via `db.getAll()` for multi-doc fetches | Reduces latency (1 roundtrip vs N). Lowers read costs. | Sequential `Promise.all(ids.map(id => get()))` (rejected: N+1 antipattern) |
|------|----------|-----------|------------------------|
| 2026-03-31 | Adopted `lib/` = compiled output only; all source in `src/` | Eliminates dual source of truth confusion. TypeScript as single source. | Keep mixed JS/TS (rejected: unmaintainable) |
| 2026-03-31 | Standardize error shape to `{ success, data?, error? }` | Client apps can check `success` without parsing message strings | HTTP status codes only (rejected: insufficient for error classification) |
| 2026-03-31 | Amounts always in paise (integer) | Avoids floating point precision bugs, aligns with Razorpay API | Store as decimal INR (rejected: precision risk) |
| 2026-03-31 | Atomic Firestore `db.batch()` for all multi-doc writes | Prevents partial state on failure | Individual sequential writes (rejected: not atomic) |

---

## Patterns Reference

Quick-reference for patterns enforced across the platform.

### Backend Handler Shape
```typescript
// modules/<domain>/<action>.ts — THIN handler
export const myHandler = async (req: Request, res: Response) => {
  try {
    const user = await authenticateUser(req.headers.authorization)
    const payload = mySchema.parse(req.body)          // zod — throws on invalid
    const result = await myService.doThing(user.uid, payload)
    return res.json({ success: true, data: result })
  } catch (err) {
    return handleError(err, res)                       // centralized error middleware
  }
}

// services/<domain>Service.ts — PURE business logic (testable)
export async function doThing(userId: string, payload: MyPayload) {
  const batch = db.batch()
  // ... atomic Firestore operations
  await batch.commit()
}
```

### Mobile API Calls
```typescript
// services/api.ts — domain-grouped
export const paymentApi = {
  createOrder: (payload) => api.post('/createUPIPaymentOrder', payload),
  confirm: (payload) => api.post('/confirmUPIPaymentAndAwardPoints', payload),
}

// In screen — Container/Presenter pattern
const MyScreen = () => {
  const { data, isLoading } = useQuery({ queryKey: ['order'], queryFn: paymentApi.createOrder })
  if (isLoading) return <MySkeleton />
  return <MyComponent data={data} />
}
```

### Firestore Write Rules
- Always in paise (integer) — never decimal INR
- Multi-doc writes: always `db.batch()` or `db.runTransaction()`  
- Idempotency: check status before writing, return 409 if already processed
- Collections: `snake_case` · Code variables: `camelCase`

### Navigation
```typescript
// utils/app-routes.ts — add ALL new routes here first
export const ROUTES = {
  HOME: '/(drawer)/(tabs)/home',
  SCAN_PAY: '/(drawer)/scan-pay',
  // ...
}

// Usage — never raw strings
router.push(ROUTES.SCAN_PAY)
```

---

## 🗄️ Database Review Tracker (2026-04-03)

**Review Scope**: End-to-end Firestore security, performance, and best practices audit.

**Collections Audited**: 25+ (customer_profiles, seller_profiles, transactions, points, redemptions, upi_payment_orders, qr_tokens, push_tokens, user_notifications, daily_scans, payments, seller_subscriptions, qr_codes, today_offer_claims, seller_daily_offers, coupon_usage, coupons, subscription_history, offer_redemptions, city_enquiries, app_settings)

### Critical Security Findings

#### 1. Missing Firestore Security Rules (T1-08)
**Impact**: 🚨 **Data breach risk** — All collections publicly accessible.

**Current State**:
- No `firestore.rules` file exists
- Default Firestore rules = open read/write access
- Any client with Firebase config can read/write ANY document
- PII exposure: phone numbers, emails, addresses, UPI VPAs
- Financial data exposure: point balances, payment orders, transactions

**Implementation Checklist**:
- [ ] Create `firebase-function/firestore.rules`
- [ ] Update `firebase.json` to reference rules file
- [ ] Deploy rules: `firebase deploy --only firestore:rules`
- [ ] Test with mobile apps to confirm authorized access works
- [ ] Test with unauthenticated requests to confirm denial

**Template**: See full rules in review output above (lines 1-70).

**Key Access Patterns**:
```javascript
// Users read own data only
match /customer_profiles/{userId} {
  allow read: if request.auth.uid == userId;
  allow write: if false; // Only Cloud Functions
}

// Sellers visible for discovery
match /seller_profiles/{sellerId} {
  allow read: if true; // Public store listing
  allow write: if false;
}

// Points/transactions: read own only
match /points/{docId} {
  allow read: if resource.data.user_id == request.auth.uid ||
                 resource.data.seller_id == request.auth.uid;
  allow write: if false;
}
```

---

#### 2. Missing Composite Indexes (T1-09)
**Impact**: 🚨 **Production query failures** — Compound queries fail without indexes.

**Current State**:
- No `firestore.indexes.json` file
- Works in emulator (auto-indexes) but **fails in production**
- Critical paths affected: wallet balance, transaction history, redemption list

**Required Indexes** (7 composite + 3 single DESC):

| Collection | Fields | Query Pattern |
|------------|--------|---------------|
| `points` | `[user_id ASC, seller_id ASC]` | Get points for user-seller pair |
| `transactions` | `[user_id ASC, created_at DESC]` | User transaction history |
| `transactions` | `[seller_id ASC, timestamp DESC]` | Seller transaction history |
| `redemptions` | `[user_id ASC, status ASC]` | User pending redemptions |
| `redemptions` | `[seller_id ASC, created_at DESC]` | Seller redemption list |
| `today_offer_claims` | `[user_id ASC, status ASC]` | User active offers |
| `qr_codes` | `[seller_id ASC, status ASC]` | Seller active QR codes |

**Implementation Checklist**:
- [ ] Create `firebase-function/firestore.indexes.json`
- [ ] Add composite index definitions (see template above)
- [ ] Update `firebase.json`: `"indexes": "firestore.indexes.json"`
- [ ] Deploy: `firebase deploy --only firestore:indexes`
- [ ] Monitor build status in Firebase console (indexes take 5-10 min to build)

**Template**: See full `firestore.indexes.json` in review output (lines 100-150).

---

#### 3. Non-Atomic Multi-Doc Writes (T1-10, T1-11)
**Impact**: 🔴 **Data inconsistency** — Partial writes on failure.

**Affected Files**:
1. `process-redemption.ts` lines 118-137 — redemption + transaction + seller stats
2. `verifyPayment.ts` lines 103-131 — payment + seller + subscription
3. `verifyIAPPurchase.ts` — subscription updates

**Current Anti-Pattern**:
```typescript
// ❌ NOT atomic
await Promise.all([
    redemptionRef.update({...}),
    db.collection("transactions").add({...}),
    sellerRef.update({...})
]);
```

**Correct Pattern**:
```typescript
// ✅ Atomic batch write
const batch = db.batch();
batch.update(redemptionRef, {...});
batch.set(txRef, {...});
batch.update(sellerRef, {...});
await batch.commit(); // All succeed or all fail
```

**Implementation Checklist**:
- [ ] Refactor `process-redemption.ts` lines 118-137 to use `db.batch()`
- [ ] Refactor `verifyPayment.ts` lines 103-131 to use `db.batch()`
- [ ] Refactor `verifyIAPPurchase.ts` subscription writes to `db.batch()`
- [ ] Verify existing atomic writes in `createPointsEarningTransaction()` (already correct)
- [ ] Add test: kill function mid-write, verify no partial state

---

### Performance Optimizations

#### 4. N+1 Query in `/get-balance` (T2-10)
**Impact**: 🟡 High latency + costs for users with many sellers.

**Current Code** (`get-balance.ts` line 70):
```typescript
// ❌ Makes N individual reads (N = number of sellers)
const sellerDocs = await Promise.all(
    sellerIds.map(id => db.collection("seller_profiles").doc(id).get())
);
```

**Optimized**:
```typescript
// ✅ Single batched read
const sellerRefs = sellerIds.map(id => db.collection("seller_profiles").doc(id));
const sellerDocs = await db.getAll(...sellerRefs);
```

**Impact**: 20 sellers → 1 roundtrip instead of 20.

**Implementation Checklist**:
- [ ] Update `get-balance.ts` line 70 to use `db.getAll()`
- [ ] Test with user having 10+ sellers
- [ ] Measure latency improvement (expect 50-80% reduction)

---

#### 5. Full Collection Scan (T2-11)
**Impact**: 🟡 Unbounded read costs.

**Current Code** (`helper.ts` line 82):
```typescript
const paymentsSnap = await db.collection("payments").get(); // No filters!
```

**Fix Options**:
1. Add `.where()` filters (e.g., `where("status", "==", "pending")`)
2. Add `.limit(100)` if for admin reporting
3. Document if full scan is intentional (e.g., one-time migration)

**Implementation Checklist**:
- [ ] Audit `helper.ts` line 82 usage context
- [ ] Add appropriate filters or limit
- [ ] If admin-only, add comment explaining why full scan is acceptable

---

### Data Lifecycle & Cleanup (T3-08, T3-09, T3-10)

#### 6. No TTL Cleanup for Growing Collections
**Impact**: 🟡 Unbounded growth → increased latency + costs over time.

**Collections Needing Cleanup**:
1. `user_notifications/{uid}/notifications` — grows indefinitely (1000+ docs per active user)
2. `qr_tokens` — expired tokens never deleted (status: "active", last_used_at > 5 min)
3. `push_tokens` — stale/failed tokens accumulate (failed delivery, uninstalled apps)
4. `daily_scans` — audit log grows forever (archive after 1 year)

**Proposed Cron Function**: `functions/src/modules/cron/cleanup-old-data.ts`

**Run Schedule**: Daily at 02:00 UTC

**Cleanup Logic**:
```typescript
export const cleanupOldData = functions.pubsub
  .schedule('0 2 * * *')
  .timeZone('UTC')
  .onRun(async () => {
    const batch = db.batch();
    const now = Date.now();
    
    // 1. Delete notifications > 90 days
    const oldNotifs = await db.collectionGroup('notifications')
      .where('created_at', '<', new Date(now - 90 * 24 * 60 * 60 * 1000))
      .limit(500)
      .get();
    
    oldNotifs.forEach(doc => batch.delete(doc.ref));
    
    // 2. Delete expired QR tokens (active, but last used > 5 min)
    const expiredTokens = await db.collection('qr_tokens')
      .where('status', '==', 'active')
      .where('last_used_at', '<', new Date(now - 5 * 60 * 1000))
      .limit(500)
      .get();
    
    expiredTokens.forEach(doc => batch.delete(doc.ref));
    
    // 3. Delete stale push tokens (last used > 180 days OR failed > 5 times)
    const staleTokens = await db.collection('push_tokens')
      .where('last_used_at', '<', new Date(now - 180 * 24 * 60 * 60 * 1000))
      .limit(500)
      .get();
    
    staleTokens.forEach(doc => batch.delete(doc.ref));
    
    await batch.commit();
    console.log(`Cleaned up ${oldNotifs.size + expiredTokens.size + staleTokens.size} docs`);
  });
```

**Implementation Checklist**:
- [ ] Create `functions/src/modules/cron/cleanup-old-data.ts`
- [ ] Add scheduled function to exports in `index.ts`
- [ ] Deploy: `firebase deploy --only functions:cleanupOldData`
- [ ] Monitor Cloud Logging for cleanup stats
- [ ] Add alert if cleanup deletes > 10K docs/day (sign of runaway growth)

---

### Documentation (T4-06)

#### 7. Firestore Schema Documentation
**Current State**: No single source of truth for schema.

**Proposed**: `firebase-function/_docs/FIRESTORE_SCHEMA.md`

**Contents**:
- Collection list with purpose
- Field names, types, and nullability
- Access patterns (who reads/writes)
- Denormalization rules (e.g., `seller_name` stored in `transactions`)
- Index requirements per collection
- Data lifecycle policies (TTL, archival)

**Implementation Checklist**:
- [ ] Create `_docs/FIRESTORE_SCHEMA.md`
- [ ] Document all 25+ collections
- [ ] Include example documents (anonymized)
- [ ] Link from main README

---

### Monitoring (T4-07)

#### 8. Firestore Cost/Performance Monitoring
**Current State**: No budget alerts or dashboards.

**Proposed Alerts** (Google Cloud Monitoring):
1. Daily reads > 1M documents
2. Daily writes > 500K documents
3. Monthly Firestore cost > $X threshold
4. Query latency p95 > 500ms

**Implementation Checklist**:
- [ ] Enable Cloud Billing API
- [ ] Create budget alert in GCP console
- [ ] Set up Cloud Monitoring dashboard with Firestore metrics
- [ ] Configure email/Slack alerts for threshold breaches
- [ ] Add weekly cost review to team calendar

---

### Quick Reference: Implementation Priority

**Week 1 (Deploy Blockers)**:
1. ✅ Create & deploy `firestore.rules` (T1-08)
2. ✅ Create & deploy `firestore.indexes.json` (T1-09)
3. ✅ Fix atomic writes in redemption flow (T1-10)

**Week 2 (Performance)**:
4. ✅ Fix N+1 query in `/get-balance` (T2-10)
5. ✅ Add full collection scan filters (T2-11)
6. ✅ Replace `new Date()` with `serverTimestamp()` (T2-12)

**Week 3 (Operational)**:
7. ✅ Create TTL cleanup cron (T3-08, T3-09, T3-10)
8. ✅ Document Firestore schema (T4-06)
9. ✅ Set up cost monitoring (T4-07)

---

### Files to Create

```
firebase-function/
├── firestore.rules                           # NEW — Security rules
├── firestore.indexes.json                    # NEW — Composite indexes
├── functions/src/modules/cron/
│   └── cleanup-old-data.ts                   # NEW — TTL cleanup
└── _docs/
    └── FIRESTORE_SCHEMA.md                   # NEW — Schema docs
```

### Files to Modify

```
firebase-function/
├── firebase.json                              # Add rules + indexes references
├── functions/src/modules/redemption/
│   └── process-redemption.ts                 # Lines 118-137: use db.batch()
├── functions/src/modules/payments/
│   ├── verifyPayment.ts                      # Lines 103-131: use db.batch()
│   └── verifyIAPPurchase.ts                  # Subscription writes: use db.batch()
├── functions/src/modules/points/
│   └── get-balance.ts                        # Line 70: use db.getAll()
├── functions/src/utils/
│   └── helper.ts                             # Line 82: add filters/limit
└── functions/src/modules/qr-code/
    └── scan-user-qr-code.ts                  # Replace new Date() with serverTimestamp()
```

