import type { ActiveCompanion } from '../domain/companion.ts'
import type { Entry } from '@aotter/mantle-spec'

export type AgentCapability = {
  isAvailable(): boolean
}

export type CompanionRepository = {
  hydrateActive(): Promise<ActiveCompanion | null>
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
