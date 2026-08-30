import type { Entry } from '@aotter/mantle-spec'
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type { BundleRecord } from '../../core/bundle.ts'
import type { CharacterDraft } from '../../core/domain/character.ts'

const DATABASE_NAME = 'companion'
const DATABASE_VERSION = 5

export const META_STORE = 'meta'
export const ENTRY_STORE = 'entries'
export const BUNDLE_STORE = 'bundles'
export const ASSET_STORE = 'assets'
export const CHARACTER_DRAFT_STORE = 'character-drafts'

export type StoredEntry = Entry & { bundleId: string; authorId: string | null }
export interface StoredAsset {
  bundleId: string
  id: string
  blob: Blob
}

export const toPublicEntry = (entry: StoredEntry): Entry => ({
  id: entry.id,
  collection: entry.collection,
  ...(typeof entry.data.locale === 'string' ? { locale: entry.data.locale } : {}),
  status: entry.status,
  version: entry.version,
  data: entry.data,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
})

interface CompanionDatabaseSchema extends DBSchema {
  [META_STORE]: { key: string; value: string }
  [ENTRY_STORE]: { key: [string, string]; value: StoredEntry; indexes: { bundleId: string } }
  [BUNDLE_STORE]: { key: string; value: BundleRecord }
  [ASSET_STORE]: { key: [string, string]; value: StoredAsset; indexes: { bundleId: string } }
  [CHARACTER_DRAFT_STORE]: { key: string; value: CharacterDraft }
}

export type CompanionDatabase = IDBPDatabase<CompanionDatabaseSchema>
let databasePromise: Promise<CompanionDatabase> | undefined

export function openCompanionDatabase(): Promise<CompanionDatabase> {
  databasePromise ??= openDB<CompanionDatabaseSchema>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE)
      if (!database.objectStoreNames.contains(ENTRY_STORE)) {
        const store = database.createObjectStore(ENTRY_STORE, { keyPath: ['bundleId', 'id'] })
        store.createIndex('bundleId', 'bundleId')
      }
      if (!database.objectStoreNames.contains(BUNDLE_STORE)) {
        database.createObjectStore(BUNDLE_STORE, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(ASSET_STORE)) {
        const store = database.createObjectStore(ASSET_STORE, { keyPath: ['bundleId', 'id'] })
        store.createIndex('bundleId', 'bundleId')
      }
      if (!database.objectStoreNames.contains(CHARACTER_DRAFT_STORE)) {
        database.createObjectStore(CHARACTER_DRAFT_STORE, { keyPath: 'id' })
      }
    },
    blocking() {
      void databasePromise?.then((database) => database.close())
      databasePromise = undefined
    },
    terminated() {
      databasePromise = undefined
    },
  }).catch((error: unknown) => {
    databasePromise = undefined
    throw error
  })
  return databasePromise
}
