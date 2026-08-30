import type { BundleRecord, ValidatedBundle } from "../../core/bundle.ts"
import { validateBundle } from "../../core/bundle.ts"
import {
  BUNDLE_STORE,
  META_STORE,
  openCompanionDatabase,
  requestResult,
  transactionDone,
} from "./database.ts"

const ACTIVE_BUNDLE_KEY = "active-bundle-id"

async function readBundle(database: IDBDatabase, id: string): Promise<BundleRecord | null> {
  const transaction = database.transaction(BUNDLE_STORE, "readonly")
  return (await requestResult(transaction.objectStore(BUNDLE_STORE).get(id))) ?? null
}

export function createIndexedDbBundleRepository() {
  return {
    async stageCandidate(record: BundleRecord): Promise<ValidatedBundle> {
      validateBundle(record)
      const database = await openCompanionDatabase()
      try {
        const write = database.transaction(BUNDLE_STORE, "readwrite")
        write.objectStore(BUNDLE_STORE).add(structuredClone(record))
        await transactionDone(write)
        const stored = await readBundle(database, record.id)
        if (!stored) throw new Error("Candidate read-back failed")
        try {
          return validateBundle(stored)
        } catch (error) {
          const cleanup = database.transaction(BUNDLE_STORE, "readwrite")
          cleanup.objectStore(BUNDLE_STORE).delete(record.id)
          await transactionDone(cleanup)
          throw error
        }
      } finally {
        database.close()
      }
    },

    async activate(id: string, approved: true): Promise<ValidatedBundle> {
      if (approved !== true) throw new Error("Explicit approval required")
      const database = await openCompanionDatabase()
      try {
        const record = await readBundle(database, id)
        if (!record) throw new Error(`Bundle not found: ${id}`)
        const validated = validateBundle(record)
        const transaction = database.transaction(META_STORE, "readwrite")
        transaction.objectStore(META_STORE).put(id, ACTIVE_BUNDLE_KEY)
        await transactionDone(transaction)
        return validated
      } finally {
        database.close()
      }
    },

    async getActive(): Promise<ValidatedBundle | null> {
      const database = await openCompanionDatabase()
      try {
        const transaction = database.transaction(META_STORE, "readonly")
        const id = await requestResult<string | undefined>(transaction.objectStore(META_STORE).get(ACTIVE_BUNDLE_KEY))
        if (!id) return null
        const record = await readBundle(database, id)
        if (!record) throw new Error(`Active bundle missing: ${id}`)
        return validateBundle(record)
      } finally {
        database.close()
      }
    },
  }
}
