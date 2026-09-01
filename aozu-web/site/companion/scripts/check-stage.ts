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
const run = entry('run-1', 'runs', { currentStageId: 'stage-1', revision: 0, status: 'active' })
const stage = entry('stage-1', 'stages', {
  title: 'First step',
  narrative: 'Begin.',
  scene: { compositionId: 'scene:first' },
  actions: [{ id: 'go', label: 'Go', effects: [{ type: 'changeStage', stageId: 'stage-2' }] }],
  progress: [{ id: 'xp', label: 'XP', value: 0, max: 10 }],
})
const secondStage = entry('stage-2', 'stages', {
  title: 'Second step', narrative: 'Continue.', scene: { compositionId: 'scene:second' }, actions: [], progress: [], terminal: true,
})

assert.equal(projectStage(run, stage).actions[0]?.id, 'go')
assert.equal(projectStage(run, stage).scene?.compositionId, 'scene:first')
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
assert.equal(result.scene?.compositionId, 'scene:second')
console.log('stage: ok')
