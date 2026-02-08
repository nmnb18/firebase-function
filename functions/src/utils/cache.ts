/**
 * In-Memory Cache Utility
 * Provides TTL-based caching for frequently accessed data
 */

interface CacheEntry<T> {
    data: T;
    expires: number;
    hits: number;
}

interface CacheStats {
    totalHits: number;
    totalMisses: number;
    hitRate: number;
}

class InMemoryCache {
    private cache: Map<string, CacheEntry<any>> = new Map();
    private stats = { hits: 0, misses: 0 };

    /**
     * Get value from cache if not expired
     */
    get<T>(key: string): T | null {
        const entry = this.cache.get(key);

        if (!entry) {
            this.stats.misses++;
            return null;
        }

        // Check if expired
        if (Date.now() > entry.expires) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }

        // Hit!
        entry.hits++;
        this.stats.hits++;
        return entry.data as T;
    }

    /**
     * Set value in cache with TTL (milliseconds)
     */
    set<T>(key: string, value: T, ttlMs: number = 60000): void {
        this.cache.set(key, {
            data: value,
            expires: Date.now() + ttlMs,
            hits: 0,
        });
    }

    /**
     * Delete key from cache
     */
    delete(key: string): boolean {
        return this.cache.delete(key);
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        this.cache.clear();
        this.stats = { hits: 0, misses: 0 };
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        const total = this.stats.hits + this.stats.misses;
        return {
            totalHits: this.stats.hits,
            totalMisses: this.stats.misses,
            hitRate: total > 0 ? (this.stats.hits / total) * 100 : 0,
        };
    }

    /**
     * Get cache size (number of entries)
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * Clean expired entries
     */
    prune(): number {
        let pruned = 0;
        const now = Date.now();

        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expires) {
                this.cache.delete(key);
                pruned++;
            }
        }

        return pruned;
    }
}

// Export singleton instance for global use
export const globalCache = new InMemoryCache();

/**
 * Create a namespaced cache instance
 * Useful for isolating caches by feature
 */
export function createCache() {
    return new InMemoryCache();
}

export default globalCache;
