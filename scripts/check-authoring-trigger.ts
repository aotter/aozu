import assert from 'node:assert/strict'
import { bootMantleRuntime } from '@aotter/mantle-runtime'

import { compileAuthoringBackbone } from '../src/core/mantle/backbone.ts'
import { createExperienceDraftData } from '../src/core/domain/starter.ts'
import { loadFocusStudioFixture } from './starter-fixture.ts'

let createdEntry: Record<string, unknown> | undefined
const repository = {
  async create(input: Record<string, unknown>) {
    createdEntry = {
      id: input.id,
      collection: input.collection,
      status: input.status,
      version: 1,
      data: input.data,
      authorId: input.authorId,
      createdAt: input.now,
      updatedAt: input.now,
    }
    return createdEntry
  },
}
let submittedInput: unknown
let characterInput: unknown
let transformInput: unknown
const runtime = await bootMantleRuntime({
  plan: compileAuthoringBackbone(),
  storage: {
    nativeViewDialects: [],
    async prepare() {
      return { entries: repository as never, views: { async execute() { return { rows: [], page: 1, show: 50, hasMore: false } } } }
    },
  },
  handlers: {
    'companion.inspect-workspace': async () => ({ status: 'ok', data: {} }),
    'companion.navigate-companion': async (input) => ({ status: 'ok', data: input }),
    'companion.create-local-companion': async () => ({ status: 'ok', data: { bundleId: 'bundle:local' } }),
    'companion.inspect-experience-contract': async () => ({ status: 'ok', data: {} }),
    'companion.inspect-character-contract': async () => ({ status: 'ok', data: {} }),
    'companion.submit-character-asset-candidate': async (input) => {
      characterInput = input
      return { status: 'ok', data: {} }
    },
    'companion.set-character-variant-transform': async (input) => {
      transformInput = input
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
assert.equal(createdEntry?.collection, 'experience-drafts')
assert.equal((await runtime.invokeTrigger({ trigger: 'inspect-workspace', input: {}, ctx: context })).ok, true)
assert.equal((await runtime.invokeTrigger({ trigger: 'navigate-companion', input: { destination: 'start' }, ctx: context })).ok, true)
assert.equal((await runtime.invokeTrigger({ trigger: 'create-local-companion', input: { draftId: 'draft:triggered' }, ctx: context })).ok, true)
const candidate = {
  name: 'Triggered', seed: (await loadFocusStudioFixture()).starter.directions[0]!.seed,
  initialStageId: 'start', metrics: { xp: 0 }, flags: {}, itemDefinitions: [],
  stages: [{ id: 'start', title: 'Start', narrative: 'Begin.', actions: [], progress: [] }],
  rules: [{
    ruleId: 'nested', priority: 1,
    when: { not: { all: [{ fact: 'metric', id: 'xp', op: 'lt', value: 1 }] } },
    effects: [{ type: 'setFlag', flagId: 'done', value: true }],
  }],
}
const submission = await runtime.invokeTrigger({
  trigger: 'submit-experience-candidate',
  input: { draftId: 'draft:triggered', expectedRevision: 0, expectedCharacterUpdatedAt: 1, idempotencyKey: 'once', candidate },
  ctx: context,
})
assert.equal(submission.ok, true)
assert.deepEqual(submittedInput, { draftId: 'draft:triggered', expectedRevision: 0, expectedCharacterUpdatedAt: 1, idempotencyKey: 'once', candidate })
submittedInput = undefined
const invalid = await runtime.invokeTrigger({
  trigger: 'submit-experience-candidate',
  input: {
    draftId: 'draft:triggered', expectedRevision: 0, expectedCharacterUpdatedAt: 1, idempotencyKey: 'invalid',
    candidate: {
      name: 'Invalid', seed: candidate.seed, initialStageId: 'start', metrics: {},
      stages: [{ id: 'start', title: 'Start', narrative: 'Begin.', actions: [], progress: [] }],
      rules: [{ ruleId: 'open', priority: 1, when: { fact: 'invented' }, effects: [] }],
    },
  },
  ctx: context,
})
assert.equal(invalid.ok, false)
assert.equal(submittedInput, undefined)
assert.equal((await runtime.invokeTrigger({ trigger: 'inspect-experience-contract', input: { draftId: 'draft:triggered' }, ctx: context })).ok, true)
assert.equal((await runtime.invokeTrigger({ trigger: 'inspect-character-contract', input: { draftId: 'draft:triggered' }, ctx: context })).ok, true)
const character = {
  draftId: 'draft:triggered',
  group: 'body', variantId: 'base', label: 'Base', layer: 'body',
  expectedUpdatedAt: 1,
  filename: 'base.png', dataUrl: 'data:image/png;base64,AAAA',
}
assert.equal((await runtime.invokeTrigger({ trigger: 'submit-character-asset-candidate', input: character, ctx: context })).ok, true)
assert.deepEqual(characterInput, character)
characterInput = undefined
assert.equal((await runtime.invokeTrigger({
  trigger: 'submit-character-asset-candidate', input: { ...character, group: 'hat' }, ctx: context,
})).ok, false)
assert.equal(characterInput, undefined)
const transform = { draftId: 'draft:triggered', group: 'expression', variantId: 'happy', expectedUpdatedAt: 1, x: 2, y: -3, scale: 1.01 }
assert.equal((await runtime.invokeTrigger({ trigger: 'set-character-variant-transform', input: transform, ctx: context })).ok, true)
assert.deepEqual(transformInput, transform)
console.log('authoring triggers: ok')
