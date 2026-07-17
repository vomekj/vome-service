import type { SecondaryStorage } from '@better-auth/core/db'
import type { CacheStore } from './index'

/** Better Auth secondaryStorage（TTL 为秒，内部转毫秒） */
export function createSecondaryStorage(cache: CacheStore): SecondaryStorage {
  return {
    get: (key) => cache.get(key),
    set: (key, value, ttl) => {
      if (ttl != null && ttl > 0) {
        return cache.set(key, value, ttl * 1000)
      }
      return cache.set(key, value)
    },
    delete: (key) => cache.del(key),
  }
}
