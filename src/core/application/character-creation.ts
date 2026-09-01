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
import type { ValidatedStarterPackage } from '../domain/starter.ts'
import type { StagedCandidatePreview } from './candidate.ts'
import type {
  AssetRepositoryFactory,
  CharacterDraftRepository,
  CharacterPackLibraryRecord,
  CharacterPackLibraryRepository,
} from './ports.ts'

export const CHARACTER_CREATION_GROUPS: ReadonlyArray<{
  group: CharacterVariantGroup
  layers: readonly CharacterVariantLayer[]
  addable: boolean
}> = [
  { group: 'body', layers: ['body'], addable: false },
  { group: 'expression', layers: ['head'], addable: true },
  { group: 'outfit', layers: ['body'], addable: true },
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
  { group: 'prop', id: 'prop-1', label: 'Prop 1', layers: {} },
]

export const createCharacterDraft = (packId = `character-${crypto.randomUUID()}`): CharacterDraft => ({
  id: 'current',
  schemaVersion: 3,
  packId,
  name: 'My Companion',
  variants: initialVariants(),
  selected: { expression: 'neutral', props: [] },
  updatedAt: Date.now(),
})

export const isCharacterDraftPopulated = (draft: CharacterDraft) => draft.variants.some(({ layers }) => Object.keys(layers).length > 0)

const starterCharacter = (loaded: ValidatedStarterPackage, stateId: string) => {
  const state = loaded.starter.characterStates.find(({ id }) => id === stateId)
  if (!state) throw new Error(`Character state not found: ${stateId}`)
  const blobs = new Map(loaded.assets.map(({ id, blob }) => [id, blob]))
  return { state, blobs }
}

export function resolveStarterCharacterLayers(loaded: ValidatedStarterPackage, stateId: string) {
  const { state, blobs } = starterCharacter(loaded, stateId)
  return resolveCharacterComposition(loaded.starter.characterPack, state.composition).map((layer) => {
    const blob = blobs.get(layer.blobId)
    if (!blob) throw new Error(`Starter character asset is missing: ${layer.blobId}`)
    return { ...layer, blob }
  })
}

export function createCharacterDraftFromStarter(loaded: ValidatedStarterPackage, stateId: string): CharacterDraft {
  const { state, blobs } = starterCharacter(loaded, stateId)
  const pack = loaded.starter.characterPack
  const appearances = new Map(pack.appearances.map((appearance) => [appearance.id, appearance]))
  const assets = new Map(pack.assets.map((asset) => [asset.id, asset]))
  const files = new Map(loaded.starter.assetFiles.map((file) => [file.blobId, file]))
  const draft = createCharacterDraft()
  const propIds = new Map<string, string>()
  const usedPropIds = new Set<string>()
  const propId = (appearanceId: string) => {
    const existing = propIds.get(appearanceId)
    if (existing) return existing
    const base = appearanceId.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+/, '').slice(0, 40) || 'prop'
    let id = base
    let suffix = 2
    while (usedPropIds.has(id)) id = `${base.slice(0, 37)}-${suffix++}`
    usedPropIds.add(id)
    propIds.set(appearanceId, id)
    return id
  }
  const put = (group: CharacterVariantGroup, id: string, label: string, layer: CharacterVariantLayer, assetId: string) => {
    const definition = assets.get(assetId)
    const blob = definition && blobs.get(definition.blobId)
    const inspection = definition && loaded.characterInspections.get(definition.blobId)
    const file = definition && files.get(definition.blobId)
    if (!definition || !blob || !inspection || !file) throw new Error(`Starter character asset is missing: ${assetId}`)
    let variant = draft.variants.find((candidate) => candidate.group === group && candidate.id === id)
    if (!variant) {
      variant = { group, id, label, layers: {} }
      draft.variants.push(variant)
    }
    if (variant.layers[layer]) throw new Error(`Starter character layer cannot be edited: ${group}:${id}:${layer}`)
    variant.layers[layer] = {
      blob,
      filename: file.path.split('/').at(-1) ?? file.path,
      source: 'starter',
      inspection,
    }
  }
  for (const reference of state.composition) {
    const appearance = appearances.get(reference.appearanceId)
    if (!appearance) throw new Error(`Starter appearance not found: ${reference.appearanceId}`)
    for (const layer of appearance.layers) {
      if (layer.slot === 'character-skin') put('body', 'base', 'Base body', 'body', layer.asset.assetId)
      else if (layer.slot === 'expression-head') put('expression', 'neutral', 'Neutral', 'head', layer.asset.assetId)
      else if (layer.slot === 'item-back' || layer.slot === 'item-front') {
        const id = propId(appearance.id)
        put('prop', id, appearance.id, layer.slot === 'item-back' ? 'back' : 'front', layer.asset.assetId)
      }
    }
  }
  if (!isCharacterDraftPopulated(draft) || !draft.variants.find(({ group, id }) => group === 'body' && id === 'base')?.layers.body || !draft.variants.find(({ group, id }) => group === 'expression' && id === 'neutral')?.layers.head) {
    throw new Error('Starter character is not editable with the current rig')
  }
  const canonicalSha256 = draft.variants.find(({ group, id }) => group === 'body' && id === 'base')!.layers.body!.inspection.sha256
  for (const variant of draft.variants) {
    if (variant.group === 'body') continue
    for (const asset of Object.values(variant.layers)) if (asset) asset.canonicalSha256 = canonicalSha256
  }
  draft.selected.props = [...propIds.values()]
  return draft
}

