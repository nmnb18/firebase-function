# Firebase Functions Performance Optimization Guide

## 🚀 Key Optimizations Implemented

### 1. **onRequest → onCall Migration**
   - **onRequest**: Heavy HTTP overhead, CORS handling, manual auth
   - **onCall**: Lightweight, built-in auth, auto serialization, ~40-50% faster
   
   **Before:**
   ```typescript
   export const myFunc = functions.https.onRequest(
       { region: 'asia-south1' }, (req, res) => {
           corsHandler(req, res, async () => {
               const currentUser = await authenticateUser(req.headers.authorization);
               // ... rest of code
           });
       }
   );
   ```
   
   **After:**
   ```typescript
   export const myFunc = createCallableFunction(
       async (data, auth, context) => {
           const userId = auth?.uid; // Auto-authenticated
           // ... rest of code
           return successData;
       },
       { region: "asia-south1", requireAuth: true }
   );
   ```

### 2. **Parallel Queries**
   - Execute independent queries simultaneously instead of sequentially
   - Reduces response time by 50-70% when fetching related data
   
   **Before:**
   ```typescript
   const sellerDoc = await db.collection("seller_profiles").doc(seller_id).get();
   const userData = await db.collection("users").doc(userId).get();
   const pointsDoc = await db.collection("points").doc(pointsId).get();
   // 3 sequential calls ≈ 3x latency
   ```
   
   **After:**
   ```typescript
   const [sellerDoc, userData, pointsDoc] = await Promise.all([
       db.collection("seller_profiles").doc(seller_id).get(),
       db.collection("users").doc(userId).get(),
       db.collection("points").doc(pointsId).get(),
   ]);
   // All parallel ≈ 1x latency
   ```

### 3. **Caching Layer**
   - Implemented in-memory cache with TTL for frequently accessed data
   - Reduces database read costs and latency
   
   **Usage:**
   ```typescript
   import { generateCacheKey, cacheManager } from "../../utils/performance";
   
   const cacheKey = generateCacheKey("seller", { sellerId });
   let seller = cacheManager.get(cacheKey);
   
   if (!seller) {
       seller = await db.collection("seller_profiles").doc(sellerId).get();
       cacheManager.set(cacheKey, seller, 300); // 5 min TTL
   }
   ```

### 4. **Batch Operations**
   - Fetch multiple documents efficiently
   - Reduce round trips to database
   
   **Usage:**
   ```typescript
   import { batchGetDocs } from "../../utils/performance";
   
   const refs = [ref1, ref2, ref3, ...];
   const docs = await batchGetDocs(db, refs);
   ```

### 5. **Error Handling & Validation**
   - Standardized error responses
   - Early validation to fail fast
   
   **Usage:**
   ```typescript
   import { errorResponse, successResponse, validators, validationErrors } from "../../utils/callable";
   
   if (!validators.isEmail(email)) {
       throw new Error(validationErrors.invalidEmail);
   }
   ```

### 6. **Performance Monitoring**
   - Built-in performance measurement
   - Track execution time for optimization
   
   **Usage:**
   ```typescript
   import { measurePerformance } from "../../utils/performance";
   
   const { result, duration } = await measurePerformance(
       () => fetchData(),
       "fetchData"
   );
   ```

---

## 📋 Migration Checklist

### Phase 1: Setup (Done)
- ✅ Create `/utils/performance.ts` - Caching & batch utilities
- ✅ Create `/utils/callable.ts` - Callable function wrapper

### Phase 2: Priority Functions to Migrate
1. **Auth Functions** (Most frequent use)
   - [ ] loginUser.ts
   - [ ] loginSeller.ts
   - [ ] registerUser.ts
   - [ ] registerSeller.ts
   - [ ] refreshToken.ts

2. **Read-Heavy Functions** (Heavy on queries)
   - [ ] getSellerDetails.ts
   - [ ] getUserDetails.ts
   - [ ] getNearbySellers.ts
   - [ ] getSellerOffers.ts

3. **Transaction Functions** (Critical performance)
   - [ ] createRedemption.ts ✅ (Already done)
   - [ ] scanQRCode.ts
   - [ ] processRedemption.ts

4. **Other Functions**
   - [ ] Remaining modules...

### Phase 3: Testing & Validation
- [ ] Unit tests for each migrated function
- [ ] Load testing with Firebase emulator
- [ ] Monitor real-world performance

---

