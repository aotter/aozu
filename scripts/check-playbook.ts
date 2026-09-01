import assert from 'node:assert/strict'

import { executePlaybookPlan, resolvePreparedAction } from '../src/core/application/playbook.ts'

const actions = [
  { id: 'train', label: 'Train', phrases: ["  Let's TRAIN  "], effects: [{ type: 'addMetric', metricId: 'xp', amount: 2 }] },
  { id: 'rest', label: 'Rest', phrases: ['rest'], effects: [] },
]
assert.equal(resolvePreparedAction(actions, { actionId: 'train' }).path, 'hot')
assert.equal(resolvePreparedAction(actions, { text: "let's train" }).path, 'warm')
assert.deepEqual(resolvePreparedAction(actions, { text: 'unknown' }), { path: 'cold', reason: 'unmatched' })
assert.throws(() => resolvePreparedAction([{ id: 'train', label: ' ' }], { actionId: 'train' }), /Invalid action/)

const next = executePlaybookPlan(
  { currentStageId: 'one', metrics: { xp: 0 }, flags: {} },
  [{ type: 'addMetric', metricId: 'xp', amount: 2 }],
  [
    { id: 'b', priority: 1, when: { fact: 'metric', id: 'xp', op: 'gte', value: 2 }, effects: [{ type: 'setFlag', flagId: 'ready', value: true }] },
    { id: 'a', priority: 1, when: { fact: 'flag', id: 'ready', value: true }, effects: [{ type: 'changeStage', stageId: 'two' }] },
  ],
).runData
assert.deepEqual(next, { currentStageId: 'one', metrics: { xp: 2 }, flags: { ready: true } })
const itemRule = executePlaybookPlan(
  { currentStageId: 'one', metrics: {}, flags: {} },
  [],
  [{ id: 'rain', priority: 1, when: { fact: 'capability', id: 'explore.in-rain' }, effects: [{ type: 'setFlag', flagId: 'rain-ready', value: true }] }],
  {
    capabilities: ['explore.in-rain'], actionIds: [], trustedAppearanceFacts: [], appearances: {},
    ownedDefinitionIds: ['rain-cloak'], equippedDefinitionIds: ['rain-cloak'], quantities: { 'rain-cloak': 1 }, itemStates: {},
  },
)
assert.equal((itemRule.runData.flags as Record<string, boolean>)['rain-ready'], true)

const unchanged = { currentStageId: 'one', metrics: { xp: 0 }, flags: {} }
assert.throws(
  () => executePlaybookPlan(unchanged, [], [
    { id: 'left', priority: 1, when: { fact: 'stage', id: 'one' }, effects: [{ type: 'changeStage', stageId: 'two' }] },
    { id: 'right', priority: 2, when: { fact: 'stage', id: 'one' }, effects: [{ type: 'changeStage', stageId: 'three' }] },
  ]),
  (error) => error instanceof Error && (error as Error & { code?: string }).code === 'conflicting_stage_transition',
)
assert.deepEqual(unchanged, { currentStageId: 'one', metrics: { xp: 0 }, flags: {} })
assert.throws(
  () => executePlaybookPlan(unchanged, Array.from({ length: 51 }, () => ({ type: 'addMetric' as const, metricId: 'xp', amount: 1 })), []),
  /effect limit/,
)
assert.throws(
  () => executePlaybookPlan(unchanged, [{ type: 'setFlag', flagId: 'invented', value: true }], [], undefined, true),
  /Undeclared flag/,
)
console.log('playbook: ok')
