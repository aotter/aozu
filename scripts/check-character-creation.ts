import assert from 'node:assert/strict'

import { buildCharacterPack, characterHeadRegistration, characterRegistrationFrame, createCharacterDraft, hasCurrentCharacterLayer, installCharacterDraft, listInstalledCharacterPacks, loadCharacterProjection, loadInstalledCharacterPackResources, migrateCharacterDraft, resolveCharacterDraftLayers, reviewCharacterDraft, saveCharacterDraftAsset, setCharacterVariantTransform } from '../src/core/application/character-creation.ts'
import { highConfidenceCharacterAutoFit, measureCharacterMaskAlignment, suggestCharacterVisualRegistration, type CharacterAlphaMask, type CharacterVisualSample } from '../src/core/application/character-alignment.ts'
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
put('expression', 'happy', 'head')
put('prop', 'prop-1', 'back')
put('prop', 'prop-1', 'front')
draft.variants.push({ group: 'prop', id: 'prop-2', label: 'Prop 2', layers: { back: asset, front: asset } })
draft.selected = { expression: 'happy', outfit: 'outfit-1', props: ['prop-1', 'prop-2'] }
draft.headRegistration = { variantId: 'happy' }
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
assert.equal(characterHeadRegistration(draft)?.variant.id, 'happy')
assert.equal(characterRegistrationFrame(draft).head?.variantId, 'happy')
assert.equal(characterRegistrationFrame(draft).head?.calibration.rebasesCurrentExpressions, true)
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
assert.equal(migratedV2.selected.expression, undefined)

