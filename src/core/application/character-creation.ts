import type { EntryReader } from '@aotter/mantle-runtime'

import {
  CHARACTER_CREATION_ROLES,
  CHARACTER_RIG,
  resolveCharacterComposition,
  validateCharacterPack,
  type AppearanceRef,
  type CharacterAssetInspection,
  type CharacterCreationRole,
  type CharacterDraft,
  type CharacterPack,
  type ResolvedCharacterLayer,
} from '../domain/character.ts'
import { assembleAuthoredCandidate, createDefaultCustomizationSeed, stageAuthoredCandidate } from './authoring.ts'
import type { StagedCandidatePreview } from './candidate.ts'
import type {
  AssetRepositoryFactory,
  BundleActivationRepository,
  CharacterDraftRepository,
  EntryRepositoryFactory,
} from './ports.ts'

export const CHARACTER_CREATION_SLOTS: ReadonlyArray<{
  role: CharacterCreationRole
  required: boolean
  output: 'full-body' | 'whole-head' | 'prop-layer'
}> = [
  { role: 'body-base', required: true, output: 'full-body' },
  { role: 'head-neutral', required: true, output: 'whole-head' },
  { role: 'head-happy', required: false, output: 'whole-head' },
  { role: 'body-outfit', required: false, output: 'full-body' },
  { role: 'prop-back', required: false, output: 'prop-layer' },
  { role: 'prop-front', required: false, output: 'prop-layer' },
]

const MAX_ASSET_BYTES = 5 * 1024 * 1024

export const createCharacterDraft = (packId = `character-${crypto.randomUUID()}`): CharacterDraft => ({
  id: 'current',
  packId,
  name: 'My Companion',
  assets: {},
  selectedBody: 'body-base',
  selectedExpression: 'head-neutral',
  updatedAt: Date.now(),
})

export function validateCharacterAssetInspection(inspection: CharacterAssetInspection) {
  if (
    inspection.width !== CHARACTER_RIG.canvas.width ||
    inspection.height !== CHARACTER_RIG.canvas.height ||
    !inspection.genuineRgba ||
    !inspection.hasTransparentPixels ||
    !inspection.hasVisiblePixels ||
    inspection.size < 1 || inspection.size > MAX_ASSET_BYTES
  ) throw new Error('Asset must be a visible, transparent 512×768 RGBA PNG under 5 MiB')
}

export async function saveCharacterDraftAsset(
  drafts: CharacterDraftRepository,
  inspect: (blob: Blob) => Promise<CharacterAssetInspection>,
  draft: CharacterDraft,
  role: CharacterCreationRole,
  blob: Blob,
  filename: string,
  source: 'user' | 'agent',
) {
  if (!CHARACTER_CREATION_ROLES.includes(role)) throw new Error('Unknown character asset role')
  const inspection = await inspect(blob)
  validateCharacterAssetInspection(inspection)
  const next: CharacterDraft = {
    ...draft,
    assets: { ...draft.assets, [role]: { blob, filename, source, inspection } },
    updatedAt: Date.now(),
  }
  await drafts.put(next)
  return next
}

const ref = (pack: CharacterPack, appearanceId: string): AppearanceRef => ({
  packId: pack.id,
  packVersion: pack.version,
  appearanceId,
})

export function buildCharacterPack(draft: CharacterDraft): CharacterPack {
  if (!draft.name.trim()) throw new Error('Companion name is required')
  if (!draft.assets['body-base'] || !draft.assets['head-neutral']) throw new Error('Base body and neutral head are required')
  const selectedBody = draft.assets[draft.selectedBody] ? draft.selectedBody : 'body-base'
  const selectedExpression = draft.assets[draft.selectedExpression] ? draft.selectedExpression : 'head-neutral'
  const pack: CharacterPack = {
    id: draft.packId,
    version: 1,
    rigProfile: { id: CHARACTER_RIG.id, version: CHARACTER_RIG.version },
    creator: { name: 'Local user' },
    license: { id: 'private-use', embedding: 'allowed' },
    assets: CHARACTER_CREATION_ROLES.flatMap((role) => {
      const asset = draft.assets[role]
      return asset ? [{ id: role, blobId: role, mediaType: 'image/png' as const, size: asset.inspection.size, sha256: asset.inspection.sha256 }] : []
    }),
    appearances: CHARACTER_CREATION_ROLES.flatMap((role) => {
      if (!draft.assets[role]) return []
      if (role === 'prop-back' || role === 'prop-front') return []
      return [{
        id: role,
        layers: [{
          asset: { packId: draft.packId, packVersion: 1, assetId: role },
          slot: role.startsWith('body-') ? 'character-skin' : 'expression-head',
          order: 1,
        }],
      }]
    }),
    defaultComposition: [],
  }
  const propLayers = (['prop-back', 'prop-front'] as const).flatMap((role) => draft.assets[role] ? [{
    asset: { packId: draft.packId, packVersion: 1, assetId: role },
    slot: role === 'prop-back' ? 'item-back' : 'item-front',
    order: 1,
  }] : [])
  if (propLayers.length) pack.appearances.push({ id: 'prop', layers: propLayers })
  pack.defaultComposition = [ref(pack, selectedBody), ref(pack, selectedExpression), ...(propLayers.length ? [ref(pack, 'prop')] : [])]
  validateCharacterPack(pack, new Map(CHARACTER_CREATION_ROLES.flatMap((role) => {
    const asset = draft.assets[role]
    return asset ? [[role, asset.inspection] as const] : []
  })))
  return pack
}

