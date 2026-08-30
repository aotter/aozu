import assert from 'node:assert/strict'

import { buildCharacterPack, createCharacterDraft } from '../src/core/application/character-creation.ts'
import { validateCharacterPack } from '../src/core/domain/character.ts'

const inspection = { width: 512, height: 768, hasTransparentPixels: true, hasVisiblePixels: true, genuineRgba: true, size: 10, sha256: 'a'.repeat(64) }
const asset = { blob: new Blob(['sprite'], { type: 'image/png' }), filename: 'sprite.png', source: 'user' as const, inspection }
const draft = createCharacterDraft('test-character')
draft.name = 'Test Character'
draft.assets = {
  'body-base': asset,
  'body-outfit': asset,
  'head-neutral': asset,
  'head-happy': asset,
  'prop-back': asset,
  'prop-front': asset,
}
draft.selectedBody = 'body-outfit'
draft.selectedExpression = 'head-happy'

const pack = buildCharacterPack(draft)
assert.deepEqual(pack.defaultComposition.map(({ appearanceId }) => appearanceId), ['body-outfit', 'head-happy', 'prop'])
assert.deepEqual(
  validateCharacterPack(pack, new Map(pack.assets.map(({ blobId }) => [blobId, inspection]))).map(({ slot }) => slot),
  ['item-back', 'character-skin', 'expression-head', 'item-front'],
)
assert.throws(() => buildCharacterPack({ ...draft, assets: { 'body-base': asset } }), /required/)
console.log('character creation: ok')
