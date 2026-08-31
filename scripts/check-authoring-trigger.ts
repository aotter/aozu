import assert from 'node:assert/strict'
import { bootMantleRuntime } from '@aotter/mantle-runtime'

import { compileFixedBackbone } from '../src/core/mantle/backbone.ts'
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
const runtime = await bootMantleRuntime({
  plan: compileFixedBackbone(),
  storage: {
    nativeViewDialects: [],
    async prepare() {
      return { entries: repository as never, views: { async execute() { return { rows: [], page: 1, show: 50, hasMore: false } } } }
    },
  },
  handlers: {
    'companion.submit-action': async () => ({}),
    'companion.submit-experience-candidate': async (input) => {
      submittedInput = input
      return { bundleId: 'bundle:triggered', revision: 1, replayed: false }
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
  input: { draftId: 'draft:triggered', expectedRevision: 0, idempotencyKey: 'once', candidateJson: '{}' },
  ctx: context,
})
assert.equal(submission.ok, true)
assert.deepEqual(submittedInput, {
  draftId: 'draft:triggered',
  expectedRevision: 0,
  idempotencyKey: 'once',
  candidateJson: '{}',
})
console.log('authoring triggers: ok')
