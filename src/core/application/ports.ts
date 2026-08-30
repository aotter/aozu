import type { ActiveCompanion } from '../domain/companion.ts'

export type AgentCapability = {
  isAvailable(): boolean
}

export type CompanionRepository = {
  hydrateActive(): Promise<ActiveCompanion | null>
}
