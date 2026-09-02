import type { PendingCandidateReview } from '../../core/application/ports.ts'
import type { Entry } from '@aotter/mantle-spec'

import type { BundleRecord } from '../../core/bundle.ts'
import { validateBundle } from '../../core/bundle.ts'
import {
  ASSET_STORE,
  BUNDLE_STORE,
  ENTRY_STORE,
  META_STORE,
  openCompanionDatabase,
  type StoredAsset,
  type StoredEntry,
} from './database.ts'

export const PENDING_REVIEW_KEY = 'pending-review'

export type PendingReviewPointer = Omit<PendingCandidateReview, 'bundle'> & { bundleId: string }

export const encodePendingReview = (pointer: PendingReviewPointer) => JSON.stringify(pointer)

export const decodePendingReview = (value: string | undefined): PendingReviewPointer | null => {
  if (!value) return null
  const pointer = JSON.parse(value) as Partial<PendingReviewPointer>
  if (
    typeof pointer.bundleId !== 'string' ||
    (pointer.draftId !== undefined && typeof pointer.draftId !== 'string') ||
    (pointer.source !== 'experience' && pointer.source !== 'import') ||
    !Number.isSafeInteger(pointer.createdAt) || pointer.createdAt! < 0
  ) throw new Error('Invalid pending review pointer')
  return pointer as PendingReviewPointer
}

export async function persistImportedCandidate(
  record: BundleRecord,
  entries: readonly Entry[],
  assets: ReadonlyMap<string, Blob>,
): Promise<void> {
  validateBundle(record)
  const database = await openCompanionDatabase()
  const transaction = database.transaction([META_STORE, BUNDLE_STORE, ENTRY_STORE, ASSET_STORE], 'readwrite')
  const meta = transaction.objectStore(META_STORE)
  if (decodePendingReview(await meta.get(PENDING_REVIEW_KEY))) {
    await transaction.done
    throw new Error('Review or discard the pending candidate before importing another')
  }
  const entryStore = transaction.objectStore(ENTRY_STORE)
  const assetStore = transaction.objectStore(ASSET_STORE)
  await transaction.objectStore(BUNDLE_STORE).add(structuredClone(record))
  for (const entry of entries) {
    const stored: StoredEntry = { ...structuredClone(entry), bundleId: record.id, authorId: null }
    await entryStore.add(stored)
  }
  for (const [id, blob] of assets) {
    const stored: StoredAsset = { bundleId: record.id, id, blob }
    await assetStore.add(stored)
  }
  const [storedRecord, storedEntries, storedAssets] = await Promise.all([
    transaction.objectStore(BUNDLE_STORE).get(record.id),
    entryStore.index('bundleId').getAll(record.id),
    assetStore.index('bundleId').getAll(record.id),
  ])
  if (!storedRecord || storedEntries.length !== entries.length || storedAssets.length !== assets.size) {
    transaction.abort()
    await transaction.done.catch(() => undefined)
    throw new Error('Imported candidate read-back failed')
  }
  await meta.put(encodePendingReview({ bundleId: record.id, source: 'import', createdAt: record.createdAt }), PENDING_REVIEW_KEY)
  await transaction.done
}
