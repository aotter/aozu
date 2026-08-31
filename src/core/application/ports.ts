import type { Entry } from '@aotter/mantle-spec'
import type { EntryReader, EntryRepository } from '@aotter/mantle-runtime'
import type { BundleRecord, ValidatedBundle } from '../bundle.ts'
import type { CharacterDraft } from '../domain/character.ts'

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
  stageCandidate(record: BundleRecord): Promise<ValidatedBundle>
  activate(id: string, approved: true): Promise<ValidatedBundle>
  getActive(): Promise<ValidatedBundle | null>
  listSaved(): Promise<BundleRecord[]>
  deleteSaved(id: string): Promise<void>
}

export type EntryRepositoryFactory = (bundleId: string) => EntryRepository & EntryReader

export interface AssetRepository {
  put(id: string, blob: Blob): Promise<void>
  get(id: string): Promise<Blob | null>
  list(): Promise<Array<{ id: string; blob: Blob }>>
}

export type AssetRepositoryFactory = (bundleId: string) => AssetRepository

export interface CharacterDraftRepository {
  get(): Promise<CharacterDraft | null>
  put(draft: CharacterDraft): Promise<void>
  clear(): Promise<void>
}
