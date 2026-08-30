import assert from 'node:assert/strict'

import { buildCharacterPack, createCharacterDraft, migrateCharacterDraft, resolveCharacterDraftLayers } from '../src/core/application/character-creation.ts'
import type { CharacterDraftAsset, CharacterVariantGroup, CharacterVariantLayer } from '../src/core/domain/character.ts'
import { validateCharacterPack } from '../src/core/domain/character.ts'

const inspection = { width: 512, height: 768, hasTransparentPixels: true, hasVisiblePixels: true, genuineRgba: true, size: 10, sha256: 'a'.repeat(64) }
const asset = { blob: new Blob(['sprite'], { type: 'image/png' }), filename: 'sprite.png', source: 'user' as const, inspection }
const draft = createCharacterDraft('test-character')
draft.name = 'Test Character'
const put = (group: CharacterVariantGroup, id: string, layer: CharacterVariantLayer) => {
  draft.variants.find((variant) => variant.group === group && variant.id === id)!.layers[layer] = asset
}
put('body', 'base', 'body')
put('outfit', 'outfit-1', 'body')
put('expression', 'neutral', 'head')
put('expression', 'happy', 'head')
put('headwear', 'headwear-1', 'back')
put('headwear', 'headwear-1', 'front')
put('prop', 'prop-1', 'back')
put('prop', 'prop-1', 'front')
draft.selected = { expression: 'happy', outfit: 'outfit-1', headwear: 'headwear-1', prop: 'prop-1' }

const pack = buildCharacterPack(draft)
assert.deepEqual(pack.defaultComposition.map(({ appearanceId }) => appearanceId), ['outfit-outfit-1', 'expression-happy', 'headwear-headwear-1', 'prop-prop-1'])
assert.deepEqual(
  validateCharacterPack(pack, new Map(pack.assets.map(({ blobId }) => [blobId, inspection]))).map(({ slot }) => slot),
  ['item-back', 'item-back', 'character-skin', 'expression-head', 'item-front', 'item-front'],
)
assert.deepEqual(resolveCharacterDraftLayers(draft).map(({ layerOrder }) => layerOrder), [1, 2, 1, 1, 1, 2])
const incomplete = createCharacterDraft('incomplete')
incomplete.variants.find(({ group, id }) => group === 'body' && id === 'base')!.layers.body = asset
assert.throws(() => buildCharacterPack(incomplete), /required/)

const migrated = migrateCharacterDraft({
  id: 'current', packId: 'legacy', name: 'Legacy', updatedAt: 1,
  assets: { 'body-base': asset, 'head-neutral': asset, 'head-happy': asset, 'prop-front': asset },
  selectedBody: 'body-base', selectedExpression: 'head-happy',
} as unknown as Parameters<typeof migrateCharacterDraft>[0])
assert.equal(migrated.schemaVersion, 2)
assert.equal(migrated.selected.expression, 'happy')
assert.equal(migrated.selected.prop, 'prop-1')
assert.equal(migrated.variants.find(({ group, id }) => group === 'prop' && id === 'prop-1')!.layers.front, asset as CharacterDraftAsset)
console.log('character creation: ok')