type LegacyRole = 'body-base' | 'head-neutral' | 'head-happy' | 'body-outfit' | 'prop-back' | 'prop-front'
type CharacterDraftV2 = Omit<CharacterDraft, 'schemaVersion' | 'variants' | 'selected'> & {
  schemaVersion: 2
  variants: Array<Omit<CharacterDraftVariant, 'group'> & { group: CharacterVariantGroup | 'headwear' }>
  selected: { expression: string; outfit?: string; headwear?: string; prop?: string }
}
type LegacyCharacterDraft = Omit<CharacterDraft, 'schemaVersion' | 'variants' | 'selected'> & {
  assets: Partial<Record<LegacyRole, CharacterDraftAsset>>
  selectedBody: 'body-base' | 'body-outfit'
  selectedExpression: 'head-neutral' | 'head-happy'
}

export function migrateCharacterDraft(draft: CharacterDraft | CharacterDraftV2 | LegacyCharacterDraft): CharacterDraft {
  if ('schemaVersion' in draft && draft.schemaVersion === 3) return draft
  if ('schemaVersion' in draft && draft.schemaVersion === 2) {
    const usedPropIds = new Set(draft.variants.filter(({ group }) => group === 'prop').map(({ id }) => id))
    const migratedHeadwearIds = new Map<string, string>()
    let nextHatId = 1
    const variants = draft.variants.map((variant): CharacterDraftVariant => {
      if (variant.group !== 'headwear') return variant as CharacterDraftVariant
      let id = variant.id
      while (usedPropIds.has(id)) id = `hat-${nextHatId++}`
      usedPropIds.add(id)
      migratedHeadwearIds.set(variant.id, id)
      return { ...variant, group: 'prop', id }
    })
    return {
      ...draft,
      schemaVersion: 3,
      variants,
      selected: {
        expression: draft.selected.expression,
        ...(draft.selected.outfit ? { outfit: draft.selected.outfit } : {}),
        props: [draft.selected.headwear ? migratedHeadwearIds.get(draft.selected.headwear) : undefined, draft.selected.prop]
          .filter((id): id is string => Boolean(id)),
      },
    }
  }
  const legacy = draft as LegacyCharacterDraft
  const next: CharacterDraft = {
    ...createCharacterDraft(legacy.packId),
    name: legacy.name,
    updatedAt: legacy.updatedAt,
    selected: {
      expression: legacy.selectedExpression === 'head-happy' ? 'happy' : 'neutral',
      ...(legacy.selectedBody === 'body-outfit' ? { outfit: 'outfit-1' } : {}),
      props: (legacy.assets['prop-back'] || legacy.assets['prop-front']) ? ['prop-1'] : [],
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

export function measureCharacterAssetAlignment(
  reference: CharacterAssetInspection | null,
  candidate: CharacterAssetInspection,
  tolerance = 32,
) {
  if (!reference?.visibleBounds || !candidate.visibleBounds) return { status: 'unverified' as const, reason: 'No comparable alpha bounds are available' }
  const expected = reference.visibleBounds
  const actual = candidate.visibleBounds
  const delta = {
    left: actual.x - expected.x,
    top: actual.y - expected.y,
    right: actual.x + actual.width - expected.x - expected.width,
    bottom: actual.y + actual.height - expected.y - expected.height,
  }
  return {
    status: Object.values(delta).every((value) => Math.abs(value) <= tolerance) ? 'aligned' as const : 'misaligned' as const,
    expected,
    actual,
    delta,
    tolerance,
  }
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
  const previousCanonical = draft.variants.find(({ group, id }) => group === 'body' && id === 'base')?.layers.body?.inspection.sha256
  const derived = !(target.group === 'body' && target.variantId === 'base')
  const asset: CharacterDraftAsset = {
    blob, filename, source, inspection,
    ...(derived && previousCanonical ? { canonicalSha256: previousCanonical } : {}),
  }
  const existing = draft.variants.find((variant) => variant.group === target.group && variant.id === target.variantId)
  const variants = existing
    ? draft.variants.map((variant) => variant === existing
      ? { ...variant, label: target.label.trim(), layers: { ...variant.layers, [target.layer]: asset } }
      : variant)
    : [...draft.variants, { group: target.group, id: target.variantId, label: target.label.trim(), layers: { [target.layer]: asset } }]
  const nextVariants = !derived && previousCanonical && previousCanonical !== inspection.sha256
    ? variants.map((variant) => variant.group === 'body' ? variant : {
        ...variant,
        layers: Object.fromEntries(Object.entries(variant.layers).map(([layer, current]) => [
          layer,
          current && !current.canonicalSha256 ? { ...current, canonicalSha256: previousCanonical } : current,
        ])),
      })
    : variants
  const next: CharacterDraft = {
    ...draft,
    approvedAt: undefined,
    variants: nextVariants,
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
const canonicalAsset = (draft: CharacterDraft) => findVariant(draft, 'body', 'base')?.layers.body

export function isCharacterDraftAssetCurrent(
  draft: CharacterDraft,
  variant: CharacterDraftVariant,
  layer: CharacterVariantLayer,
) {
  const asset = variant.layers[layer]
  if (!asset) return false
  if (variant.group === 'body') return variant.id === 'base' && layer === 'body'
  const canonical = canonicalAsset(draft)
  if (!canonical) return false
  return asset.canonicalSha256 === canonical.inspection.sha256
}

export const hasCurrentCharacterLayer = (
  draft: CharacterDraft,
  group: CharacterVariantGroup,
  id: string,
  layer: CharacterVariantLayer,
) => {
  const variant = findVariant(draft, group, id)
  return Boolean(variant && isCharacterDraftAssetCurrent(draft, variant, layer))
}

const currentLayerEntries = (draft: CharacterDraft, variant: CharacterDraftVariant) =>
  (Object.entries(variant.layers) as Array<[CharacterVariantLayer, CharacterDraftAsset | undefined]>)
    .filter(([layer, asset]) => asset && isCharacterDraftAssetCurrent(draft, variant, layer)) as Array<[CharacterVariantLayer, CharacterDraftAsset]>

const selectedVariants = (draft: CharacterDraft) => {
  const outfit = draft.selected.outfit && hasCurrentCharacterLayer(draft, 'outfit', draft.selected.outfit, 'body')
    ? findVariant(draft, 'outfit', draft.selected.outfit) : undefined
  const expression = hasCurrentCharacterLayer(draft, 'expression', draft.selected.expression, 'head')
    ? findVariant(draft, 'expression', draft.selected.expression)
    : hasCurrentCharacterLayer(draft, 'expression', 'neutral', 'head') ? findVariant(draft, 'expression', 'neutral') : undefined
  const props = [...new Set(draft.selected.props)].map((id) => findVariant(draft, 'prop', id))
  return [outfit ?? findVariant(draft, 'body', 'base'), expression, ...props]
    .filter((variant): variant is CharacterDraftVariant => Boolean(variant && currentLayerEntries(draft, variant).length))
}

export const characterAssetPlacement = (group: CharacterVariantGroup, layer: CharacterVariantLayer, propOrder = 1) => {
  if (group === 'body' || group === 'outfit') return { slot: 'character-skin', order: 1 }
  if (group === 'expression') return { slot: 'expression-head', order: 1 }
  return { slot: layer === 'back' ? 'item-back' : 'item-front', order: propOrder }
}

export function resolveCharacterDraftLayers(draft: CharacterDraft): Array<ResolvedCharacterLayer & { blob: Blob }> {
  const slotOrders = new Map<string, number>(CHARACTER_RIG.slots.map(({ id, order }) => [id, order]))
  const propOrders = new Map(draft.variants.filter(({ group }) => group === 'prop').map(({ id }, index) => [id, index + 1]))
  return selectedVariants(draft).flatMap((variant) => currentLayerEntries(draft, variant).map(([layer, asset]) => {
    const placement = characterAssetPlacement(variant.group, layer, propOrders.get(variant.id))
    return {
      id: assetKey(variant, layer as CharacterVariantLayer),
      blobId: assetKey(variant, layer as CharacterVariantLayer),
      slot: placement.slot,
      slotOrder: slotOrders.get(placement.slot)!,
      layerOrder: placement.order,
      blob: asset.blob,
    }
  })).sort((left, right) => left.slotOrder - right.slotOrder || left.layerOrder - right.layerOrder || left.id.localeCompare(right.id))
}

export function buildCharacterPack(draft: CharacterDraft): CharacterPack {
  if (!draft.name.trim()) throw new Error('Companion name is required')
  if (!hasCurrentCharacterLayer(draft, 'body', 'base', 'body') || !hasCurrentCharacterLayer(draft, 'expression', 'neutral', 'head')) throw new Error('Base body and neutral head are required')
  const keys = new Set<string>()
  const propOrders = new Map(draft.variants.filter(({ group }) => group === 'prop').map(({ id }, index) => [id, index + 1]))
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
    assets: draft.variants.flatMap((variant) => currentLayerEntries(draft, variant).map(([layer, asset]) => ({
      id: assetKey(variant, layer),
      blobId: assetKey(variant, layer),
      mediaType: 'image/png' as const,
      size: asset.inspection.size,
      sha256: asset.inspection.sha256,
    }))),
    appearances: draft.variants.flatMap((variant) => {
      const layers = currentLayerEntries(draft, variant).map(([layer]) => {
        const placement = characterAssetPlacement(variant.group, layer, propOrders.get(variant.id))
        return {
          asset: { packId: draft.packId, packVersion: 1, assetId: assetKey(variant, layer) },
          ...placement,
        }
      })
      return layers.length ? [{ id: variantKey(variant), layers }] : []
    }),
    defaultComposition: [],
  }
  pack.defaultComposition = selectedVariants(draft).map((variant) => ref(pack, variantKey(variant)))
  validateCharacterPack(pack, new Map(draft.variants.flatMap((variant) => currentLayerEntries(draft, variant).map(([layer, asset]) => [
    assetKey(variant, layer), asset.inspection,
  ] as const))))
  return pack
}

export function buildCharacterDraftResources(draft: CharacterDraft) {
  const pack = buildCharacterPack(draft)
  const state = {
    id: `character:${pack.id}`,
    packId: pack.id,
    packVersion: pack.version,
    composition: structuredClone(pack.defaultComposition),
  }
  const assets = draft.variants.flatMap((variant) => currentLayerEntries(draft, variant).map(([layer, asset]) => ({
    id: assetKey(variant, layer),
    blob: asset.blob,
  })))
  return { pack, state, assets, layers: resolveCharacterDraftLayers(draft) }
}

export async function reviewCharacterDraft(
  inspect: (blob: Blob) => Promise<CharacterAssetInspection>,
  draft: CharacterDraft,
): Promise<StagedCandidatePreview> {
  const { pack, assets, layers } = buildCharacterDraftResources(draft)
  await validateLibraryRecord(inspect, { name: draft.name.trim(), pack, composition: pack.defaultComposition, assets })
  return {
    source: 'character',
    name: draft.name.trim(),
    appearanceCount: pack.appearances.length,
    layers,
  }
}

export interface InstalledCharacterPackProjection {
  id: string
  version: number
  name: string
  rigProfile: CharacterPack['rigProfile']
  defaultComposition: AppearanceRef[]
  layers: Array<ResolvedCharacterLayer & { blob: Blob }>
}

async function validateLibraryRecord(
  inspect: (blob: Blob) => Promise<CharacterAssetInspection>,
  record: CharacterPackLibraryRecord,
): Promise<InstalledCharacterPackProjection> {
  const blobs = new Map(record.assets.map(({ id, blob }) => [id, blob]))
  const inspections = new Map<string, CharacterAssetInspection>()
  for (const asset of record.pack.assets) {
    const blob = blobs.get(asset.blobId)
    if (!blob) throw new Error(`Character asset read-back failed: ${asset.id}`)
    inspections.set(asset.blobId, await inspect(blob))
  }
  validateCharacterPack(record.pack, inspections)
  return {
    id: record.pack.id,
    version: record.pack.version,
    name: record.name,
    rigProfile: structuredClone(record.pack.rigProfile),
    defaultComposition: structuredClone(record.composition),
    layers: resolveCharacterComposition(record.pack, record.composition)
      .map((layer) => ({ ...layer, blob: blobs.get(layer.blobId)! })),
  }
}

export async function installCharacterDraft(
  library: CharacterPackLibraryRepository,
  inspect: (blob: Blob) => Promise<CharacterAssetInspection>,
  draft: CharacterDraft,
): Promise<InstalledCharacterPackProjection> {
  const { pack, assets } = buildCharacterDraftResources(draft)
  const record = { name: draft.name.trim(), pack, composition: structuredClone(pack.defaultComposition), assets }
  const projection = await validateLibraryRecord(inspect, record)
  await library.install(record)
  return projection
}

export async function listInstalledCharacterPacks(
  library: CharacterPackLibraryRepository,
  inspect: (blob: Blob) => Promise<CharacterAssetInspection>,
): Promise<InstalledCharacterPackProjection[]> {
  return Promise.all((await library.list()).map((record) => validateLibraryRecord(inspect, record)))
}

export async function loadInstalledCharacterPackResources(
  library: CharacterPackLibraryRepository,
  inspect: (blob: Blob) => Promise<CharacterAssetInspection>,
  selection: { packId: string; packVersion: number; composition?: AppearanceRef[] },
) {
  const record = (await library.list()).find(({ pack }) =>
    pack.id === selection.packId && pack.version === selection.packVersion,
  )
  if (!record) throw new Error(`Installed Character Pack not found: ${selection.packId}@${selection.packVersion}`)
  const composition = selection.composition ?? record.composition
  const selected = { ...record, composition: structuredClone(composition) }
  const projection = await validateLibraryRecord(inspect, selected)
  return {
    name: record.name,
    pack: structuredClone(record.pack),
    state: {
      id: `character:${record.pack.id}:v${record.pack.version}`,
      packId: record.pack.id,
      packVersion: record.pack.version,
      composition: structuredClone(composition),
    },
    assets: record.assets.map(({ id, blob }) => ({ id, blob })),
    layers: projection.layers,
  }
}

export async function loadCharacterProjection(
  entries: EntryReader,
  assetsFor: AssetRepositoryFactory,
  bundleId: string,
  inspect: (blob: Blob) => Promise<CharacterAssetInspection>,
  stateId?: string,
): Promise<Array<ResolvedCharacterLayer & { blob: Blob }> | undefined> {
  const requestedState = stateId ? await entries.readById(stateId) : undefined
  if (stateId && (!requestedState || requestedState.collection !== 'character-states' || requestedState.status !== 'published')) {
    throw new Error(`Character state not found: ${stateId}`)
  }
  const packEntry = (await entries.readPublished({ collection: 'character-packs' }))
    .find(({ data }) => {
      const pack = data.pack as Partial<CharacterPack> | undefined
      return Boolean(
        pack?.rigProfile && Array.isArray(pack.assets) && Array.isArray(pack.appearances) && Array.isArray(pack.defaultComposition) &&
        (!requestedState || (requestedState.data.packId === pack.id && requestedState.data.packVersion === pack.version)),
      )
    })
  if (!packEntry) {
    if (stateId) throw new Error(`Character pack not found for state: ${stateId}`)
    return undefined
  }
  const pack = packEntry.data.pack as CharacterPack
  const state = requestedState ?? (await entries.readPublished({ collection: 'character-states' }))
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
