import type { ActiveCompanion } from '../domain/companion.ts'
import type { AgentCapability, CompanionRepository } from './ports.ts'

export type CompanionStartup =
  | { status: 'start'; webmcpAvailable: boolean }
  | { status: 'main'; companion: ActiveCompanion; webmcpAvailable: boolean }

export async function loadCompanionStartup(
  agent: AgentCapability,
  repository: CompanionRepository,
): Promise<CompanionStartup> {
  const webmcpAvailable = agent.isAvailable()
  const companion = await repository.hydrateActive()
  return companion
    ? { status: 'main', companion, webmcpAvailable }
    : { status: 'start', webmcpAvailable }
}
