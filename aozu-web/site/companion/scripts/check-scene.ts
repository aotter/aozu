import assert from 'node:assert/strict'

import { matchesSceneImageSignature } from '../src/adapters/browser/scene-image.ts'
import { loadSceneProjection } from '../src/core/application/scene.ts'
import { SCENE_CANVAS, resolveSceneComposition, type SceneAsset, type SceneAssetInspection, type SceneComposition } from '../src/core/domain/scene.ts'

const hash = 'a'.repeat(64)
const blob = new Blob(['scene'], { type: 'image/png' })
const inspection: SceneAssetInspection = { mediaType: blob.type, ...SCENE_CANVAS, size: blob.size, sha256: hash }
assert.equal(matchesSceneImageSignature('image/png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])), true)
assert.equal(matchesSceneImageSignature('image/png', new Uint8Array([0, 80, 78, 71, 13, 10, 26, 10, 0])), false)
const assets = new Map<string, SceneAsset>([
  ['scene-asset:sky', { id: 'scene-asset:sky', blobId: 'blob:sky', mediaType: 'image/png', ...SCENE_CANVAS, size: blob.size, sha256: hash }],
  ['scene-asset:fog', { id: 'scene-asset:fog', blobId: 'blob:fog', mediaType: 'image/png', ...SCENE_CANVAS, size: blob.size, sha256: hash }],
])
const inspections = new Map([['blob:sky', inspection], ['blob:fog', inspection]])
const composition: SceneComposition = {
  id: 'scene:forest',
  layers: [
    { id: 'fog', assetId: 'scene-asset:fog', plane: 'front', order: 1 },
    { id: 'sky', assetId: 'scene-asset:sky', plane: 'back', order: 1 },
  ],
}

assert.deepEqual(resolveSceneComposition(composition, assets, inspections).map(({ id }) => id), ['sky', 'fog'])
assert.throws(() => resolveSceneComposition({ ...composition, layers: [...composition.layers, { ...composition.layers[0]!, id: 'fog-2' }] }, assets, inspections), /scene layer/)

const entry = (id: string, collection: string, data: Record<string, unknown>) => ({ id, collection, data, status: 'published' as const, version: 1, createdAt: 1, updatedAt: 1 })
const entries = new Map([
  [composition.id, entry(composition.id, 'scene-compositions', { layers: composition.layers })],
  ...[...assets.values()].map(({ id, ...data }) => [id, entry(id, 'scene-assets', data)] as const),
])
const projected = await loadSceneProjection(
  { async readById(id: string) { return entries.get(id) ?? null } } as never,
  () => ({ async get(id: string) { return id === 'blob:sky' || id === 'blob:fog' ? blob : null } }) as never,
  'bundle-1',
  composition.id,
  async () => inspection,
)
assert.deepEqual(projected.map(({ id, blob: loaded }) => [id, loaded === blob]), [['sky', true], ['fog', true]])
const draftEntries = new Map([...entries].map(([id, value]) => [id, { ...value, status: 'draft' as const }]))
await assert.rejects(() => loadSceneProjection(
  { async readById(id: string) { return draftEntries.get(id) ?? null } } as never,
  () => ({ async get() { return blob } }) as never,
  'bundle-1',
  composition.id,
  async () => inspection,
), /not found/)
console.log('scene: ok')
