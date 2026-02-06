/**
 * Performance optimization utilities for Firebase functions
 * - Caching
 * - Batch operations
 * - Response compression
 * - Error handling
 */

import { firestore } from "firebase-admin";

// Simple in-memory cache with TTL
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class CacheManager {
  private cache: Map<string, CacheEntry<any>> = new Map();

  set<T>(key: string, data: T, ttlSeconds: number = 300): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlSeconds * 1000,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  clear(): void {
    this.cache.clear();
  }

  delete(key: string): void {
    this.cache.delete(key);
  }
}

export const cacheManager = new CacheManager();

/**
 * Generates cache key from parameters
 */
export function generateCacheKey(prefix: string, params: Record<string, any>): string {
  const paramStr = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join("|");
  return `${prefix}:${paramStr}`;
}

/**
 * Batch read multiple documents efficiently
 */
export async function batchGetDocs(
  db: firestore.Firestore,
  refs: firestore.DocumentReference[]
): Promise<firestore.DocumentSnapshot[]> {
  if (refs.length === 0) return [];

  // Firebase batches max 20 documents, so split if needed
  const batchSize = 20;
  const batches = [];

  for (let i = 0; i < refs.length; i += batchSize) {
    const batch = refs.slice(i, i + batchSize);
    const promises = batch.map((ref) => ref.get());
    batches.push(await Promise.all(promises));
  }

  return batches.flat();
}

/**
 * Parallel query execution with timeout
 */
export async function executeQueriesParallel<T>(
  queries: Promise<T>[],
  timeoutMs: number = 30000
): Promise<T[]> {
  return Promise.race([
    Promise.all(queries),
    new Promise<T[]>((_, reject) =>
      setTimeout(() => reject(new Error("Query timeout")), timeoutMs)
    ),
  ]);
}

/**
 * Optimized user points lookup with caching
 */
export async function getUserPointsEfficient(
  db: firestore.Firestore,
  userId: string,
  sellerId: string,
  cache: boolean = true
): Promise<any | null> {
  const cacheKey = generateCacheKey("user_points", { userId, sellerId });

  if (cache) {
    const cached = cacheManager.get(cacheKey);
    if (cached) return cached;
  }

  const pointsQuery = await db
    .collection("points")
    .where("user_id", "==", userId)
    .where("seller_id", "==", sellerId)
    .limit(1)
    .get();

  if (pointsQuery.empty) return null;

  const data = pointsQuery.docs[0].data();
  if (cache) {
    cacheManager.set(cacheKey, data, 300); // 5 min cache
  }
  return data;
}

/**
 * Fetch seller data with points in parallel
 */
export async function getSellerWithPointsEfficient(
  db: firestore.Firestore,
  sellerId: string,
  userId: string
): Promise<{ seller: any; points: any } | null> {
  try {
    const [sellerSnap, pointsSnap] = await Promise.all([
      db.collection("seller_profiles").doc(sellerId).get(),
      db
        .collection("points")
        .where("user_id", "==", userId)
        .where("seller_id", "==", sellerId)
        .limit(1)
        .get(),
    ]);

    if (!sellerSnap.exists) return null;

    return {
      seller: sellerSnap.data(),
      points: pointsSnap.empty ? null : pointsSnap.docs[0].data(),
    };
  } catch (error) {
    console.error("Error fetching seller with points:", error);
    return null;
  }
}

/**
 * Validate available points including reserved holds
 */
export async function validateAvailablePoints(
  db: firestore.Firestore,
  userId: string,
  sellerId: string,
  requiredPoints: number
): Promise<{ available: boolean; availablePoints: number; message: string }> {
  try {
    const [pointsSnap, holdsSnap] = await Promise.all([
      db
        .collection("points")
        .where("user_id", "==", userId)
        .where("seller_id", "==", sellerId)
        .limit(1)
        .get(),
      db
        .collection("point_holds")
        .where("user_id", "==", userId)
        .where("seller_id", "==", sellerId)
        .where("status", "==", "reserved")
        .get(),
    ]);

    const totalPoints = pointsSnap.empty ? 0 : (pointsSnap.docs[0].data()?.points || 0);

    let reservedPoints = 0;
    holdsSnap.forEach((doc) => {
      reservedPoints += doc.data()?.points || 0;
    });

    const availablePoints = totalPoints - reservedPoints;
    const available = availablePoints >= requiredPoints;

    return {
      available,
      availablePoints,
      message: available
        ? `Available points: ${availablePoints}`
        : `Insufficient points. Available: ${availablePoints}, Required: ${requiredPoints}`,
    };
  } catch (error) {
    console.error("Error validating points:", error);
    throw new Error("Failed to validate points");
  }
}

/**
 * Error response standardizer
 */
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: any;
}

export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  timestamp?: number;
}

export function errorResponse(
  message: string,
  code?: string,
  details?: any
): ErrorResponse {
  return {
    success: false,
    error: message,
    ...(code && { code }),
    ...(details && { details }),
  };
}

export function successResponse<T>(data: T): SuccessResponse<T> {
  return {
    success: true,
    data,
    timestamp: Date.now(),
  };
}

/**
 * Measure execution time
 */
export async function measurePerformance<T>(
  fn: () => Promise<T>,
  label: string
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  console.log(`[PERF] ${label}: ${duration.toFixed(2)}ms`);
  return { result, duration };
}
