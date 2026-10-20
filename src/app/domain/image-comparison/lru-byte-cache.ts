/**
 * Least-recently-used cache bounded by the total size of its values (ARCH-DECISION-014).
 * The `Map` insertion order is the recency order: the first key is the least recently used.
 */
export interface LruByteCache<V> {
  /** Refreshes the position of the key. */
  get(key: string): V | undefined;
  /** Evicts least recently used entries until the total is at most `maxBytes`; a value larger than `maxBytes` is not stored. */
  set(key: string, value: V): void;
  delete(key: string): void;
  /** Does not refresh the position. */
  has(key: string): boolean;
  totalBytes(): number;
}

export function createLruByteCache<V>(
  maxBytes: number,
  sizeOf: (value: V) => number
): LruByteCache<V> {
  const entries = new Map<string, { value: V; size: number }>();
  let total = 0;

  const remove = (key: string) => {
    const entry = entries.get(key);
    if (entry === undefined) return;
    entries.delete(key);
    total -= entry.size;
  };

  return {
    get(key) {
      const entry = entries.get(key);
      if (entry === undefined) return undefined;
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      remove(key);
      const size = sizeOf(value);
      if (size > maxBytes) return;
      entries.set(key, { value, size });
      total += size;
      for (const oldest of entries.keys()) {
        if (total <= maxBytes) break;
        remove(oldest);
      }
    },
    delete: remove,
    has: (key) => entries.has(key),
    totalBytes: () => total,
  };
}
