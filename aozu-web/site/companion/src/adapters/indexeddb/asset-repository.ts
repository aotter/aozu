import { ASSET_STORE, openCompanionDatabase, type StoredAsset } from './database.ts'

export function createIndexedDbAssetRepository(bundleId: string) {
  return {
    async put(id: string, blob: Blob) {
      const database = await openCompanionDatabase()
      await database.add(ASSET_STORE, { bundleId, id, blob })
    },
    async get(id: string): Promise<Blob | null> {
      const database = await openCompanionDatabase()
      return (await database.get(ASSET_STORE, [bundleId, id]))?.blob ?? null
    },
    async list(): Promise<StoredAsset[]> {
      const database = await openCompanionDatabase()
      return database.getAllFromIndex(ASSET_STORE, 'bundleId', bundleId)
    },
  }
}
