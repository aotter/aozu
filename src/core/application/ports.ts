import type { Entry } from '@aotter/mantle-spec'
import type { EntryReader, EntryRepository } from '@aotter/mantle-runtime'
import type { BundleRecord, ValidatedBundle } from '../bundle.ts'
import type { AppearanceRef, CharacterDraft, CharacterPack } from '../domain/character.ts'

export type AgentCapability = {
  isAvailable(): boolean
}

export interface CommitActionInput {
  bundleId: string
  runId: string
  expectedRevision: number
  actionId: string
  idempotencyKey: string
  nextRunData: Record<string, unknown>
  eventData: Record<string, unknown>
  now: number
  resolveTurnId?: string
  resolutionDialogue?: string
  itemMutations?: Array<{
    id: string
    collection: 'inventory-items' | 'character-loadouts'
    expectedVersion: number | null
    data: Record<string, unknown> | null
  }>
}

export interface ActionCommit {
  run: Entry
  event: Entry
  replayed: boolean
}

export interface ActionRepository {
  commit(input: CommitActionInput): Promise<ActionCommit>
}

export interface PendingTurnRepository {
  create(input: {
    bundleId: string
    runId: string
    nodeId: string
    userText: string
    expectedRevision: number
    idempotencyKey: string
    now: number
  }): Promise<Entry>
}

export interface BundleActivationRepository {
  activate(id: string, approved: true): Promise<ValidatedBundle>
  getActive(): Promise<ValidatedBundle | null>
  getPendingReview(): Promise<PendingCandidateReview | null>
  listSaved(): Promise<BundleRecord[]>
  discardPendingReview(id: string): Promise<void>
  deleteSaved(id: string): Promise<void>
}

export interface PendingCandidateReview {
  bundle: ValidatedBundle
  source: 'experience' | 'import'
  draftId?: string
  createdAt: number
}

export type EntryRepositoryFactory = (bundleId: string) => EntryRepository & EntryReader

export interface AssetRepository {
  put(id: string, blob: Blob): Promise<void>
  get(id: string): Promise<Blob | null>
  list(): Promise<Array<{ id: string; blob: Blob }>>
  deleteAll?(): Promise<void>
}

export type AssetRepositoryFactory = (bundleId: string) => AssetRepository

export interface CharacterDraftRepository {
  list(): Promise<CharacterDraft[]>
  get(id: string): Promise<CharacterDraft | null>
  create(draft: CharacterDraft): Promise<CharacterDraft>
  put(draft: CharacterDraft): Promise<CharacterDraft>
  delete(id: string): Promise<void>
}

export interface CharacterPackLibraryRecord {
  name: string
  pack: CharacterPack
  composition: AppearanceRef[]
  assets: Array<{ id: string; blob: Blob }>
}

export interface CharacterPackLibraryRepository {
  install(record: CharacterPackLibraryRecord, now?: number): Promise<void>
  list(): Promise<CharacterPackLibraryRecord[]>
}
