import type { EntryReader } from '@aotter/mantle-runtime'

import {
  CHARACTER_RIG,
  CHARACTER_VARIANT_GROUPS,
  CHARACTER_VARIANT_LAYERS,
  resolveCharacterComposition,
  validateCharacterPack,
  type AppearanceRef,
  type CharacterAssetTarget,
  type CharacterAssetInspection,
  type CharacterDraft,
  type CharacterDraftAsset,
  type CharacterDraftVariant,
  type CharacterPack,
  type ResolvedCharacterLayer,
  type CharacterVariantGroup,
  type CharacterVariantLayer,
} from '../domain/character.ts'
import { assembleAuthoredCandidate, createDefaultCustomizationSeed, stageAuthoredCandidate } from './authoring.ts'
import type { StagedCandidatePreview } from './candidate.ts'
import type {
  AssetRepositoryFactory,
  BundleActivationRepository,
  CharacterDraftRepository,
  EntryRepositoryFactory,
} from './ports.ts'

export const CHARACTER_CREATION_GROUPS: ReadonlyArray<{
  group: CharacterVariantGroup
  layers: readonly CharacterVariantLayer[]
  addable: boolean
}> = [
  { group: 'body', layers: ['body'], addable: false },
  { group: 'expression', layers: ['head'], addable: true },
  { group: 'outfit', layers: ['body'], addable: true },
  { group: 'headwear', layers: ['back', 'front'], addable: true },
  { group: 'prop', layers: ['back', 'front'], addable: true },
]

export const REQUIRED_CHARACTER_TARGETS = [
  { group: 'body', variantId: 'base', layer: 'body' },
  { group: 'expression', variantId: 'neutral', layer: 'head' },
] as const

const MAX_ASSET_BYTES = 5 * 1024 * 1024
const variantIdPattern = /^[a-z0-9][a-z0-9_-]{0,39}$/
const initialVariants = (): CharacterDraftVariant[] => [
  { group: 'body', id: 'base', label: 'Base body', layers: {} },
  { group: 'expression', id: 'neutral', label: 'Neutral', layers: {} },
  { group: 'expression', id: 'happy', label: 'Happy', layers: {} },
  { group: 'expression', id: 'sad', label: 'Sad', layers: {} },
  { group: 'expression', id: 'angry', label: 'Angry', layers: {} },
  { group: 'expression', id: 'surprised', label: 'Surprised', layers: {} },
  { group: 'expression', id: 'sleepy', label: 'Sleepy', layers: {} },
  { group: 'outfit', id: 'outfit-1', label: 'Outfit 1', layers: {} },
  { group: 'headwear', id: 'headwear-1', label: 'Headwear 1', layers: {} },
  { group: 'prop', id: 'prop-1', label: 'Prop 1', layers: {} },
]

export const createCharacterDraft = (packId = `character-${crypto.randomUUID()}`): CharacterDraft => ({
  id: 'current',
  schemaVersion: 2,
  packId,
  name: 'My Companion',
  variants: initialVariants(),
  selected: { expression: 'neutral' },
  updatedAt: Date.now(),
})

type LegacyRole = 'body-base' | 'head-neutral' | 'head-happy' | 'body-outfit' | 'prop-back' | 'prop-front'
type LegacyCharacterDraft = Omit<CharacterDraft, 'schemaVersion' | 'variants' | 'selected'> & {
  assets: Partial<Record<LegacyRole, CharacterDraftAsset>>
  selectedBody: 'body-base' | 'body-outfit'
  selectedExpression: 'head-neutral' | 'head-happy'
}

