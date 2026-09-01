import assert from 'node:assert/strict'
import { bootMantleRuntime } from '@aotter/mantle-runtime'

import { resolveAgentTurn } from '../src/core/application/agent-turn.ts'
import { loadStage, submitAction } from '../src/core/application/stage.ts'
import { compileFixedBackbone } from '../src/core/mantle/backbone.ts'

const entry = (id: string, collection: string, data: Record<string, unknown>, version = 1) => ({
  id, collection, status: 'published' as const, version, data, authorId: null, createdAt: 1, updatedAt: 1,
})
const rows = new Map([
  ['run', entry('run', 'runs', { currentStageId: 'one', revision: 0, status: 'active', metrics: { xp: 0 }, flags: {} })],
  ['one', entry('one', 'stages', {
    title: 'One', narrative: 'Begin.', agentFallback: false,
    actions: [
      { id: 'practice', label: 'Practice', effects: [{ type: 'addMetric', metricId: 'xp', amount: 1 }] },
      { id: 'advance', label: 'Advance', effects: [{ type: 'changeStage', stageId: 'two' }] },
    ],
    progress: [{ id: 'xp', label: 'XP', source: { fact: 'metric', id: 'xp' }, max: 3 }],
  })],
  ['two', entry('two', 'stages', { title: 'Two', narrative: 'Speak.', agentFallback: true, actions: [], progress: [] })],
  ['three', entry('three', 'stages', { title: 'Three', narrative: 'Done.', terminal: true, actions: [], progress: [] })],
  ['turn', entry('turn', 'pending-agent-turns', {
    runId: 'run', nodeId: 'two', userText: 'Finish', expectedRevision: 2, status: 'pending', createdAtMs: 1,
  })],
])
const repository = {
  async get(id: string) { return rows.get(id) ?? null },
  async readById(id: string) { return rows.get(id) ?? null },
  async readPublished({ collection }: { collection: string }) { return [...rows.values()].filter((value) => value.collection === collection) },
  async list() { return { rows: [...rows.values()] } },
  async create() { throw new Error('not used') },
  async update() { throw new Error('not used') },
  async delete() { throw new Error('not used') },
  async transitionStatus() { throw new Error('not used') },
  async findByDataField() { return null },
  async findByDataFields() { return null },
  async readBySlug() { return null },
  async readByDataField() { return null },
  async readByDataFieldIn() { return [] },
  async findManyByDataField() { return [] },
}
const events = new Map<string, ReturnType<typeof entry>>()
const actions = {
  async commit(input: {
    runId: string
    expectedRevision: number
    idempotencyKey: string
    nextRunData: Record<string, unknown>
    eventData: Record<string, unknown>
    resolveTurnId?: string
    resolutionDialogue?: string
  }) {
    const current = rows.get(input.runId)!
    const eventId = `event:${input.idempotencyKey}`
    const replay = events.get(eventId)
    if (replay) return { run: current, event: replay, replayed: true }
    if (current.data.revision !== input.expectedRevision) throw new Error('Run revision conflict')
    const run = { ...current, version: current.version + 1, data: structuredClone(input.nextRunData) }
    const event = entry(eventId, 'progress-events', input.eventData)
    rows.set(input.runId, run)
    rows.set(eventId, event)
    events.set(eventId, event)
    if (input.resolveTurnId) {
      const turn = rows.get(input.resolveTurnId)!
      rows.set(turn.id, { ...turn, version: turn.version + 1, data: {
        ...turn.data, status: 'resolved', resolutionDialogue: input.resolutionDialogue, resolutionEventId: eventId,
      } })
    }
    return { run, event, replayed: false }
  },
}
const runtime = await bootMantleRuntime({
  plan: compileFixedBackbone(),
  storage: {
    nativeViewDialects: [],
    async prepare() {
      return { entries: repository as never, views: { async execute() { return { rows: [], page: 1, show: 50, hasMore: false } } } }
    },
  },
  handlers: {
    'companion.inspect-companion': async () => ({ status: 'ok', data: { stage: await loadStage(repository as never, 'run') } }),
    'companion.submit-companion-action': (input) => submitAction(repository as never, actions as never, {
      bundleId: 'bundle', runId: 'run', contractVersion: 2, ...(input as { actionId: string; expectedRevision: number; idempotencyKey: string }),
    }),
    'companion.resolve-companion-turn': async (input) => ({
      status: 'ok',
      data: { stage: await resolveAgentTurn(repository as never, actions as never, {
        bundleId: 'bundle', contractVersion: 2,
        ...(input as { turnId: string; idempotencyKey: string; dialogue: string; effects: unknown }),
      }) },
      nextActions: [{ tool: 'inspect_companion', required: true }],
    }),
  },
})
const ctx = { user: null, staff: null, env: {} }
const inspect = await runtime.invokeTrigger<{ status: string; data: { stage: { revision: number } } }>({ trigger: 'inspect-companion', input: {}, ctx })
assert.equal(inspect.ok && inspect.data.data.stage.revision, 0)
const practiceInput = { actionId: 'practice', expectedRevision: 0, idempotencyKey: 'practice-once' }
const practice = await runtime.invokeTrigger<{ revision: number; progress: Array<{ value: number }> }>({ trigger: 'submit-companion-action', input: practiceInput, ctx })
assert.equal(practice.ok && practice.data.revision, 1)
assert.equal(practice.ok && practice.data.progress[0]?.value, 1)
const replay = await runtime.invokeTrigger<{ revision: number }>({ trigger: 'submit-companion-action', input: practiceInput, ctx })
assert.equal(replay.ok && replay.data.revision, 1)
assert.equal(events.size, 1)
const conflict = await runtime.invokeTrigger({
  trigger: 'submit-companion-action',
  input: { actionId: 'practice', expectedRevision: 0, idempotencyKey: 'stale' },
  ctx,
})
assert.equal(conflict.ok, false)
assert.equal(rows.get('run')?.data.revision, 1)
const advance = await runtime.invokeTrigger<{ stageId: string; revision: number }>({
  trigger: 'submit-companion-action',
  input: { actionId: 'advance', expectedRevision: 1, idempotencyKey: 'advance' },
  ctx,
})
assert.equal(advance.ok && advance.data.stageId, 'two')
const resolutionInput = {
  turnId: 'turn', idempotencyKey: 'resolve-once', dialogue: 'Done.',
  effects: [{ type: 'changeStage', stageId: 'three' }],
}
const resolved = await runtime.invokeTrigger<{ data: { stage: { status: string; revision: number } } }>({
  trigger: 'resolve-companion-turn', input: resolutionInput, ctx,
})
assert.equal(resolved.ok && resolved.data.data.stage.status, 'completed')
assert.equal(resolved.ok && resolved.data.data.stage.revision, 3)
const resolvedReplay = await runtime.invokeTrigger<{ data: { stage: { revision: number } } }>({
  trigger: 'resolve-companion-turn', input: resolutionInput, ctx,
})
assert.equal(resolvedReplay.ok && resolvedReplay.data.data.stage.revision, 3)
assert.equal(rows.get('turn')?.data.status, 'resolved')
assert.equal(events.size, 3)

console.log('play triggers: ok')
