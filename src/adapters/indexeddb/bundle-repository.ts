import type { BundleRecord, ValidatedBundle } from "../../core/bundle.ts"
import { validateBundle } from "../../core/bundle.ts"
import { requestPersistentStorage } from "../browser/storage-persistence.ts"
import {
  ASSET_STORE,
  BUNDLE_STORE,
  type CompanionDatabase,
  ENTRY_STORE,
  META_STORE,
  openCompanionDatabase,
} from "./database.ts"
import { decodePendingReview, PENDING_REVIEW_KEY } from './candidate-review.ts'

const ACTIVE_BUNDLE_KEY = "active-bundle-id"
const SAVED_BUNDLE_PREFIX = "saved-bundle:"

const readBundle = async (database: CompanionDatabase, id: string): Promise<BundleRecord | null> =>
  (await database.get(BUNDLE_STORE, id)) ?? null

export function createIndexedDbBundleRepository() {
  return {
    async activate(id: string, approved: true): Promise<ValidatedBundle> {
      if (approved !== true) throw new Error("Explicit approval required")
      const database = await openCompanionDatabase()
      const record = await readBundle(database, id)
      if (!record) throw new Error(`Bundle not found: ${id}`)
      const validated = validateBundle(record)
      const previousActiveId = await database.get(META_STORE, ACTIVE_BUNDLE_KEY)
      const transaction = database.transaction(META_STORE, "readwrite")
      const pending = decodePendingReview(await transaction.store.get(PENDING_REVIEW_KEY))
      await Promise.all([
        transaction.store.put(id, ACTIVE_BUNDLE_KEY),
        transaction.store.put(id, `${SAVED_BUNDLE_PREFIX}${id}`),
        ...(previousActiveId ? [transaction.store.put(previousActiveId, `${SAVED_BUNDLE_PREFIX}${previousActiveId}`)] : []),
        ...(pending?.bundleId === id ? [transaction.store.delete(PENDING_REVIEW_KEY)] : []),
        transaction.done,
      ])
      await requestPersistentStorage()
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

    async getPendingReview() {
      const database = await openCompanionDatabase()
      const pointer = decodePendingReview(await database.get(META_STORE, PENDING_REVIEW_KEY))
      if (!pointer) return null
      const record = await readBundle(database, pointer.bundleId)
      if (!record) throw new Error(`Pending review bundle missing: ${pointer.bundleId}`)
      return { bundle: validateBundle(record), source: pointer.source, createdAt: pointer.createdAt }
    },

    async listSaved(): Promise<BundleRecord[]> {
      const database = await openCompanionDatabase()
      const activeId = await database.get(META_STORE, ACTIVE_BUNDLE_KEY)
      const savedIds = (await database.getAllKeys(META_STORE))
        .filter((key) => key.startsWith(SAVED_BUNDLE_PREFIX))
        .map((key) => key.slice(SAVED_BUNDLE_PREFIX.length))
      if (activeId && !savedIds.includes(activeId)) savedIds.push(activeId)
      const records = await Promise.all(savedIds.map((id) => readBundle(database, id)))
      return records
        .filter((record): record is BundleRecord => Boolean(record?.metadata))
        .sort((left, right) => right.createdAt - left.createdAt)
    },

    async deleteSaved(id: string): Promise<void> {
      const database = await openCompanionDatabase()
      const transaction = database.transaction([META_STORE, BUNDLE_STORE, ENTRY_STORE, ASSET_STORE], 'readwrite')
      const meta = transaction.objectStore(META_STORE)
      const entries = transaction.objectStore(ENTRY_STORE)
      const assets = transaction.objectStore(ASSET_STORE)
      const [activeId, entryKeys, assetKeys] = await Promise.all([
        meta.get(ACTIVE_BUNDLE_KEY),
        entries.index('bundleId').getAllKeys(id),
        assets.index('bundleId').getAllKeys(id),
      ])
      await Promise.all([
        transaction.objectStore(BUNDLE_STORE).delete(id),
        meta.delete(`${SAVED_BUNDLE_PREFIX}${id}`),
        ...(activeId === id ? [meta.delete(ACTIVE_BUNDLE_KEY)] : []),
        ...entryKeys.map((key) => entries.delete(key)),
        ...assetKeys.map((key) => assets.delete(key)),
      ])
      await transaction.done
    },

    async discardPendingReview(id: string): Promise<void> {
      const database = await openCompanionDatabase()
      const transaction = database.transaction([META_STORE, BUNDLE_STORE, ENTRY_STORE, ASSET_STORE], 'readwrite')
      const meta = transaction.objectStore(META_STORE)
      const pending = decodePendingReview(await meta.get(PENDING_REVIEW_KEY))
      if (!pending || pending.bundleId !== id) {
        await transaction.done
        throw new Error(`Pending review not found: ${id}`)
      }
      const [activeId, savedId, entryKeys, assetKeys] = await Promise.all([
        meta.get(ACTIVE_BUNDLE_KEY),
        meta.get(`${SAVED_BUNDLE_PREFIX}${id}`),
        transaction.objectStore(ENTRY_STORE).index('bundleId').getAllKeys(id),
        transaction.objectStore(ASSET_STORE).index('bundleId').getAllKeys(id),
      ])
      if (activeId === id || savedId === id) {
        transaction.abort()
        await transaction.done.catch(() => undefined)
        throw new Error('Cannot discard an active or saved Companion')
      }
      await Promise.all([
        meta.delete(PENDING_REVIEW_KEY),
        transaction.objectStore(BUNDLE_STORE).delete(id),
        ...entryKeys.map((key) => transaction.objectStore(ENTRY_STORE).delete(key)),
        ...assetKeys.map((key) => transaction.objectStore(ASSET_STORE).delete(key)),
      ])
      await transaction.done
    },
  }
}
