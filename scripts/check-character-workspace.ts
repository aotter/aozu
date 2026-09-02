import assert from 'node:assert/strict'
import type { Entry } from '@aotter/mantle-spec'
import type { MantleRuntime } from '@aotter/mantle-runtime'

import { createCharacterWorkspaceRepository } from '../src/adapters/indexeddb/character-workspace-repository.ts'
import { createCharacterDraft } from '../src/core/application/character-creation.ts'

let row: Entry | null = null
let now = 1
const assets = new Map<string, Map<string, Blob>>()
const runtime = {
  entries: {
    async readPublished({ collection }: { collection?: string } = {}) { return row && (!collection || row.collection === collection) ? [row] : [] },
    async readById(id: string) { return row?.id === id ? row : null },
  },
  async invokeProcedure({ procedure, input }: { procedure: string; input: Record<string, unknown> }) {
    if (procedure === 'create-character-workspace') {
      row = { id: 'workspace-1', collection: 'character-workspaces', status: 'published', version: 1, data: structuredClone(input), createdAt: now, updatedAt: now++ }
      return { ok: true as const, data: row }
    }
    if (procedure === 'update-character-workspace' && row) {
      const { id: _id, expectedVersion: _version, ...data } = input
      row = { ...row, data: structuredClone(data), version: row.version + 1, updatedAt: now++ }
      return { ok: true as const, data: row }
    }
    row = null
    return { ok: true as const, data: { removed: true } }
  },
} as unknown as MantleRuntime
const repository = createCharacterWorkspaceRepository(
  async () => runtime,
  (scope) => ({
    async put(id, blob) { const scoped = assets.get(scope) ?? new Map(); scoped.set(id, blob); assets.set(scope, scoped) },
    async get(id) { return assets.get(scope)?.get(id) ?? null },
    async list() { return [...(assets.get(scope) ?? [])].map(([id, blob]) => ({ id, blob })) },
    async deleteAll() { assets.delete(scope) },
  }),
)

const draft = createCharacterDraft('boar-pack', 'legacy-id')
const blob = new Blob(['boar'], { type: 'image/png' })
draft.variants[0]!.layers.body = {
  blob,
  filename: 'boar.png',
  source: 'user',
  inspection: {
    width: 512, height: 768, hasTransparentPixels: true, hasVisiblePixels: true, genuineRgba: true,
    visibleBounds: { x: 1, y: 2, width: 500, height: 760 }, visiblePixelCount: 100, size: 4, sha256: 'a'.repeat(64),
  },
}
const created = await repository.create(draft)
assert.equal(created.id, 'workspace-1')
assert.equal(await created.variants[0]!.layers.body!.blob.text(), 'boar')
assert.equal('blob' in ((row!.data.variants as Array<{ layers: { body: object } }>)[0]!.layers.body), false)
assert.equal((row!.data.variants as Array<{ layers: { body: { blobId: string } } }>)[0]!.layers.body.blobId, 'a'.repeat(64))

const updated = await repository.put({ ...created, name: 'Boar', revision: 1 })
assert.equal(updated.name, 'Boar')
await assert.rejects(() => repository.put({ ...updated, name: 'Stale' }), /changed/)
await repository.delete(updated.id)
assert.equal(await repository.get(updated.id), null)
assert.equal(assets.size, 0)

console.log('character workspace: ok')
