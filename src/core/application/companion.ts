import type { ActiveCompanion } from '../domain/companion.ts'
import type { StageProjection } from '../domain/companion.ts'
import type { AgentCapability, BundleActivationRepository, EntryRepositoryFactory } from './ports.ts'
import { loadStage } from './stage.ts'

export type CompanionStartup =
  | { status: 'start'; webmcpAvailable: boolean }
  | { status: 'main'; companion: ActiveCompanion; bundleId: string; runId: string; stage: StageProjection; webmcpAvailable: boolean }

export async function loadCompanionStartup(
  agent: AgentCapability,
  bundles: BundleActivationRepository,
  entriesFor: EntryRepositoryFactory,
): Promise<CompanionStartup> {
  const webmcpAvailable = agent.isAvailable()
  const active = await bundles.getActive()
  if (!active?.record.metadata) return { status: 'start', webmcpAvailable }
  const { name, runId } = active.record.metadata
  return {
    status: 'main',
    companion: { id: active.record.id, name },
    bundleId: active.record.id,
    runId,
    stage: await loadStage(entriesFor(active.record.id), runId),
    webmcpAvailable,
  }
}
