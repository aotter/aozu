import assert from 'node:assert/strict'

import { AOZU_CUSTOMIZATION, AOZU_PARTNERS, AOZU_TRAVEL_ACCESSORIES, DEFAULT_TRAVEL_JOURNAL } from '../aozu.ts'
import { assembleAuthoredCandidate } from '../src/core/application/authoring.ts'

const candidate = assembleAuthoredCandidate('bundle:aozu-check', AOZU_CUSTOMIZATION, 1)
const run = candidate.entries.find(({ collection }) => collection === 'runs')
const stage = candidate.entries.find(({ collection }) => collection === 'stages')
const loadout = candidate.entries.find(({ collection }) => collection === 'character-loadouts')
const explorerDefinition = candidate.entries.find(({ collection, id }) => collection === 'item-definitions' && id === 'definition:gear-explorer')
const explorerInventory = candidate.entries.find(({ collection, id }) => collection === 'inventory-items' && id === 'gear-explorer')
const travelJournal = candidate.entries.find(({ collection, id }) => collection === 'inventory-items' && id === 'travel-journal')

assert.equal(candidate.preview.name, 'AOZU · 布丁獺')
assert.equal(run?.data.currentStageId, 'today')
assert.deepEqual((stage?.data.actions as Array<{ id: string }>).map(({ id }) => id), [
  'steps',
  'fitness',
  'meals',
  'money',
  'travel',
  'wear-none',
  'wear-explorer',
  'wear-coffee',
  'wear-focus',
  'wear-night',
  'wear-voyage',
])
assert.equal(candidate.entries.filter(({ collection }) => collection === 'item-definitions').length, 6)
assert.deepEqual(loadout?.data.equipment, { accessory: 'gear-explorer' })
assert.equal(AOZU_PARTNERS.length, 7)
assert.deepEqual(explorerInventory?.data.state, { x: 0, y: 0, scale: 1 })
assert.deepEqual((explorerDefinition?.data.definition as { stateSchema?: { required?: string[] } }).stateSchema?.required, ['x', 'y', 'scale'])
assert.deepEqual(travelJournal?.data.state, DEFAULT_TRAVEL_JOURNAL)
assert.equal(AOZU_TRAVEL_ACCESSORIES.length, 3)
assert.ok(AOZU_TRAVEL_ACCESSORIES.every(({ names }) => Object.keys(names).length === AOZU_PARTNERS.length))
console.log('aozu customization: ok')
