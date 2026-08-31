import { resolveCharacterComposition, validateCharacterPack, type CharacterAssetInspection, type CharacterPack, type ResolvedCharacterLayer } from './character.ts'
import { resolveSceneComposition, validateSceneAsset, type ResolvedSceneLayer, type SceneAsset, type SceneAssetInspection, type SceneComposition } from './scene.ts'
import { PROGRESS_LOOP_IDS, type ProgressLoopId } from './playbook.ts'

export const EXPERIENCE_CONTRACT_VERSION = 2

export interface ExperienceSeed {
  kind: 'story' | 'task'
  directionId: string
  loopIds: ProgressLoopId[]
  completionMode: 'finite' | 'continuous'
  brief: string
}

export interface DirectionDefinition {
  id: string
  name: string
  summary: string
  seed: ExperienceSeed
  characterStateId: string
  sceneCompositionId: string
}

export interface PlaybookSkeleton {
  requiredStageIds: string[]
  requiredMetricIds: string[]
  instructions: string[]
}

export interface CharacterStateDefinition {
  id: string
  packId: string
  packVersion: number
  composition: CharacterPack['defaultComposition']
}

export interface ScenePack {
  id: string
  version: number
  assets: SceneAsset[]
  compositions: SceneComposition[]
}

export interface StarterPackage {
  schemaVersion: 1
  id: string
  version: number
  name: string
  description: string
  compatibility: {
    contractVersion: 2
    backboneVersion: string
  }
  assetFiles: Array<{
    blobId: string
    path: string
    mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
  }>
  characterPack: CharacterPack
  characterStates: CharacterStateDefinition[]
  scenePack: ScenePack
  directions: DirectionDefinition[]
  skeleton: PlaybookSkeleton
}

export interface LoadedStarterPackage {
  starter: StarterPackage
  assets: Array<{ id: string; blob: Blob }>
}

export interface ValidatedStarterPackage extends LoadedStarterPackage {
  manifestSha256: string
  sceneInspections: ReadonlyMap<string, SceneAssetInspection>
}

export interface ExperienceCandidatePreviewSnapshot {
  source: 'starter'
  bundleId: string
  name: string
  starter: { id: string; version: number; name: string }
  direction: { id: string; name: string }
  seed: ExperienceSeed
  stageCount: number
  initialTitle: string
  initialNarrative: string
  agentFallbackCount: number
  characterLayers: Array<ResolvedCharacterLayer & { blob: Blob }>
  sceneLayers: Array<ResolvedSceneLayer & { blob: Blob }>
}

export interface ExperienceDraft {
  id: string
  schemaVersion: 1
  revision: number
  starter: { id: string; version: number; name: string; manifestSha256: string }
  direction: DirectionDefinition
  seed: ExperienceSeed
  characterStateId: string
  sceneCompositionId: string
  createdAt: number
  updatedAt: number
  lastSubmission?: {
    idempotencyKey: string
    bundleId: string
  }
}

export type NewExperienceDraft = Omit<ExperienceDraft, 'id' | 'createdAt' | 'updatedAt' | 'lastSubmission'>

const idPattern = /^[a-z0-9][a-z0-9:_-]{0,99}$/

const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`)
  return value as Record<string, unknown>
}

const array = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}`)
  return value
}

const string = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${label}`)
  return value
}

const integer = (value: unknown, label: string) => {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(`Invalid ${label}`)
  return Number(value)
}

const unique = (values: readonly string[], label: string) => {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`)
}

const safeRelativePath = (path: string) => path.length <= 200 && !path.startsWith('/') && !path.includes('\\') && path.split('/').every((part) => part && part !== '.' && part !== '..')

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}

const sha256 = async (value: string) => Array.from(
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
  (byte) => byte.toString(16).padStart(2, '0'),
).join('')

