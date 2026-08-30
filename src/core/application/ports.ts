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
}

export interface ActionCommit {
  run: Entry
  event: Entry
  replayed: boolean
}

export interface ActionRepository {
  commit(input: CommitActionInput): Promise<ActionCommit>
}
