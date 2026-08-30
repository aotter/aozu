import { ASSET_STORE, openCompanionDatabase, requestResult, transactionDone } from './database.ts'

export interface StoredAsset {
  bundleId: string
  id: string
  blob: Blob
}

export function createIndexedDbAssetRepository(bundleId: string) {
  return {
    async put(id: string, blob: Blob) {
      const database = await openCompanionDatabase()
      try {
        const transaction = database.transaction(ASSET_STORE, 'readwrite')
        transaction.objectStore(ASSET_STORE).add({ bundleId, id, blob })
        await transactionDone(transaction)
      } finally { database.close() }
    },
    async get(id: string): Promise<Blob | null> {
      const database = await openCompanionDatabase()
      try {
        const transaction = database.transaction(ASSET_STORE, 'readonly')
        const asset = await requestResult<StoredAsset | undefined>(transaction.objectStore(ASSET_STORE).get([bundleId, id]))
        return asset?.blob ?? null
      } finally { database.close() }
    },
    async list(): Promise<StoredAsset[]> {
      const database = await openCompanionDatabase()
      try {
        const transaction = database.transaction(ASSET_STORE, 'readonly')
        return requestResult(transaction.objectStore(ASSET_STORE).index('bundleId').getAll(bundleId))
      } finally { database.close() }
    },
  }
}
