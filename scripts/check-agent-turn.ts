import assert from 'node:assert/strict'

import { queueAgentTurn } from '../src/core/application/agent-turn.ts'

const run = { id: 'run', collection: 'runs', status: 'published' as const, version: 1, data: { currentStageId: 'stage', revision: 2, status: 'active' }, createdAt: 1, updatedAt: 1 }
const stage = { id: 'stage', collection: 'stages', status: 'published' as const, version: 1, data: { title: 'Stage', narrative: '', actions: [], progress: [], agentFallback: true }, createdAt: 1, updatedAt: 1 }
const entries = { async readById(id: string) { return id === 'run' ? run : id === 'stage' ? stage : null } }
let queued: Record<string, unknown> | undefined
const turn = await queueAgentTurn(entries as never, { async create(input) { queued = input; return stage } }, {
  bundleId: 'bundle', runId: 'run', userText: '  hello  ', expectedRevision: 2, idempotencyKey: 'one', now: 3,
})
assert.equal(turn.id, 'stage')
assert.equal(queued?.userText, 'hello')
assert.equal(queued?.nodeId, 'stage')
await assert.rejects(
  () => queueAgentTurn({ ...entries, async readById(id: string) {
    return id === 'run' ? run : id === 'stage' ? { ...stage, data: { ...stage.data, agentFallback: false } } : null
  } } as never, { async create() { return stage } } as never, {
    bundleId: 'bundle', runId: 'run', userText: 'hello', expectedRevision: 2, idempotencyKey: 'two', now: 4,
  }),
  /Agent fallback is not available/,
)
console.log('agent-turn: ok')
