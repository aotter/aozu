import assert from 'node:assert/strict'

import { planItemEffects } from '../src/core/application/items.ts'

const entry = (id: string, collection: string, data: Record<string, unknown>, version = 1) => ({
  id, collection, status: 'published' as const, version, data, createdAt: 1, updatedAt: 1,
})
const definition = entry('definition:cloak', 'item-definitions', {
  definition: {
    id: 'rain-cloak', name: 'Rain cloak', equipSlot: 'body',
    grants: ['explore.in-rain'], actionIds: ['listen-rain'], stackable: false,
    defaultAppearance: { packId: 'guide', packVersion: 1, appearanceId: 'cloak' },
    appearanceFacts: [{ appearance: { packId: 'guide', packVersion: 1, appearanceId: 'cloak' }, facts: ['appearance.rain-cloak'] }],
  },
})
let inventory: ReturnType<typeof entry>[] = []
let loadout: ReturnType<typeof entry> | null = null
const entries = {
  async readPublished({ collection }: { collection?: string }) {
    return collection === 'item-definitions'
      ? [definition]
      : collection === 'inventory-items'
        ? inventory
        : collection === 'character-packs'
          ? [entry('pack', 'character-packs', { pack: { id: 'guide', version: 1, appearances: [{ id: 'cloak' }] } })]
          : []
  },
  async readById() { return loadout },
}
const grant = await planItemEffects(entries as never, 'run', [
  { type: 'grantItem', inventoryId: 'cloak-1', definitionId: 'rain-cloak', quantity: 1 },
  { type: 'equipItem', inventoryId: 'cloak-1', slot: 'body' },
])
assert.deepEqual(grant.projection.capabilities, ['explore.in-rain'])
assert.deepEqual(grant.projection.trustedAppearanceFacts, ['appearance.rain-cloak'])
inventory = [entry('cloak-1', 'inventory-items', { definitionId: 'rain-cloak', quantity: 1, state: {} })]
loadout = entry('loadout:run', 'character-loadouts', { runId: 'run', equipment: { body: 'cloak-1' }, appearanceOverrides: {} })
const consume = await planItemEffects(entries as never, 'run', [{ type: 'consumeItem', inventoryId: 'cloak-1', quantity: 1 }])
assert.equal(consume.itemMutations.find(({ id }) => id === 'cloak-1')?.data, null)
assert.equal(consume.projection.capabilities.length, 0)
console.log('items: ok')
