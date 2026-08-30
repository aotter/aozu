import type { BundleRecord, ValidatedBundle } from "../../core/bundle.ts"
import { validateBundle } from "../../core/bundle.ts"
import {
  BUNDLE_STORE,
  type CompanionDatabase,
  META_STORE,
  openCompanionDatabase,
} from "./database.ts"

const ACTIVE_BUNDLE_KEY = "active-bundle-id"

const readBundle = async (database: CompanionDatabase, id: string): Promise<BundleRecord | null> =>
  (await database.get(BUNDLE_STORE, id)) ?? null

export function createIndexedDbBundleRepository() {
  return {
    async stageCandidate(record: BundleRecord): Promise<ValidatedBundle> {
      validateBundle(record)
      const database = await openCompanionDatabase()
      await database.add(BUNDLE_STORE, structuredClone(record))
      const stored = await readBundle(database, record.id)
      if (!stored) throw new Error("Candidate read-back failed")
      try {
        return validateBundle(stored)
      } catch (error) {
        await database.delete(BUNDLE_STORE, record.id)
        throw error
      }
    },

    async activate(id: string, approved: true): Promise<ValidatedBundle> {
      if (approved !== true) throw new Error("Explicit approval required")
      const database = await openCompanionDatabase()
      const record = await readBundle(database, id)
      if (!record) throw new Error(`Bundle not found: ${id}`)
      const validated = validateBundle(record)
      await database.put(META_STORE, id, ACTIVE_BUNDLE_KEY)
      return validated
    },

    async getActive(): Promise<ValidatedBundle | null> {
      const database = await openCompanionDatabase()
      const id = await database.get(META_STORE, ACTIVE_BUNDLE_KEY)
      if (!id) return null
      const record = await readBundle(database, id)
      if (!record) throw new Error(`Active bundle missing: ${id}`)
      return validateBundle(record)
    },
  }
}