export function parseStarterPackage(value: unknown): StarterPackage {
  const starter = object(value, 'Starter package')
  if (starter.schemaVersion !== 1) throw new Error('Unsupported Starter package schema')
  string(starter.id, 'Starter package ID')
  integer(starter.version, 'Starter package version')
  string(starter.name, 'Starter package name')
  string(starter.description, 'Starter package description')
  const compatibility = object(starter.compatibility, 'Starter compatibility')
  if (compatibility.contractVersion !== EXPERIENCE_CONTRACT_VERSION) throw new Error('Unsupported experience contract')
  string(compatibility.backboneVersion, 'Starter backbone version')

  for (const item of array(starter.assetFiles, 'Starter asset files')) {
    const file = object(item, 'Starter asset file')
    string(file.blobId, 'Starter blob ID')
    const path = string(file.path, 'Starter asset path')
    if (!safeRelativePath(path)) throw new Error(`Unsafe Starter asset path: ${path}`)
    if (file.mediaType !== 'image/png' && file.mediaType !== 'image/jpeg' && file.mediaType !== 'image/webp') throw new Error('Unsupported Starter asset media type')
  }

  const characterPack = object(starter.characterPack, 'Starter Character Pack')
  array(characterPack.assets, 'Character Pack assets')
  array(characterPack.appearances, 'Character Pack appearances')
  array(characterPack.defaultComposition, 'Character Pack default composition')
  for (const item of array(starter.characterStates, 'Starter character states')) {
    const state = object(item, 'Starter character state')
    string(state.id, 'character state ID')
    string(state.packId, 'character state pack ID')
    integer(state.packVersion, 'character state pack version')
    array(state.composition, 'character state composition')
  }

  const scenePack = object(starter.scenePack, 'Starter Scene Pack')
  string(scenePack.id, 'Scene Pack ID')
  integer(scenePack.version, 'Scene Pack version')
  array(scenePack.assets, 'Scene Pack assets')
  array(scenePack.compositions, 'Scene Pack compositions')

  for (const item of array(starter.directions, 'Starter directions')) {
    const direction = object(item, 'Starter direction')
    string(direction.id, 'Direction ID')
    string(direction.name, 'Direction name')
    string(direction.summary, 'Direction summary')
    string(direction.characterStateId, 'Direction character state')
    string(direction.sceneCompositionId, 'Direction scene composition')
    const seed = object(direction.seed, 'Experience Seed')
    string(seed.directionId, 'Experience Seed direction')
    string(seed.brief, 'Experience Seed brief')
    array(seed.loopIds, 'Experience Seed loops').forEach((id) => string(id, 'Progress Loop ID'))
  }

  const skeleton = object(starter.skeleton, 'Playbook skeleton')
  array(skeleton.requiredStageIds, 'required stage IDs').forEach((id) => string(id, 'required stage ID'))
  array(skeleton.requiredMetricIds, 'required metric IDs').forEach((id) => string(id, 'required metric ID'))
  array(skeleton.instructions, 'Playbook instructions').forEach((instruction) => string(instruction, 'Playbook instruction'))
  return structuredClone(value) as StarterPackage
}

