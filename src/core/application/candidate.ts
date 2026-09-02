import type { BundleActivationRepository, EntryRepositoryFactory, AssetRepositoryFactory } from './ports.ts'
import type { CharacterAssetInspection, ResolvedCharacterLayer } from '../domain/character.ts'
import type { SceneAssetInspection } from '../domain/scene.ts'
import type { ExperienceCandidatePreviewSnapshot } from '../domain/starter.ts'
import { loadCharacterProjection } from './character-creation.ts'
import { loadSceneProjection } from './scene.ts'
import { loadStage } from './stage.ts'

export type StagedCandidatePreview =
  | ExperienceCandidatePreviewSnapshot
  | {
      source: 'import'
      bundleId: string
      name: string
      entryCount: number
      assetCount: number
    }
  | {
      source: 'character'
      draftId: string
      name: string
      appearanceCount: number
      layers: Array<ResolvedCharacterLayer & { blob: Blob }>
    }

export const approveCandidate = (
  bundles: BundleActivationRepository,
  bundleId: string,
  approved: true,
) => bundles.activate(bundleId, approved)

export async function loadPendingCandidatePreview(
  bundles: BundleActivationRepository,
  entriesFor: EntryRepositoryFactory,
  assetsFor: AssetRepositoryFactory,
  inspectCharacter: (blob: Blob) => Promise<CharacterAssetInspection>,
  inspectScene: (blob: Blob) => Promise<SceneAssetInspection>,
): Promise<StagedCandidatePreview | null> {
  const pending = await bundles.getPendingReview()
  if (!pending) return null
  const { record } = pending.bundle
  if (!record.metadata) throw new Error('Pending review metadata is missing')
  const entries = entriesFor(record.id)
  if (pending.source === 'import') return {
    source: 'import',
    bundleId: record.id,
    name: record.metadata.name,
    entryCount: (await entries.readPublished()).length,
    assetCount: (await assetsFor(record.id).list()).length,
  }
  if (record.identity.contractVersion !== 2) throw new Error('Pending experience identity is incompatible')
  const draftId = pending.draftId ?? (await entriesFor('companion-authoring').readPublished({ collection: 'experience-drafts' }))
    .find(({ data }) => (data.lastSubmission as { bundleId?: unknown } | undefined)?.bundleId === record.id)?.id ?? 'current'
  const stage = await loadStage(entries, record.metadata.runId)
  const stages = await entries.readPublished({ collection: 'stages' })
  const characterLayers = await loadCharacterProjection(
    entries,
    assetsFor,
    record.id,
    inspectCharacter,
    stage.scene?.characterStateId,
  )
  if (!characterLayers) throw new Error('Pending experience character is missing')
  const starter = record.metadata.starter
  return {
    source: 'experience',
    draftId,
    bundleId: record.id,
    name: record.metadata.name,
    story: starter ? {
      starter: { id: starter.id, version: starter.version, name: starter.name ?? starter.id },
      direction: { id: starter.directionId, name: starter.directionName ?? starter.directionId },
    } : null,
    seed: starter?.seed ?? {
      kind: 'story',
      directionId: record.identity.templateId,
      loopIds: structuredClone(record.identity.loopIds),
      completionMode: record.identity.completionMode,
      brief: '',
    },
    stageCount: stages.length,
    initialTitle: stage.title,
    initialNarrative: stage.narrative,
    agentFallbackCount: stages.filter(({ data }) => data.agentFallback === true).length,
    characterLayers,
    sceneLayers: stage.scene?.compositionId
      ? await loadSceneProjection(entries, assetsFor, record.id, stage.scene.compositionId, inspectScene)
      : [],
  }
}