## ⚡ Performance Expectations

### Expected Improvements
| Metric | Before | After | Improvement |
|--------|--------|-------|------------|
| Response Time | 200-500ms | 100-200ms | 50-60% |
| CORS Overhead | 50-100ms | 0ms | 100% |
| Auth Check | 50-100ms | Inline | 40% |
| Multi-Query | N×latency | 1×latency | N-1 reduction |
| Cold Start | 1000ms+ | 500-700ms | 30-50% |

### Measurement
Use the performance monitoring tools:
```typescript
// In your function
const { result, duration } = await measurePerformance(
    () => expensiveOperation(),
    "expensiveOperation"
);
console.log(`Operation took ${duration}ms`);
```

---

## 🔄 Migration Template

```typescript
import * as functions from "firebase-functions";
import { createCallableFunction } from "../../utils/callable";
import { cacheManager, generateCacheKey } from "../../utils/performance";

interface MyFunctionRequest {
    param1: string;
    param2: number;
}

interface MyFunctionResponse {
    result: any;
}

export const myFunction = createCallableFunction<MyFunctionRequest, MyFunctionResponse>(
    async (data, auth, context) => {
        const { param1, param2 } = data;
        const userId = auth?.uid;

        if (!userId) {
            throw new Error("Unauthorized");
        }

        // Validation
        if (!param1 || param2 <= 0) {
            throw new Error("Invalid parameters");
        }

        // Try cache first
        const cacheKey = generateCacheKey("myFunc", { param1 });
        let cachedResult = cacheManager.get<any>(cacheKey);
        if (cachedResult) return cachedResult;

        // Parallel queries
        const [doc1, doc2, doc3] = await Promise.all([
            db.collection("collection1").doc(param1).get(),
            db.collection("collection2").where("id", "==", param2).limit(1).get(),
            db.collection("collection3").doc(userId).get(),
        ]);

        // Business logic
        const result = processData(doc1, doc2, doc3);

        // Cache result
        cacheManager.set(cacheKey, result, 300); // 5 min TTL

        return result;
    },
    { region: "asia-south1", requireAuth: true }
);
```

---

## 🔧 Frontend Usage Changes

### Before (REST)
```javascript
const response = await fetch(
    "https://asia-south1-project.cloudfunctions.net/loginUser",
    {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ email, password, role })
    }
);
const data = await response.json();
```

### After (Callable)
```javascript
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebaseConfig";

const loginUser = httpsCallable(functions, "loginUser");
const result = await loginUser({ email, password, role });
const data = result.data; // Already authenticated

// Error handling
try {
    const result = await loginUser(params);
    console.log(result.data);
} catch (error) {
    console.error(error.message);
}
```

---

## 📊 Database Indexes to Create

For optimal query performance, create these indexes in Firestore:

```firestore-rules
// Collections with query optimization needed
points: [user_id, seller_id]
point_holds: [user_id, seller_id, status]
redemptions: [user_id, status, created_at]
seller_profiles: [user_id]
users: [role, email_verified]
```

**Via Firebase Console:**
1. Go to Firestore → Composite Indexes
2. Create composite indexes for multi-field queries
3. Verify indexes are "Enabled"

---

## 🎯 Tips for Best Performance

1. **Use onCall for authenticated operations** (90% of your functions)
2. **Use onRequest only for webhooks** (payment callbacks, cron events)
3. **Batch unrelated queries with Promise.all()**
4. **Cache hot data** (user profiles, seller info, settings)
5. **Validate early, fail fast**
6. **Use transactions only when necessary**
7. **Monitor cold starts** and keep functions warm
8. **Compress responses** for large datasets
9. **Implement pagination** for list operations
10. **Use field masking** to fetch only needed fields

---

## 🧪 Testing Your Migration

```typescript
import { httpsCallable } from "firebase/functions";
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Mock test
const mockRequest = {
    param1: "test",
    param2: 100
};

try {
    const result = await myFunction(mockRequest);
    console.log("✅ Success:", result.data);
    console.log("⏱️ Response time: < 300ms expected");
} catch (error) {
    console.error("❌ Error:", error.message);
}
```

---

## 📝 Notes

- All times are approximate and depend on data size and network conditions
- Use Firebase Emulator Suite for local testing before deployment
- Monitor real-world usage via Firebase Console Analytics
- Consider upgrading Firestore instances for high-throughput scenarios
- Set up proper monitoring and alerting for production
