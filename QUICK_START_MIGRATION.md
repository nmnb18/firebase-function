🚀 QUICK START: Continue Firebase Functions Migration
=======================================================

## What's Been Done
✅ All 15 authentication functions converted (100% complete)
✅ Core utilities created (callable.ts, performance.ts)
✅ Build verified - no TypeScript errors

## Quick Conversion Process

### 1. Read the Original Function
```bash
cat functions/src/modules/MODULENAME/FUNCTIONNAME.ts
```

### 2. Identify the Pattern
```
- Simple READ (single query) → Template 1
- Simple WRITE (single update) → Template 2  
- Complex WRITE (multi-step) → Template 3
- Parallel ops → Template 4
- Token operations → Template 5
- Delete operations → Template 6
```

### 3. Use the Template
See: `QUICK_MIGRATION_PATTERNS.ts` for all 6 templates

### 4. Key Points
```typescript
// BEFORE (onRequest pattern)
export const myFunction = functions.https.onRequest(
  { region: "asia-south1" },
  async (req, res) => {
    corsHandler(req, res, async () => {
      try {
        const { data } = req.body;
        // ... validation
        // ... business logic
        return res.status(200).json({ result });
      } catch (error) {
        return res.status(500).json({ error });
      }
    });
  }
);

// AFTER (onCall pattern)
export const myFunction = createCallableFunction<InputType, OutputType>(
  async (data) => {
    const { data } = data;
    // ... validation
    // ... business logic
    return { result };
  },
  { region: "asia-south1", requireAuth: true }
);
```

### 5. Verify Compilation
```bash
cd functions
npm run build
```

## Remaining Modules Priority Order

### Priority 1: Seller Functions (10) - HIGH IMPACT
```
- getSellerOffers (called frequently)
- getSellerDetails (called frequently)
- saveSellerOffer (write-heavy)
- getNearbySellers (map loads)
```

### Priority 2: Redemption Functions (9) - MEDIUM IMPACT
```
- processRedemption (complex logic)
- verifyRedeemCode (validation)
```

### Priority 3: Payment Functions (6) - MEDIUM IMPACT
```
- createOrder (payment flow)
- verifyPayment (verification)
```

### Priority 4: QR Code Functions (7) - MEDIUM IMPACT
```
- generateQRCode (generation)
- scanQRCode (read)
```

### Priority 5: User Functions (6) - LOW IMPACT
```
- updateUserProfile
- getUserDetails
```

## Conversion Checklist

For each function:
- [ ] Read the original file
- [ ] Choose the correct template
- [ ] Replace imports (remove cors, functions, add createCallableFunction)
- [ ] Convert function signature
- [ ] Update request handling (data comes as parameter, not req.body)
- [ ] Update response (return data directly, errors throw)
- [ ] Remove CORS handler (built-in to callable)
- [ ] Remove HTTP status codes (handled by callable)
- [ ] Run `npm run build`
- [ ] Verify no TypeScript errors

## Example: Converting a Simple Read Function

BEFORE:
```typescript
import * as functions from "firebase-functions";
import cors from "cors";
import { db } from "../../config/firebase";

const corsHandler = cors({ origin: true });

export const getUserDetails = functions.https.onRequest(
  { region: "asia-south1" },
  (req, res) => {
    corsHandler(req, res, async () => {
      try {
        const { uid } = req.body;
        const doc = await db.collection("users").doc(uid).get();
        return res.status(200).json({ data: doc.data() });
      } catch (error: any) {
        return res.status(500).json({ error: error.message });
      }
    });
  }
);
```

AFTER:
```typescript
import { createCallableFunction } from "../../utils/callable";
import { db } from "../../config/firebase";

export const getUserDetails = createCallableFunction<
  { uid: string },
  any
>(
  async (data) => {
    const { uid } = data;
    const doc = await db.collection("users").doc(uid).get();
    return doc.data();
  },
  { region: "asia-south1", requireAuth: true }
);
```

## Common Mistakes to Avoid

❌ Forgetting to update imports
❌ Keeping cors handler code
❌ Using req.body instead of data
❌ Returning res.status() instead of throwing/returning
❌ Not using Promise.all() for parallel operations
❌ Forgetting to add secrets: ["API_KEY"] if needed
❌ Not setting requireAuth correctly

## Files to Reference

📄 `QUICK_MIGRATION_PATTERNS.ts` - All template examples
📄 `AUTH_MIGRATION_COMPLETE.md` - Auth examples
📄 `MIGRATION_TEMPLATE.md` - Detailed patterns
📄 `src/modules/auth/*.ts` - Real examples

## How to Use Callable Functions

```typescript
import { createCallableFunction } from "../../utils/callable";

export const myFunction = createCallableFunction<
  InputDataType,
  OutputDataType
>(
  async (data, auth, context) => {
    // data = request data
    // auth = { uid, email } or undefined if requireAuth: false
    // context = Firebase context (region, etc)
    
    // Validation
    if (!data.email) throw new Error("Email required");
    
    // Business logic
    const result = await doSomething(data);
    
    // Return result (no need for status codes)
    return result;
  },
  {
    region: "asia-south1",
    requireAuth: true,  // Set false for public functions
    secrets: ["API_KEY"]  // If using environment secrets
  }
);
```

## Performance Tips

✅ Use Promise.all() for parallel database queries
✅ Use caching for frequently accessed data
✅ Batch write operations
✅ Query only needed fields (.select())
✅ Use indexes for large collections
✅ Limit query results with .limit()

Example:
```typescript
// ❌ SLOW: Sequential queries
const user = await db.collection("users").doc(uid).get();
const profile = await db.collection("profiles").doc(uid).get();

// ✅ FAST: Parallel queries
const [user, profile] = await Promise.all([
  db.collection("users").doc(uid).get(),
  db.collection("profiles").doc(uid).get()
]);
```

## Testing After Conversion

```bash
# Compile
npm run build

# Test specific function (if test suite exists)
npm test -- --testNamePattern="functionName"

# Deploy to emulator
firebase emulators:start
```

## Progress Tracking

Current Status: 15/57 (26%)
- ✅ Auth: 15/15 (100%)
- ⏳ Seller: 0/10 (0%)
- ⏳ Redemption: 0/9 (0%)
- ⏳ Payment: 0/6 (0%)
- ⏳ QR Code: 0/7 (0%)
- ⏳ User: 0/6 (0%)
- ⏳ Other: 0/4 (0%)

Next Target: Complete Seller module (10 functions)
Estimated Time: 3-4 hours

## Need Help?

1. Check QUICK_MIGRATION_PATTERNS.ts for all examples
2. Look at auth module for real implementations
3. Read MIGRATION_TEMPLATE.md for detailed walkthrough
4. Review OPTIMIZATION_GUIDE.md for best practices

---

Ready to convert the next module? Start with seller functions!
