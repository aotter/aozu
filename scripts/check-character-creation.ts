import assert from 'node:assert/strict'

import { buildCharacterPack, characterRegistrationFrame, createCharacterDraft, hasCurrentCharacterLayer, installCharacterDraft, listInstalledCharacterPacks, loadCharacterProjection, loadInstalledCharacterPackResources, measureCharacterAssetAlignment, migrateCharacterDraft, resolveCharacterDraftLayers, reviewCharacterDraft, saveCharacterDraftAsset, setCharacterVariantTransform } from '../src/core/application/character-creation.ts'
import type { CharacterDraftAsset, CharacterVariantGroup, CharacterVariantLayer } from '../src/core/domain/character.ts'
import { validateCharacterPack } from '../src/core/domain/character.ts'
import type { CharacterPackLibraryRecord } from '../src/core/application/ports.ts'

const inspection = { width: 512, height: 768, hasTransparentPixels: true, hasVisiblePixels: true, genuineRgba: true, visibleBounds: { x: 40, y: 20, width: 430, height: 720 }, visiblePixelCount: 100, size: 10, sha256: 'a'.repeat(64) }
const asset: CharacterDraftAsset = { blob: new Blob(['sprite'], { type: 'image/png' }), filename: 'sprite.png', source: 'user', inspection, canonicalSha256: inspection.sha256 }
const draft = createCharacterDraft('test-character')
draft.name = 'Test Character'
const put = (group: CharacterVariantGroup, id: string, layer: CharacterVariantLayer) => {
  draft.variants.find((variant) => variant.group === group && variant.id === id)!.layers[layer] = asset
}
put('body', 'base', 'body')
put('outfit', 'outfit-1', 'body')
put('expression', 'neutral', 'head')
put('expression', 'happy', 'head')
put('prop', 'prop-1', 'back')
put('prop', 'prop-1', 'front')
draft.variants.push({ group: 'prop', id: 'prop-2', label: 'Prop 2', layers: { back: asset, front: asset } })
draft.selected = { expression: 'happy', outfit: 'outfit-1', props: ['prop-1', 'prop-2'] }
draft.variants.find(({ group, id }) => group === 'expression' && id === 'happy')!.transform = { x: 2, y: -3, scale: 1.01 }

const pack = buildCharacterPack(draft)
assert.deepEqual(pack.defaultComposition.map(({ appearanceId }) => appearanceId), ['outfit-outfit-1', 'expression-happy', 'prop-prop-1', 'prop-prop-2'])
assert.deepEqual(
  validateCharacterPack(pack, new Map(pack.assets.map(({ blobId }) => [blobId, inspection]))).map(({ slot }) => slot),
  ['item-back', 'item-back', 'character-skin', 'expression-head', 'item-front', 'item-front'],
)
assert.deepEqual(resolveCharacterDraftLayers(draft).map(({ layerOrder }) => layerOrder), [1, 2, 1, 1, 1, 2])
assert.deepEqual(resolveCharacterDraftLayers(draft).find(({ slot }) => slot === 'expression-head')?.transform, { x: 2, y: -3, scale: 1.01 })
assert.deepEqual(characterRegistrationFrame(draft).footLine, 739)
const preview = await reviewCharacterDraft(async () => inspection, draft)
assert.equal(preview.source, 'character')
assert.equal('bundleId' in preview, false)
const installed: CharacterPackLibraryRecord[] = []
const library = {
  async install(record: CharacterPackLibraryRecord) {
    if (installed.some(({ pack }) => pack.id === record.pack.id && pack.version === record.pack.version)) throw new Error('already installed')
    installed.push(structuredClone(record))
  },
  async list() { return structuredClone(installed) },
}
const firstInstalled = await installCharacterDraft(library, async () => inspection, draft)
assert.equal(firstInstalled.id, pack.id)
assert.equal((await listInstalledCharacterPacks(library, async () => inspection))[0]?.layers.length, 6)
await assert.rejects(() => installCharacterDraft(library, async () => inspection, draft), /already installed/)
const secondDraft = structuredClone(draft)
secondDraft.packId = 'test-character-two'
secondDraft.name = 'Test Character Two'
await installCharacterDraft(library, async () => inspection, secondDraft)
assert.equal((await listInstalledCharacterPacks(library, async () => inspection)).length, 2)
const installedResources = await loadInstalledCharacterPackResources(library, async () => inspection, {
  packId: pack.id,
  packVersion: pack.version,
})
assert.equal(installedResources.state.id, `character:${pack.id}:v${pack.version}`)
assert.equal(installedResources.assets.length, pack.assets.length)
await assert.rejects(() => loadInstalledCharacterPackResources(library, async () => inspection, {
  packId: 'missing', packVersion: 1,
}), /not found/)
await assert.rejects(() => loadInstalledCharacterPackResources(library, async () => inspection, {
  packId: pack.id,
  packVersion: pack.version,
  composition: [{ packId: pack.id, packVersion: pack.version, appearanceId: 'missing' }],
}), /Appearance not found/)
const incomplete = createCharacterDraft('incomplete')
incomplete.variants.find(({ group, id }) => group === 'body' && id === 'base')!.layers.body = asset
assert.throws(() => buildCharacterPack(incomplete), /required/)
await assert.rejects(() => installCharacterDraft(library, async () => inspection, incomplete), /required/)
assert.equal(installed.length, 2)

