import assert from 'node:assert/strict'

import { projectStage, submitAction } from '../src/core/application/stage.ts'

const entry = (id: string, collection: string, data: Record<string, unknown>) => ({
  id,
  collection,
  status: 'published' as const,
  version: 1,
  data,
  createdAt: 1,
  updatedAt: 1,
})
const run = entry('run-1', 'runs', { currentStageId: 'stage-1', revision: 0, status: 'active', metrics: { xp: 0 }, flags: {} })
const stage = entry('stage-1', 'stages', {
  title: 'First step',
  narrative: 'Begin.',
  scene: { compositionId: 'scene:first' },
  actions: [{ id: 'go', label: 'Go', effects: [{ type: 'changeStage', stageId: 'stage-2' }] }],
  progress: [{ id: 'xp', label: 'XP', source: { fact: 'metric', id: 'xp' }, max: 10 }],
})
const secondStage = entry('stage-2', 'stages', {
  title: 'Second step', narrative: 'Continue.', scene: { compositionId: 'scene:second' }, actions: [], progress: [], terminal: true,
})

assert.equal(projectStage(run, stage).actions[0]?.id, 'go')
assert.equal(projectStage({ ...run, data: { ...run.data, metrics: { xp: 3 } } }, stage).progress[0]?.value, 3)
assert.equal(projectStage(run, { ...stage, data: { ...stage.data, progress: [{ id: 'legacy', label: 'Legacy', value: 'halfway' }] } }).progress[0]?.value, 'halfway')
assert.equal(projectStage(run, stage).scene?.compositionId, 'scene:first')
assert.deepEqual(
  projectStage(run, { ...stage, data: { ...stage.data, scene: { characterStateId: 'character:only' } } }).scene,
  { characterStateId: 'character:only' },
)
assert.equal(projectStage(run, { ...stage, data: { ...stage.data, scene: { backgroundAssetId: 'legacy-background' } } }).scene, undefined)
let storedRun = run
const entries = {
  async readById(id: string) {
    return id === run.id ? storedRun : id === stage.id ? stage : id === secondStage.id ? secondStage : null
  },
  async readPublished() {
    return []
  },
}
const result = await submitAction(entries as never, {
  async commit(input) {
    storedRun = { ...storedRun, version: 2, data: input.nextRunData }
    return { run: storedRun, event: entry('event-1', 'progress-events', input.eventData), replayed: false }
  },
}, { bundleId: 'bundle-1', runId: run.id, actionId: 'go', expectedRevision: 0, idempotencyKey: 'once', now: 2 })
assert.equal(result.revision, 1)
assert.equal(result.stageId, secondStage.id)
assert.equal(result.status, 'completed')
assert.equal(storedRun.data.status, 'completed')
assert.equal(result.scene?.compositionId, 'scene:second')

const itemRun = entry('run-items', 'runs', { currentStageId: 'item-stage', revision: 0, status: 'active', metrics: {}, flags: { 'has-key': false } })
const itemStage = entry('item-stage', 'stages', {
  title: 'Find a key', narrative: '', actions: [{
    id: 'take-key', label: 'Take key', effects: [{ type: 'grantItem', inventoryId: 'key-1', definitionId: 'key', quantity: 1, state: {} }],
  }], progress: [],
})
const itemRule = entry('rule:key', 'rules', {
  ruleId: 'key', priority: 1, when: { fact: 'inventory', id: 'key' }, effects: [{ type: 'setFlag', flagId: 'has-key', value: true }],
})
const definition = entry('definition:key', 'item-definitions', { definition: { id: 'key', name: 'Key' } })
let itemStoredRun = itemRun
let committedItemMutations = 0
const itemEntries = {
  async readById(id: string) {
    return id === itemRun.id ? itemStoredRun : id === itemStage.id ? itemStage : null
  },
  async readPublished({ collection }: { collection: string }) {
    return collection === 'rules' ? [itemRule] : collection === 'item-definitions' ? [definition] : []
  },
}
await submitAction(itemEntries as never, {
  async commit(input) {
    committedItemMutations = input.itemMutations?.length ?? 0
    itemStoredRun = { ...itemStoredRun, version: 2, data: input.nextRunData }
    return { run: itemStoredRun, event: entry('event:item', 'progress-events', input.eventData), replayed: false }
  },
}, { bundleId: 'bundle-items', runId: itemRun.id, contractVersion: 2, actionId: 'take-key', expectedRevision: 0, idempotencyKey: 'item-once', now: 2 })
assert.equal((itemStoredRun.data.flags as Record<string, boolean>)['has-key'], true)
assert.equal(committedItemMutations, 2)

const limitedRun = entry('run-limited', 'runs', { currentStageId: 'limited-stage', revision: 0, status: 'active', metrics: { xp: 0 }, flags: {} })
const limitedStage = entry('limited-stage', 'stages', {
  title: 'Limited', narrative: '', progress: [], actions: [{
    id: 'too-many', label: 'Too many',
    effects: Array.from({ length: 51 }, () => ({ type: 'addMetric', metricId: 'xp', amount: 1 })),
  }],
})
let limitCommitted = false
await assert.rejects(
  submitAction({
    async readById(id: string) { return id === limitedRun.id ? limitedRun : id === limitedStage.id ? limitedStage : null },
    async readPublished() { return [] },
  } as never, {
    async commit() { limitCommitted = true; throw new Error('commit must not run') },
  } as never, {
    bundleId: 'bundle-limited', runId: limitedRun.id, contractVersion: 2,
    actionId: 'too-many', expectedRevision: 0, idempotencyKey: 'limited', now: 2,
  }),
)
assert.equal(limitCommitted, false)
assert.equal(limitedRun.data.revision, 0)
assert.equal((limitedRun.data.metrics as Record<string, number>).xp, 0)
console.log('stage: ok')
