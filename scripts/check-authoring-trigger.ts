import assert from 'node:assert/strict'
import { bootMantleRuntime } from '@aotter/mantle-runtime'

import { compileAuthoringBackbone } from '../src/core/mantle/backbone.ts'
import { createExperienceDraftData } from '../src/core/domain/starter.ts'
import { loadFocusStudioFixture } from './starter-fixture.ts'

const rows = new Map<string, Record<string, unknown>>()
const repository = {
  async create(input: Record<string, unknown>) {
    const entry = {
      id: input.id,
      collection: input.collection,
      status: input.status,
      version: 1,
      data: input.data,
      authorId: input.authorId,
      createdAt: input.now,
      updatedAt: input.now,
    }
    rows.set(String(entry.id), entry)
    return entry
  },
  async get(id: string) { return rows.get(id) ?? null },
  async readById(id: string) { return rows.get(id) ?? null },
  async readPublished() { return [...rows.values()] },
  async list() { return { rows: [...rows.values()] } },
  async findByDataField() { return null },
  async findByDataFields() { return null },
  async readBySlug() { return null },
  async readByDataField() { return null },
  async readByDataFieldIn() { return [] },
  async findManyByDataField() { return [] },
}
let submittedInput: unknown
let characterInput: unknown
const runtime = await bootMantleRuntime({
  plan: compileAuthoringBackbone(),
  storage: {
    nativeViewDialects: [],
    async prepare() {
      return { entries: repository as never, views: { async execute() { return { rows: [], page: 1, show: 50, hasMore: false } } } }
    },
  },
  handlers: {
    'companion.inspect-experience-contract': async () => ({ status: 'ok', data: {} }),
    'companion.inspect-character-contract': async () => ({ status: 'ok', data: {} }),
    'companion.submit-character-asset-candidate': async (input) => {
      characterInput = input
      return { status: 'ok', data: {} }
    },
    'companion.submit-experience-candidate': async (input) => {
      submittedInput = input
      return { status: 'ok', data: { bundleId: 'bundle:triggered', revision: 1, replayed: false } }
    },
  },
  ports: {
    idgen: { next: () => 'draft:triggered' },
    clock: { now: () => 1 },
  },
})
const context = { user: null, staff: null, env: {} }
const selected = await runtime.invokeTrigger({
  trigger: 'select-experience-draft',
  input: createExperienceDraftData(await loadFocusStudioFixture(), 'daily-study'),
  ctx: context,
})
assert.equal(selected.ok, true)
assert.equal(rows.get('draft:triggered')?.collection, 'experience-drafts')
const submission = await runtime.invokeTrigger({
  trigger: 'submit-experience-candidate',
  input: {
    draftId: 'draft:triggered', expectedRevision: 0, idempotencyKey: 'once',
    candidate: {
      name: 'Triggered', initialStageId: 'start', metrics: { xp: 0 }, flags: {}, itemDefinitions: [],
      stages: [{
        id: 'start', title: 'Start', narrative: 'Begin.', actions: [], progress: [],
      }],
      rules: [{
        ruleId: 'nested', priority: 1,
        when: { not: { all: [{ fact: 'metric', id: 'xp', op: 'lt', value: 1 }] } },
        effects: [{ type: 'setFlag', flagId: 'done', value: true }],
      }],
    },
  },
  ctx: context,
})
assert.equal(submission.ok, true)
assert.deepEqual(submittedInput, {
  draftId: 'draft:triggered',
  expectedRevision: 0,
  idempotencyKey: 'once',
  candidate: {
    name: 'Triggered', initialStageId: 'start', metrics: { xp: 0 }, flags: {}, itemDefinitions: [],
    stages: [{ id: 'start', title: 'Start', narrative: 'Begin.', actions: [], progress: [] }],
    rules: [{
      ruleId: 'nested', priority: 1,
      when: { not: { all: [{ fact: 'metric', id: 'xp', op: 'lt', value: 1 }] } },
      effects: [{ type: 'setFlag', flagId: 'done', value: true }],
    }],
  },
})
submittedInput = undefined
const invalid = await runtime.invokeTrigger({
  trigger: 'submit-experience-candidate',
  input: {
    draftId: 'draft:triggered', expectedRevision: 0, idempotencyKey: 'invalid',
    candidate: {
      name: 'Invalid', initialStageId: 'start', metrics: {},
      stages: [{ id: 'start', title: 'Start', narrative: 'Begin.', actions: [], progress: [] }],
      rules: [{ ruleId: 'open', priority: 1, when: { fact: 'invented' }, effects: [] }],
    },
  },
  ctx: context,
})
assert.equal(invalid.ok, false)
assert.equal(submittedInput, undefined)
assert.equal((await runtime.invokeTrigger({ trigger: 'inspect-experience-contract', input: {}, ctx: context })).ok, true)
assert.equal((await runtime.invokeTrigger({ trigger: 'inspect-character-contract', input: {}, ctx: context })).ok, true)
const character = {
  group: 'body', variantId: 'base', label: 'Base', layer: 'body',
  filename: 'base.png', dataUrl: 'data:image/png;base64,AAAA',
}
assert.equal((await runtime.invokeTrigger({ trigger: 'submit-character-asset-candidate', input: character, ctx: context })).ok, true)
assert.deepEqual(characterInput, character)
characterInput = undefined
assert.equal((await runtime.invokeTrigger({
  trigger: 'submit-character-asset-candidate', input: { ...character, group: 'hat' }, ctx: context,
})).ok, false)
assert.equal(characterInput, undefined)
console.log('authoring triggers: ok')
