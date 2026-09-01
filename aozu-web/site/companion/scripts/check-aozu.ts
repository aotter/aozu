import assert from 'node:assert/strict'

import { AOZU_CUSTOMIZATION, AOZU_PARTNERS, AOZU_TRAVEL_ACCESSORIES, AOZU_WARDROBE_ITEMS, AOZU_WARDROBE_SLOTS, DEFAULT_TRAVEL_JOURNAL } from '../aozu.ts'
import { assembleAuthoredCandidate } from '../src/core/application/authoring.ts'

const candidate = assembleAuthoredCandidate('bundle:aozu-check', AOZU_CUSTOMIZATION, 1)
const run = candidate.entries.find(({ collection }) => collection === 'runs')
const stage = candidate.entries.find(({ collection }) => collection === 'stages')
const loadout = candidate.entries.find(({ collection }) => collection === 'character-loadouts')
const explorerDefinition = candidate.entries.find(({ collection, id }) => collection === 'item-definitions' && id === 'definition:wardrobe-explorer-vest')
const explorerInventory = candidate.entries.find(({ collection, id }) => collection === 'inventory-items' && id === 'wardrobe-explorer-vest')
const travelJournal = candidate.entries.find(({ collection, id }) => collection === 'inventory-items' && id === 'travel-journal')

assert.equal(candidate.preview.name, 'AOZU · 布丁獺')
assert.equal(run?.data.currentStageId, 'today')
const actionIds = (stage?.data.actions as Array<{ id: string }>).map(({ id }) => id)
assert.deepEqual(actionIds.slice(0, 5), ['steps', 'fitness', 'meals', 'money', 'travel'])
assert.ok(AOZU_WARDROBE_SLOTS.every(({ id }) => actionIds.includes(`clear-${id}`)))
assert.ok(AOZU_WARDROBE_ITEMS.every(({ id }) => actionIds.includes(`wear-${id}`)))
assert.equal(candidate.entries.filter(({ collection }) => collection === 'item-definitions').length, AOZU_WARDROBE_ITEMS.length + 1)
assert.deepEqual(loadout?.data.equipment, {})
assert.equal(AOZU_PARTNERS.length, 7)
assert.deepEqual(explorerInventory?.data.state, { x: 0, y: 0, scale: 1 })
assert.deepEqual((explorerDefinition?.data.definition as { stateSchema?: { required?: string[] } }).stateSchema?.required, ['x', 'y', 'scale'])
assert.equal(AOZU_WARDROBE_ITEMS.length, 20)
assert.ok(AOZU_WARDROBE_SLOTS.every(({ id }) => AOZU_WARDROBE_ITEMS.filter(({ slot }) => slot === id).length === 5))
assert.ok(AOZU_WARDROBE_ITEMS.every(({ crop }) => crop.length === 4))
assert.ok(AOZU_WARDROBE_ITEMS.every(({ crop: [x, y, width, height] }) => x >= 0 && y >= 0 && x + width <= 1024 && y + height <= 1536))
assert.deepEqual(travelJournal?.data.state, DEFAULT_TRAVEL_JOURNAL)
assert.equal(DEFAULT_TRAVEL_JOURNAL.equippedAccessoryId, 'none')
assert.equal(AOZU_TRAVEL_ACCESSORIES.length, 3)
assert.ok(AOZU_TRAVEL_ACCESSORIES.every(({ names }) => Object.keys(names).length === AOZU_PARTNERS.length))
console.log('aozu customization: ok')