const state = {
  id: 'character:base', collection: 'character-states', status: 'published' as const, version: 1, createdAt: 1, updatedAt: 1,
  data: {
    packId: pack.id,
    packVersion: pack.version,
    composition: [
      { packId: pack.id, packVersion: pack.version, appearanceId: 'body-base' },
      { packId: pack.id, packVersion: pack.version, appearanceId: 'expression-happy' },
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
assert.equal(hasCurrentCharacterLayer(savedDraft, 'expression', 'happy', 'head'), false)
assert.deepEqual(resolveCharacterDraftLayers(savedDraft).map(({ slot }) => slot), ['character-skin'])
savedDraft = await saveCharacterDraftAsset(
  drafts,
  async () => ({ ...replacementInspection, sha256: 'c'.repeat(64), visibleBounds: { x: 60, y: 10, width: 390, height: 350 } }),
  savedDraft,
  { group: 'expression', variantId: 'happy', label: 'New happy', layer: 'head' },
  new Blob(['happy'], { type: 'image/png' }),
  'happy.png',
  'agent',
)
assert.equal(hasCurrentCharacterLayer(savedDraft, 'expression', 'happy', 'head'), true)
assert.equal(savedDraft.variants.find(({ group, id }) => group === 'expression' && id === 'happy')?.label, 'New happy')
savedDraft = await saveCharacterDraftAsset(
  drafts,
  async () => ({ ...replacementInspection, sha256: 'd'.repeat(64), visibleBounds: { x: 62, y: 11, width: 388, height: 348 } }),
  savedDraft,
  { group: 'expression', variantId: 'angry', label: 'New angry', layer: 'head' },
  new Blob(['angry'], { type: 'image/png' }),
  'angry.png',
  'agent',
)
const characterMask = (...rectangles: Array<{ x: number; y: number; width: number; height: number }>): CharacterAlphaMask => {
  const alpha = new Uint8Array(512 * 768)
  for (const rectangle of rectangles) for (let y = rectangle.y; y < rectangle.y + rectangle.height; y++) {
    alpha.fill(255, y * 512 + rectangle.x, y * 512 + rectangle.x + rectangle.width)
  }
  return { width: 512, height: 768, alpha }
}
const canonicalMask = characterMask(
  { x: 100, y: 20, width: 312, height: 300 },
  { x: 220, y: 320, width: 72, height: 20 },
  { x: 120, y: 340, width: 272, height: 320 },
  { x: 150, y: 660, width: 80, height: 70 },
  { x: 282, y: 660, width: 80, height: 70 },
)
const wholeHeadMask = characterMask({ x: 100, y: 20, width: 312, height: 300 }, { x: 220, y: 320, width: 72, height: 20 })
assert.equal(measureCharacterMaskAlignment('outfit', canonicalMask, canonicalMask).status, 'aligned')
assert.equal(measureCharacterMaskAlignment('outfit', canonicalMask, characterMask(
  { x: 100, y: 20, width: 312, height: 300 },
  { x: 200, y: 320, width: 112, height: 20 },
  { x: 110, y: 340, width: 292, height: 320 },
  { x: 150, y: 660, width: 80, height: 70 },
  { x: 282, y: 660, width: 80, height: 70 },
)).status, 'aligned')
assert.equal(measureCharacterMaskAlignment('outfit', canonicalMask, characterMask({ x: 140, y: 340, width: 232, height: 250 })).status, 'invalid')
assert.equal(measureCharacterMaskAlignment('expression', wholeHeadMask, wholeHeadMask).status, 'aligned')
assert.equal(measureCharacterMaskAlignment('expression', null, wholeHeadMask).status, 'unverified')
assert.equal(measureCharacterMaskAlignment('expression', wholeHeadMask, characterMask({ x: 190, y: 130, width: 132, height: 80 })).status, 'invalid')
assert.equal(measureCharacterMaskAlignment('outfit', canonicalMask, canonicalMask, { x: 20, y: 20, scale: 1 }).status, 'misaligned')
assert.equal(measureCharacterMaskAlignment('outfit', canonicalMask, characterMask({ x: 0, y: 0, width: 10, height: 10 })).diagnostics[0]?.code, 'ALPHA_TOUCHES_CANVAS_EDGE')
const boarHeadMask = characterMask({ x: 100, y: 100, width: 300, height: 300 })
const boarHeadTransform = { x: 105, y: -40, scale: 0.55 }
const boarAlignment = measureCharacterMaskAlignment('expression', boarHeadMask, boarHeadMask, undefined, boarHeadTransform)
assert.equal(boarAlignment.status, 'misaligned')
assert.deepEqual(highConfidenceCharacterAutoFit(boarAlignment), boarHeadTransform)
const visualSample = (left: number, top: number): CharacterVisualSample => {
  const width = 64; const height = 96; const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const pixel = ((top + y) * width + left + x) * 4
    const value = (x * 37 + y * 73 + x * y * 11) % 256
    rgba[pixel] = value; rgba[pixel + 1] = value * 3 % 256; rgba[pixel + 2] = value * 7 % 256; rgba[pixel + 3] = 255
  }
  return { width, height, rgba }
}
const visualFit = suggestCharacterVisualRegistration(visualSample(32, 4), visualSample(8, 8))
assert.ok(visualFit?.suggestedTransform)
assert.deepEqual(visualFit.suggestedTransform, { x: 192, y: -32, scale: 1 })
const staleUpdatedAt = savedDraft.updatedAt
const transformed = await setCharacterVariantTransform(
  drafts,
  'expression',
  'happy',
  staleUpdatedAt,
  { x: 2, y: -3, scale: 0.505 },
)
assert.deepEqual(transformed.variants.find(({ group, id }) => group === 'expression' && id === 'happy')?.transform, { x: 2, y: -3, scale: 0.505 })
assert.deepEqual(transformed.variants.find(({ group, id }) => group === 'expression' && id === 'angry')?.transform, { x: 2, y: -3, scale: 0.505 })
await assert.rejects(() => setCharacterVariantTransform(drafts, 'expression', 'happy', staleUpdatedAt, { x: 0, y: 0, scale: 1 }), /changed/)
console.log('character creation: ok')