export async function stageCharacterDraft(
  bundles: BundleActivationRepository,
  entriesFor: EntryRepositoryFactory,
  assetsFor: AssetRepositoryFactory,
  inspect: (blob: Blob) => Promise<CharacterAssetInspection>,
  draft: CharacterDraft,
): Promise<StagedCandidatePreview> {
  const pack = buildCharacterPack(draft)
  const customization = createDefaultCustomizationSeed()
  customization.id = draft.packId
  customization.name = draft.name.trim()
  const candidate = assembleAuthoredCandidate(`bundle:${crypto.randomUUID()}`, customization)
  candidate.entries.push(
    { id: `pack:${pack.id}`, collection: 'character-packs', data: { pack } },
    { id: `character:${pack.id}`, collection: 'character-states', data: { packId: pack.id, packVersion: pack.version, composition: pack.defaultComposition } },
  )
  await stageAuthoredCandidate(bundles, entriesFor, candidate)
  const assets = assetsFor(candidate.record.id)
  for (const role of CHARACTER_CREATION_ROLES) {
    const asset = draft.assets[role]
    if (asset) await assets.put(role, asset.blob)
  }
  const storedInspections = new Map<string, CharacterAssetInspection>()
  for (const asset of pack.assets) {
    const blob = await assets.get(asset.blobId)
    if (!blob) throw new Error(`Character asset read-back failed: ${asset.id}`)
    storedInspections.set(asset.blobId, await inspect(blob))
  }
  const layers = validateCharacterPack(pack, storedInspections)
  return {
    source: 'character',
    bundleId: candidate.record.id,
    name: draft.name.trim(),
    appearanceCount: pack.appearances.length,
    layers: await Promise.all(layers.map(async (layer) => ({ ...layer, blob: (await assets.get(layer.blobId))! }))),
  }
}

export async function loadCharacterProjection(
  entries: EntryReader,
  assetsFor: AssetRepositoryFactory,
  bundleId: string,
  inspect: (blob: Blob) => Promise<CharacterAssetInspection>,
): Promise<Array<ResolvedCharacterLayer & { blob: Blob }> | undefined> {
  const packEntry = (await entries.readPublished({ collection: 'character-packs' }))
    .find(({ data }) => {
      const pack = data.pack as Partial<CharacterPack> | undefined
      return Boolean(pack?.rigProfile && Array.isArray(pack.assets) && Array.isArray(pack.appearances) && Array.isArray(pack.defaultComposition))
    })
  if (!packEntry) return undefined
  const pack = packEntry.data.pack as CharacterPack
  const state = (await entries.readPublished({ collection: 'character-states' }))
    .find(({ data }) => data.packId === pack.id && data.packVersion === pack.version)
  const assets = assetsFor(bundleId)
  const blobs = new Map<string, Blob>()
  const inspections = new Map<string, CharacterAssetInspection>()
  for (const asset of pack.assets ?? []) {
    const blob = await assets.get(asset.blobId)
    if (!blob) throw new Error(`Character asset is missing: ${asset.blobId}`)
    blobs.set(asset.blobId, blob)
    // ponytail: re-inspect local blobs on load; cache verified metadata if large packs make this measurable.
    inspections.set(asset.blobId, await inspect(blob))
  }
  validateCharacterPack(pack, inspections)
  const composition = (state?.data.composition as AppearanceRef[] | undefined) ?? pack.defaultComposition
  return resolveCharacterComposition(pack, composition).map((layer) => ({ ...layer, blob: blobs.get(layer.blobId)! }))
}