export async function validateLoadedStarterPackage(
  loaded: LoadedStarterPackage,
  inspectCharacter: (blob: Blob) => Promise<CharacterAssetInspection>,
  inspectScene: (blob: Blob) => Promise<SceneAssetInspection>,
  expectedBackboneVersion: string,
): Promise<ValidatedStarterPackage> {
  const starter = parseStarterPackage(loaded.starter)
  if (!idPattern.test(starter.id) || starter.compatibility.backboneVersion !== expectedBackboneVersion) throw new Error('Incompatible Starter package')
  if (!starter.directions.length) throw new Error('Starter package requires a Direction')
  if (!starter.characterStates.length) throw new Error('Starter package requires a character state')
  if (!starter.scenePack.compositions.length) throw new Error('Starter package requires a scene composition')

  const files = new Map(starter.assetFiles.map((file) => [file.blobId, file]))
  const blobs = new Map(loaded.assets.map((asset) => [asset.id, asset.blob]))
  unique(starter.assetFiles.map(({ blobId }) => blobId), 'Starter blob ID')
  unique(starter.assetFiles.map(({ path }) => path), 'Starter asset path')
  unique(loaded.assets.map(({ id }) => id), 'loaded Starter blob ID')
  if (files.size !== blobs.size || [...files].some(([id]) => !blobs.has(id))) throw new Error('Starter asset set is incomplete')

  const characterInspections = new Map<string, CharacterAssetInspection>()
  for (const asset of starter.characterPack.assets) {
    const file = files.get(asset.blobId)
    const blob = blobs.get(asset.blobId)
    if (!file || !blob || file.mediaType !== 'image/png') throw new Error(`Character asset is missing: ${asset.blobId}`)
    characterInspections.set(asset.blobId, await inspectCharacter(blob))
  }
  validateCharacterPack(starter.characterPack, characterInspections)

  unique(starter.characterStates.map(({ id }) => id), 'character state ID')
  for (const state of starter.characterStates) {
    if (!idPattern.test(state.id) || state.packId !== starter.characterPack.id || state.packVersion !== starter.characterPack.version) throw new Error(`Invalid character state: ${state.id}`)
    resolveCharacterComposition(starter.characterPack, state.composition)
  }

  if (!idPattern.test(starter.scenePack.id) || !Number.isSafeInteger(starter.scenePack.version) || starter.scenePack.version < 1) throw new Error('Invalid Scene Pack identity')
  unique(starter.scenePack.assets.map(({ id }) => id), 'scene asset ID')
  unique(starter.scenePack.compositions.map(({ id }) => id), 'scene composition ID')
  const sceneInspections = new Map<string, SceneAssetInspection>()
  const sceneAssets = new Map(starter.scenePack.assets.map((asset) => [asset.id, asset]))
  for (const asset of starter.scenePack.assets) {
    const file = files.get(asset.blobId)
    const blob = blobs.get(asset.blobId)
    if (!file || !blob || file.mediaType !== asset.mediaType) throw new Error(`Scene asset is missing: ${asset.blobId}`)
    const inspection = await inspectScene(blob)
    validateSceneAsset(asset, inspection)
    sceneInspections.set(asset.blobId, inspection)
  }
  for (const composition of starter.scenePack.compositions) resolveSceneComposition(composition, sceneAssets, sceneInspections)

  const usedBlobs = new Set([
    ...starter.characterPack.assets.map(({ blobId }) => blobId),
    ...starter.scenePack.assets.map(({ blobId }) => blobId),
  ])
  if (usedBlobs.size !== files.size || [...files].some(([id]) => !usedBlobs.has(id))) throw new Error('Starter package contains an unused asset')

  const characterStates = new Set(starter.characterStates.map(({ id }) => id))
  const sceneCompositions = new Set(starter.scenePack.compositions.map(({ id }) => id))
  unique(starter.directions.map(({ id }) => id), 'Direction ID')
  for (const direction of starter.directions) {
    const { seed } = direction
    if (
      !idPattern.test(direction.id) || seed.directionId !== direction.id ||
      (seed.kind !== 'story' && seed.kind !== 'task') ||
      (seed.completionMode !== 'finite' && seed.completionMode !== 'continuous') ||
      !seed.loopIds.length || seed.loopIds.some((id) => !PROGRESS_LOOP_IDS.includes(id)) ||
      new Set(seed.loopIds).size !== seed.loopIds.length ||
      !characterStates.has(direction.characterStateId) || !sceneCompositions.has(direction.sceneCompositionId)
    ) throw new Error(`Invalid Direction: ${direction.id}`)
  }

  unique(starter.skeleton.requiredStageIds, 'required stage ID')
  unique(starter.skeleton.requiredMetricIds, 'required metric ID')
  if (
    !starter.skeleton.requiredStageIds.length || !starter.skeleton.instructions.length ||
    starter.skeleton.requiredStageIds.some((id) => !idPattern.test(id)) ||
    starter.skeleton.requiredMetricIds.some((id) => !idPattern.test(id))
  ) throw new Error('Invalid Playbook skeleton')

  return {
    starter,
    assets: structuredClone(loaded.assets),
    manifestSha256: await sha256(canonicalJson(starter)),
    sceneInspections,
  }
}

export function createExperienceDraftData(
  loaded: ValidatedStarterPackage,
  directionId: string,
): NewExperienceDraft {
  const direction = loaded.starter.directions.find((candidate) => candidate.id === directionId)
  if (!direction) throw new Error(`Direction not found: ${directionId}`)
  return {
    schemaVersion: 1,
    revision: 0,
    starter: {
      id: loaded.starter.id,
      version: loaded.starter.version,
      name: loaded.starter.name,
      manifestSha256: loaded.manifestSha256,
    },
    direction: structuredClone(direction),
    seed: structuredClone(direction.seed),
    characterStateId: direction.characterStateId,
    sceneCompositionId: direction.sceneCompositionId,
  }
}
