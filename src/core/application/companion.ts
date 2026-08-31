import type { ActiveCompanion } from '../domain/companion.ts'
import type { StageProjection } from '../domain/companion.ts'
import type { AgentCapability, BundleActivationRepository, EntryRepositoryFactory } from './ports.ts'
import { loadStage } from './stage.ts'
import type { ResolvedCharacterLayer } from '../domain/character.ts'
import type { ResolvedSceneLayer } from '../domain/scene.ts'

export type CompanionStartup =
  | { status: 'start'; webmcpAvailable: boolean; savedCompanions: SavedCompanion[] }
  | { status: 'main'; companion: ActiveCompanion; bundleId: string; runId: string; stage: StageProjection; dialogue?: string; pendingTurns: number; webmcpAvailable: boolean; character?: Array<ResolvedCharacterLayer & { blob: Blob }>; scene?: Array<ResolvedSceneLayer & { blob: Blob }>; savedCompanions: SavedCompanion[] }

export interface SavedCompanion {
  bundleId: string
  name: string
  createdAt: number
  active: boolean
}

export async function loadCompanionStartup(
  agent: AgentCapability,
  bundles: BundleActivationRepository,
  entriesFor: EntryRepositoryFactory,
): Promise<CompanionStartup> {
  const webmcpAvailable = agent.isAvailable()
  const active = await bundles.getActive()
  const savedCompanions = (await bundles.listSaved()).map((record) => ({
    bundleId: record.id,
    name: record.metadata!.name,
    createdAt: record.createdAt,
    active: record.id === active?.record.id,
  }))
  if (!active?.record.metadata) return { status: 'start', webmcpAvailable, savedCompanions }
  const { name, runId } = active.record.metadata
  const entries = entriesFor(active.record.id)
  const run = await entries.readById(runId)
  if (!run) throw new Error(`Run not found: ${runId}`)
  const pendingTurns = (await entries.readPublished({ collection: 'pending-agent-turns' }))
    .filter(({ data }) => data.runId === runId && data.status === 'pending').length
  return {
    status: 'main',
    companion: { id: active.record.id, name },
    bundleId: active.record.id,
    runId,
    stage: await loadStage(entries, runId),
    ...(typeof run.data.currentDialogue === 'string' ? { dialogue: run.data.currentDialogue } : {}),
    pendingTurns,
    webmcpAvailable,
    savedCompanions,
  }
}