const migrated = migrateCharacterDraft({
  id: 'current', packId: 'legacy', name: 'Legacy', updatedAt: 1,
  assets: { 'body-base': asset, 'head-neutral': asset, 'head-happy': asset, 'prop-front': asset },
  selectedBody: 'body-base', selectedExpression: 'head-happy',
} as unknown as Parameters<typeof migrateCharacterDraft>[0])
assert.equal(migrated.schemaVersion, 3)
assert.equal(migrated.selected.expression, 'happy')
assert.deepEqual(migrated.selected.props, ['prop-1'])
assert.equal(migrated.variants.find(({ group, id }) => group === 'prop' && id === 'prop-1')!.layers.front, asset as CharacterDraftAsset)

const migratedV2 = migrateCharacterDraft({
  id: 'current', schemaVersion: 2, packId: 'v2', name: 'V2', updatedAt: 2,
  variants: [
    { group: 'headwear', id: 'prop-1', label: 'Hat', layers: { front: asset } },
    { group: 'prop', id: 'prop-1', label: 'Wand', layers: { front: asset } },
  ],
  selected: { expression: 'neutral', headwear: 'prop-1', prop: 'prop-1' },
} as unknown as Parameters<typeof migrateCharacterDraft>[0])
assert.equal(migratedV2.schemaVersion, 3)
assert.deepEqual(migratedV2.variants.map(({ group, id }) => `${group}:${id}`), ['prop:hat-1', 'prop:prop-1'])
assert.deepEqual(migratedV2.selected.props, ['hat-1', 'prop-1'])

const state = {
  id: 'character:base', collection: 'character-states', status: 'published' as const, version: 1, createdAt: 1, updatedAt: 1,
  data: {
    packId: pack.id,
    packVersion: pack.version,
    composition: [
      { packId: pack.id, packVersion: pack.version, appearanceId: 'body-base' },
      { packId: pack.id, packVersion: pack.version, appearanceId: 'expression-neutral' },
    ],
  },
}
const loaded = await loadCharacterProjection(
  {
    async readById(id: string) { return id === state.id ? state : null },
    async readPublished({ collection }: { collection?: string } = {}) {
      return collection === 'character-packs'
        ? [{ id: `pack:${pack.id}`, collection: 'character-packs', status: 'published' as const, version: 1, createdAt: 1, updatedAt: 1, data: { pack } }]
        : []
    },
  } as never,
  () => ({ async get() { return asset.blob } }) as never,
  'bundle-1',
  async () => inspection,
  state.id,
)
assert.deepEqual(loaded?.map(({ slot }) => slot), ['character-skin', 'expression-head'])

let savedDraft = structuredClone(draft)
const drafts = { async get() { return savedDraft }, async put(next: typeof savedDraft) { savedDraft = structuredClone(next) }, async clear() {} }
const replacementInspection = { ...inspection, sha256: 'b'.repeat(64), visibleBounds: { x: 40, y: 10, width: 430, height: 730 }, visiblePixelCount: 100 }
savedDraft = await saveCharacterDraftAsset(
  drafts,
  async () => replacementInspection,
  savedDraft,
  { group: 'body', variantId: 'base', label: 'New base', layer: 'body' },
  new Blob(['replacement'], { type: 'image/png' }),
  'replacement.png',
  'agent',
)
assert.equal(hasCurrentCharacterLayer(savedDraft, 'expression', 'neutral', 'head'), false)
assert.deepEqual(resolveCharacterDraftLayers(savedDraft).map(({ slot }) => slot), ['character-skin'])
savedDraft = await saveCharacterDraftAsset(
  drafts,
  async () => ({ ...replacementInspection, sha256: 'c'.repeat(64), visibleBounds: { x: 60, y: 10, width: 390, height: 350 } }),
  savedDraft,
  { group: 'expression', variantId: 'neutral', label: 'New neutral', layer: 'head' },
  new Blob(['neutral'], { type: 'image/png' }),
  'neutral.png',
  'agent',
)
assert.equal(hasCurrentCharacterLayer(savedDraft, 'expression', 'neutral', 'head'), true)
assert.equal(savedDraft.variants.find(({ group, id }) => group === 'expression' && id === 'neutral')?.label, 'New neutral')
assert.equal(measureCharacterAssetAlignment(
  { ...inspection, visibleBounds: { x: 60, y: 10, width: 390, height: 350 } },
  { ...inspection, visibleBounds: { x: 66, y: 14, width: 386, height: 348 } },
).status, 'aligned')
assert.equal(measureCharacterAssetAlignment(
  { ...inspection, visibleBounds: { x: 60, y: 10, width: 390, height: 350 } },
  { ...inspection, visibleBounds: { x: 120, y: 80, width: 300, height: 250 } },
).status, 'misaligned')
const staleUpdatedAt = savedDraft.updatedAt
const transformed = await setCharacterVariantTransform(
  drafts,
  'expression',
  'neutral',
  staleUpdatedAt,
  { x: 3, y: -2, scale: 1.02 },
)
assert.deepEqual(transformed.variants.find(({ group, id }) => group === 'expression' && id === 'neutral')?.transform, { x: 3, y: -2, scale: 1.02 })
await assert.rejects(() => setCharacterVariantTransform(drafts, 'expression', 'neutral', staleUpdatedAt, { x: 0, y: 0, scale: 1 }), /changed/)
console.log('character creation: ok')
