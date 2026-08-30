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
  actions: [{ id: 'go', label: 'Go' }],
  progress: [{ id: 'xp', label: 'XP', value: 0, max: 10 }],
})

assert.equal(projectStage(run, stage).actions[0]?.id, 'go')
let storedRun = run
const entries = {
  async readById(id: string) {
    return id === run.id ? storedRun : id === stage.id ? stage : null
  },
}
const result = await submitAction(entries as never, {
  async commit(input) {
    storedRun = { ...storedRun, version: 2, data: input.nextRunData }
    return { run: storedRun, event: entry('event-1', 'progress-events', input.eventData), replayed: false }
  },
}, { bundleId: 'bundle-1', runId: run.id, actionId: 'go', expectedRevision: 0, idempotencyKey: 'once', now: 2 })
assert.equal(result.revision, 1)
assert.equal(result.stageId, stage.id)
console.log('stage: ok')
