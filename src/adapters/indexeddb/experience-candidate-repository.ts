import { AUTHORING_NAMESPACE, type AuthoredExperienceCandidate } from '../../core/application/authoring.ts'
import { validateBundle } from '../../core/bundle.ts'
import { requestPersistentStorage } from '../browser/storage-persistence.ts'
import {
  ASSET_STORE,
  BUNDLE_STORE,
  ENTRY_STORE,
  META_STORE,
  openCompanionDatabase,
  type StoredAsset,
  type StoredEntry,
} from './database.ts'
import { decodePendingReview, encodePendingReview, PENDING_REVIEW_KEY } from './candidate-review.ts'

export class ExperienceSubmissionConflict extends Error {
  readonly code: 'draft_not_found' | 'stale_revision' | 'character_draft_changed' | 'pending_review_exists'
  readonly currentRevision?: number

  constructor(
    code: 'draft_not_found' | 'stale_revision' | 'character_draft_changed' | 'pending_review_exists',
    currentRevision?: number,
  ) {
    super(code === 'draft_not_found'
      ? 'Experience Draft not found'
      : code === 'character_draft_changed' ? 'Character Draft changed after inspection'
      : code === 'pending_review_exists' ? 'Review or discard the pending candidate before submitting another'
      : 'Experience Draft revision is stale')
    this.name = 'ExperienceSubmissionConflict'
    this.code = code
    this.currentRevision = currentRevision
  }
}

/**
 * Atomic storage port for the trusted Mantle submit-experience-candidate
 * handler. Browser/UI/WebMCP code must enter through that Trigger and never
 * call this adapter directly.
 */
export async function persistTriggeredExperienceCandidate(
  draftId: string,
  expectedRevision: number,
  idempotencyKey: string,
  candidate: AuthoredExperienceCandidate,
): Promise<{ replayed: boolean; bundleId: string; revision: number }> {
  validateBundle(candidate.record)
  const database = await openCompanionDatabase()
  const transaction = database.transaction([META_STORE, BUNDLE_STORE, ENTRY_STORE, ASSET_STORE], 'readwrite')
  const entries = transaction.objectStore(ENTRY_STORE)
  const meta = transaction.objectStore(META_STORE)
  const draftKey = [AUTHORING_NAMESPACE, draftId] as [string, string]
  const [current, authoringEntries, pending] = await Promise.all([
    entries.get(draftKey),
    entries.index('bundleId').getAll(AUTHORING_NAMESPACE),
    meta.get(PENDING_REVIEW_KEY),
  ])
  const selected = authoringEntries
    .filter((entry) => entry.collection === 'experience-drafts' && entry.status === 'published')
    .sort((left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id))[0]
  if (!current || selected?.id !== current.id || current.collection !== 'experience-drafts' || current.status !== 'published') {
    await transaction.done
    throw new ExperienceSubmissionConflict('draft_not_found')
  }
  const revision = Number(current.data.revision)
  const prior = current.data.lastSubmission as { idempotencyKey?: unknown; bundleId?: unknown } | undefined
  if (prior?.idempotencyKey === idempotencyKey && typeof prior.bundleId === 'string') {
    await transaction.done
    return { replayed: true, bundleId: prior.bundleId, revision }
  }
  if (revision !== expectedRevision) {
    await transaction.done
    throw new ExperienceSubmissionConflict('stale_revision', revision)
  }
  if (decodePendingReview(pending)) {
    await transaction.done
    throw new ExperienceSubmissionConflict('pending_review_exists')
  }

  const nextRevision = revision + 1
  const updatedDraft: StoredEntry = {
    ...current,
    version: current.version + 1,
    updatedAt: Date.now(),
    data: {
      ...structuredClone(current.data),
      revision: nextRevision,
      lastSubmission: { idempotencyKey, bundleId: candidate.record.id },
    },
  }
  const writes: Promise<unknown>[] = [
    transaction.objectStore(BUNDLE_STORE).add(structuredClone(candidate.record)),
    entries.put(updatedDraft),
  ]
  for (const entry of candidate.entries) {
    const stored: StoredEntry = {
      bundleId: candidate.record.id,
      id: entry.id,
      collection: entry.collection,
      status: 'published',
      version: 1,
      data: structuredClone(entry.data),
      authorId: null,
      createdAt: candidate.record.createdAt,
      updatedAt: candidate.record.createdAt,
    }
    writes.push(entries.add(stored))
  }
  const assets = transaction.objectStore(ASSET_STORE)
  for (const asset of candidate.assets) {
    const stored: StoredAsset = { bundleId: candidate.record.id, id: asset.id, blob: asset.blob }
    writes.push(assets.add(stored))
  }
  await Promise.all(writes)
  const [storedRecord, storedEntries, storedAssets] = await Promise.all([
    transaction.objectStore(BUNDLE_STORE).get(candidate.record.id),
    entries.index('bundleId').getAll(candidate.record.id),
    assets.index('bundleId').getAll(candidate.record.id),
  ])
  if (!storedRecord || storedEntries.length !== candidate.entries.length || storedAssets.length !== candidate.assets.length) {
    transaction.abort()
    await transaction.done.catch(() => undefined)
    throw new Error('Candidate read-back failed')
  }
  await meta.put(encodePendingReview({
    bundleId: candidate.record.id,
    source: 'experience',
    createdAt: candidate.record.createdAt,
  }), PENDING_REVIEW_KEY)
  await transaction.done
  await requestPersistentStorage()
  return { replayed: false, bundleId: candidate.record.id, revision: nextRevision }
}