export function migrateCharacterDraft(draft: CharacterDraft | LegacyCharacterDraft): CharacterDraft {
  if ('schemaVersion' in draft && draft.schemaVersion === 2) return draft
  const legacy = draft as LegacyCharacterDraft
  const next: CharacterDraft = {
    ...createCharacterDraft(legacy.packId),
    name: legacy.name,
    updatedAt: legacy.updatedAt,
    selected: {
      expression: legacy.selectedExpression === 'head-happy' ? 'happy' : 'neutral',
      ...(legacy.selectedBody === 'body-outfit' ? { outfit: 'outfit-1' } : {}),
      ...((legacy.assets['prop-back'] || legacy.assets['prop-front']) ? { prop: 'prop-1' } : {}),
    },
  }
  const copy = (group: CharacterVariantGroup, id: string, layer: CharacterVariantLayer, asset?: CharacterDraftAsset) => {
    if (asset) next.variants.find((variant) => variant.group === group && variant.id === id)!.layers[layer] = asset
  }
  copy('body', 'base', 'body', legacy.assets['body-base'])
  copy('expression', 'neutral', 'head', legacy.assets['head-neutral'])
  copy('expression', 'happy', 'head', legacy.assets['head-happy'])
  copy('outfit', 'outfit-1', 'body', legacy.assets['body-outfit'])
  copy('prop', 'prop-1', 'back', legacy.assets['prop-back'])
  copy('prop', 'prop-1', 'front', legacy.assets['prop-front'])
  return next
}

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
  target: CharacterAssetTarget,
  blob: Blob,
  filename: string,
  source: 'user' | 'agent',
) {
  if (
    !CHARACTER_VARIANT_GROUPS.includes(target.group) ||
    (target.group === 'body' && target.variantId !== 'base') ||
    !(CHARACTER_VARIANT_LAYERS[target.group] as readonly string[]).includes(target.layer) ||
    !variantIdPattern.test(target.variantId) ||
    !target.label.trim() || target.label.trim().length > 80
  ) throw new Error('Unknown character asset target')
  const inspection = await inspect(blob)
  validateCharacterAssetInspection(inspection)
  const asset = { blob, filename, source, inspection }
  const existing = draft.variants.find((variant) => variant.group === target.group && variant.id === target.variantId)
  const next: CharacterDraft = {
    ...draft,
    variants: existing
      ? draft.variants.map((variant) => variant === existing ? { ...variant, layers: { ...variant.layers, [target.layer]: asset } } : variant)
      : [...draft.variants, { group: target.group, id: target.variantId, label: target.label.trim(), layers: { [target.layer]: asset } }],
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

const variantKey = ({ group, id }: Pick<CharacterDraftVariant, 'group' | 'id'>) => `${group}-${id}`
const assetKey = (variant: Pick<CharacterDraftVariant, 'group' | 'id'>, layer: CharacterVariantLayer) => `${variantKey(variant)}-${layer}`
const findVariant = (draft: CharacterDraft, group: CharacterVariantGroup, id: string) => draft.variants.find((variant) => variant.group === group && variant.id === id)
const hasLayer = (draft: CharacterDraft, group: CharacterVariantGroup, id: string, layer: CharacterVariantLayer) => Boolean(findVariant(draft, group, id)?.layers[layer])

const selectedVariants = (draft: CharacterDraft) => {
  const outfit = draft.selected.outfit && hasLayer(draft, 'outfit', draft.selected.outfit, 'body')
    ? findVariant(draft, 'outfit', draft.selected.outfit) : undefined
  const expression = hasLayer(draft, 'expression', draft.selected.expression, 'head')
    ? findVariant(draft, 'expression', draft.selected.expression) : findVariant(draft, 'expression', 'neutral')
  const headwear = draft.selected.headwear ? findVariant(draft, 'headwear', draft.selected.headwear) : undefined
  const prop = draft.selected.prop ? findVariant(draft, 'prop', draft.selected.prop) : undefined
  return [outfit ?? findVariant(draft, 'body', 'base'), expression, headwear, prop]
    .filter((variant): variant is CharacterDraftVariant => Boolean(variant && Object.keys(variant.layers).length))
}

const renderPlacement = (group: CharacterVariantGroup, layer: CharacterVariantLayer) => {
  if (group === 'body' || group === 'outfit') return { slot: 'character-skin', order: 1 }
  if (group === 'expression') return { slot: 'expression-head', order: 1 }
  if (layer === 'back') return { slot: 'item-back', order: group === 'headwear' ? 2 : 1 }
  return { slot: 'item-front', order: group === 'headwear' ? 1 : 2 }
}

export function resolveCharacterDraftLayers(draft: CharacterDraft): Array<ResolvedCharacterLayer & { blob: Blob }> {
  const slotOrders = new Map<string, number>(CHARACTER_RIG.slots.map(({ id, order }) => [id, order]))
  return selectedVariants(draft).flatMap((variant) => Object.entries(variant.layers).map(([layer, asset]) => {
    const placement = renderPlacement(variant.group, layer as CharacterVariantLayer)
    return {
      id: assetKey(variant, layer as CharacterVariantLayer),
      blobId: assetKey(variant, layer as CharacterVariantLayer),
      slot: placement.slot,
      slotOrder: slotOrders.get(placement.slot)!,
      layerOrder: placement.order,
      blob: asset!.blob,
    }
  })).sort((left, right) => left.slotOrder - right.slotOrder || left.layerOrder - right.layerOrder || left.id.localeCompare(right.id))
}

export function buildCharacterPack(draft: CharacterDraft): CharacterPack {
  if (!draft.name.trim()) throw new Error('Companion name is required')
  if (!hasLayer(draft, 'body', 'base', 'body') || !hasLayer(draft, 'expression', 'neutral', 'head')) throw new Error('Base body and neutral head are required')
  const keys = new Set<string>()
  for (const variant of draft.variants) {
    if (
      !CHARACTER_VARIANT_GROUPS.includes(variant.group) || !variantIdPattern.test(variant.id) ||
      keys.has(variantKey(variant)) || !variant.label.trim() || variant.label.length > 80 ||
      Object.keys(variant.layers).some((layer) => !(CHARACTER_VARIANT_LAYERS[variant.group] as readonly string[]).includes(layer))
    ) throw new Error('Invalid character variant')
    keys.add(variantKey(variant))
  }
  const pack: CharacterPack = {
    id: draft.packId,
    version: 1,
    rigProfile: { id: CHARACTER_RIG.id, version: CHARACTER_RIG.version },
    creator: { name: 'Local user' },
    license: { id: 'private-use', embedding: 'allowed' },
    assets: draft.variants.flatMap((variant) => Object.entries(variant.layers).map(([layer, asset]) => ({
      id: assetKey(variant, layer as CharacterVariantLayer),
      blobId: assetKey(variant, layer as CharacterVariantLayer),
      mediaType: 'image/png' as const,
      size: asset!.inspection.size,
      sha256: asset!.inspection.sha256,
    }))),
    appearances: draft.variants.flatMap((variant) => {
      const layers = Object.keys(variant.layers).map((layer) => {
        const placement = renderPlacement(variant.group, layer as CharacterVariantLayer)
        return {
          asset: { packId: draft.packId, packVersion: 1, assetId: assetKey(variant, layer as CharacterVariantLayer) },
          ...placement,
        }
      })
      return layers.length ? [{ id: variantKey(variant), layers }] : []
    }),
    defaultComposition: [],
  }
  pack.defaultComposition = selectedVariants(draft).map((variant) => ref(pack, variantKey(variant)))
  validateCharacterPack(pack, new Map(draft.variants.flatMap((variant) => Object.entries(variant.layers).map(([layer, asset]) => [
    assetKey(variant, layer as CharacterVariantLayer), asset!.inspection,
  ] as const))))
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
  for (const variant of draft.variants) {
    for (const [layer, asset] of Object.entries(variant.layers)) {
      await assets.put(assetKey(variant, layer as CharacterVariantLayer), asset!.blob)
    }
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
