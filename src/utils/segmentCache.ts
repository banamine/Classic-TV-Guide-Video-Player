/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ---- Config ----
const CACHE_WINDOW_HOURS = 48;
export const SEGMENT_TTL_MS = CACHE_WINDOW_HOURS * 60 * 60 * 1000;

export interface CachedSegment {
  id: string;        // segmentId (e.g. "BBCNEWS_20260721_000000__start0_end60")
  url: string;       // original URL
  blob: Blob;        // fetched video blob
  fetchedAt: number; // Date.now() timestamp
  outlet: string;    // outlet (e.g. 'FOXNEWSW', 'CNNW', 'BBCNEWS')
  timestamp: number; // timestamp or index for ordering
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }
    const request = indexedDB.open('SegmentCacheDB', 1);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains('segments')) {
        const store = db.createObjectStore('segments', { keyPath: 'id' });
        store.createIndex('outlet', 'outlet', { unique: false });
        store.createIndex('fetchedAt', 'fetchedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Check if a cached entry is stale (older than 48 hours)
 */
export function isStale(cachedEntry: { fetchedAt: number }): boolean {
  const age = Date.now() - cachedEntry.fetchedAt;
  return age > SEGMENT_TTL_MS;
}

/**
 * Retrieve a segment from IndexedDB cache
 */
export async function getCachedSegment(segmentId: string): Promise<CachedSegment | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('segments', 'readonly');
      const store = transaction.objectStore('segments');
      const request = store.get(segmentId);

      request.onsuccess = () => {
        const result = request.result as CachedSegment | undefined;
        resolve(result || null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[Segment Cache] Error getting segment from DB:', err);
    return null;
  }
}

/**
 * Save a segment to IndexedDB cache
 */
export async function saveCachedSegment(
  segmentId: string,
  url: string,
  blob: Blob,
  outlet: string,
  timestamp: number = Date.now()
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('segments', 'readwrite');
      const store = transaction.objectStore('segments');
      const entry: CachedSegment = {
        id: segmentId,
        url,
        blob,
        fetchedAt: Date.now(),
        outlet,
        timestamp,
      };
      const request = store.put(entry);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[Segment Cache] Error saving segment to DB:', err);
  }
}

/**
 * Retrieve the nearest cached segment for a given outlet to use as a fallback
 */
export async function getNearestCachedSegment(segmentId: string, outlet: string): Promise<CachedSegment | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('segments', 'readonly');
      const store = transaction.objectStore('segments');
      const index = store.index('outlet');
      const request = index.getAll(outlet);

      request.onsuccess = () => {
        const entries = request.result as CachedSegment[];
        if (!entries || entries.length === 0) {
          resolve(null);
          return;
        }

        // Try to find the closest entry in terms of lexicographical ID or time
        // Since segmentId has start/end or segment indices, let's sort by proximity
        let closest: CachedSegment | null = null;
        let minDistance = Infinity;

        entries.forEach((entry) => {
          // Calculate distance in fetchedAt time, or simply string similarity
          // A simple fallback is the newest fetched or the nearest lexicographically
          const dist = Math.abs(entry.id.localeCompare(segmentId));
          if (dist < minDistance) {
            minDistance = dist;
            closest = entry;
          }
        });

        // Fallback to the newest if no exact match
        if (!closest && entries.length > 0) {
          closest = entries.sort((a, b) => b.fetchedAt - a.fetchedAt)[0];
        }

        resolve(closest);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[Segment Cache] Error getting nearest segment:', err);
    return null;
  }
}

/**
 * Evict segments older than 48 hours from the cache
 */
export async function evictStaleSegments(): Promise<void> {
  try {
    const db = await openDB();
    const entriesToEvict: string[] = [];

    // First find all stale entries
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('segments', 'readonly');
      const store = transaction.objectStore('segments');
      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const entry = cursor.value as CachedSegment;
          if (isStale(entry)) {
            entriesToEvict.push(entry.id);
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });

    if (entriesToEvict.length === 0) {
      console.log('[Segment Cache] No stale segments to evict.');
      return;
    }

    console.log(`[Segment Cache] Evicting ${entriesToEvict.length} stale segments...`);
    
    // Now delete them in a write transaction
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('segments', 'readwrite');
      const store = transaction.objectStore('segments');
      
      let completedCount = 0;
      let hasError = false;

      entriesToEvict.forEach((id) => {
        const deleteRequest = store.delete(id);
        deleteRequest.onsuccess = () => {
          completedCount++;
          if (completedCount === entriesToEvict.length && !hasError) {
            resolve();
          }
        };
        deleteRequest.onerror = () => {
          if (!hasError) {
            hasError = true;
            reject(deleteRequest.error);
          }
        };
      });
    });

    console.log('[Segment Cache] Eviction complete.');
  } catch (err) {
    console.warn('[Segment Cache] Error during eviction:', err);
  }
}
