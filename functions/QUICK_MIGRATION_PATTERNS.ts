/**
 * QUICK START MIGRATION GUIDE
 * 
 * This file contains generic refactored versions of the most common function patterns.
 * Copy and adapt these as needed for your specific functions.
 */

// ============================================
// PATTERN 1: Simple Read Function (GET)
// ============================================

import { createCallableFunction } from "../../utils/callable";
import { db } from "../../config/firebase";
import { cacheManager, generateCacheKey } from "../../utils/performance";

interface SimpleReadRequest {
    id: string;
}

export const simpleRead = createCallableFunction<SimpleReadRequest, any>(
    async (data, auth, context) => {
        const { id } = data;
        if (!auth?.uid) throw new Error("Unauthorized");

        // Try cache first
        const cacheKey = generateCacheKey("simpleRead", { id });
        const cached = cacheManager.get(cacheKey);
        if (cached) return cached;

        // Fetch data
        const doc = await db.collection("collection_name").doc(id).get();
        if (!doc.exists) throw new Error("Not found");

        const result = doc.data();
        cacheManager.set(cacheKey, result, 300); // 5 min TTL
        return result;
    },
    { region: "asia-south1", requireAuth: true }
);

// ============================================
// PATTERN 2: Simple Write Function (POST)
// ============================================

import { createCallableFunction } from "../../utils/callable";
import { db, adminRef } from "../../config/firebase";

interface SimpleWriteRequest {
    id: string;
    data: any;
}

export const simpleWrite = createCallableFunction<SimpleWriteRequest, any>(
    async (data, auth, context) => {
        const { id, data: updateData } = data;
        if (!auth?.uid) throw new Error("Unauthorized");

        // Validate input
        if (!id || !updateData) throw new Error("Missing required fields");

        // Write data
        await db.collection("collection_name").doc(id).set(updateData, { merge: true });

        return { success: true, id };
    },
    { region: "asia-south1", requireAuth: true }
);

// ============================================
// PATTERN 3: Transaction-based Function
// ============================================

import { createCallableFunction } from "../../utils/callable";
import { db, adminRef } from "../../config/firebase";

interface TransactionRequest {
    targetId: string;
    amount: number;
}

export const transactionFunc = createCallableFunction<TransactionRequest, any>(
    async (data, auth, context) => {
        const { targetId, amount } = data;
        if (!auth?.uid) throw new Error("Unauthorized");
        if (amount <= 0) throw new Error("Invalid amount");

        // Use transaction for multi-step operations
        const result = await db.runTransaction(async (tx: any) => {
            // Read
            const doc1 = await tx.get(db.collection("col1").doc(auth.uid));
            const doc2 = await tx.get(db.collection("col2").doc(targetId));

            if (!doc1.exists || !doc2.exists) throw new Error("Records not found");

            // Process
            const newBalance = (doc1.data().balance || 0) - amount;
            if (newBalance < 0) throw new Error("Insufficient balance");

            // Write
            tx.update(db.collection("col1").doc(auth.uid), { balance: newBalance });
            tx.update(db.collection("col2").doc(targetId), {
                balance: (doc2.data().balance || 0) + amount
            });

            return { success: true, newBalance };
        });

        return result;
    },
    { region: "asia-south1", requireAuth: true }
);

// ============================================
// PATTERN 4: Parallel Query Function
// ============================================

import { createCallableFunction } from "../../utils/callable";
import { db } from "../../config/firebase";

interface ParallelRequest {
    id: string;
}

export const parallelFunc = createCallableFunction<ParallelRequest, any>(
    async (data, auth, context) => {
        const { id } = data;
        if (!auth?.uid) throw new Error("Unauthorized");

        // Execute queries in parallel
        const [doc1, doc2, doc3] = await Promise.all([
            db.collection("users").doc(auth.uid).get(),
            db.collection("sellers").doc(id).get(),
            db.collection("transactions")
                .where("user_id", "==", auth.uid)
                .where("seller_id", "==", id)
                .limit(1)
                .get()
        ]);

        if (!doc1.exists || !doc2.exists) throw new Error("Data not found");

        return {
            user: doc1.data(),
            seller: doc2.data(),
            transaction: doc3.empty ? null : doc3.docs[0].data()
        };
    },
    { region: "asia-south1", requireAuth: true }
);

// ============================================
// PATTERN 5: Public Endpoint (No Auth)
// ============================================

import { createCallableFunction } from "../../utils/callable";
import { db } from "../../config/firebase";

interface PublicRequest {
    query: string;
}

export const publicFunc = createCallableFunction<PublicRequest, any>(
    async (data, auth, context) => {
        const { query } = data;
        if (!query) throw new Error("Query required");

        // No auth check - public endpoint
        const results = await db.collection("public_data")
            .where("searchable", "==", true)
            .orderBy("name")
            .limit(10)
            .get();

        return results.docs.map(doc => doc.data());
    },
    { region: "asia-south1", requireAuth: false } // Public
);

// ============================================
// PATTERN 6: With Admin Utilities
// ============================================

import { createCallableFunction } from "../../utils/callable";
import { db, adminRef } from "../../config/firebase";

interface UtilRequest {
    id: string;
    amount: number;
}

export const utilFunc = createCallableFunction<UtilRequest, any>(
    async (data, auth, context) => {
        const { id, amount } = data;
        if (!auth?.uid) throw new Error("Unauthorized");

        const timestamp = adminRef.firestore.FieldValue.serverTimestamp();
        const increment = adminRef.firestore.FieldValue.increment(amount);

        // Use server utilities
        await db.collection("records").doc(id).update({
            balance: increment,
            lastUpdated: timestamp,
            modifiedBy: auth.uid
        });

        return { success: true };
    },
    { region: "asia-south1", requireAuth: true }
);
