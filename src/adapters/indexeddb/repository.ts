import type { CompanionRepository } from '../../core/application/ports.ts'
import { META_STORE, openCompanionDatabase } from './database.ts'
import { mapActiveCompanion } from './mapper.ts'

const ACTIVE_COMPANION_KEY = 'active-companion'

export function createIndexedDbCompanionRepository(): CompanionRepository {
  return {
    async hydrateActive() {
      const database = await openCompanionDatabase()

      try {
        const transaction = database.transaction(META_STORE, 'readonly')
        const request = transaction.objectStore(META_STORE).get(ACTIVE_COMPANION_KEY)
        const value = await new Promise<unknown>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        return mapActiveCompanion(value)
      } finally {
        database.close()
      }
    },
  }
}
