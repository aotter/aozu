import assert from 'node:assert/strict'

import {
  assembleAuthoredCandidate,
  createDefaultCustomizationSeed,
  DEFAULT_CUSTOMIZATION,
  stageAuthoredCandidate,
} from '../src/core/application/authoring.ts'
import { approveCandidate } from '../src/core/application/candidate.ts'

const candidate = assembleAuthoredCandidate('bundle-check', DEFAULT_CUSTOMIZATION, 1)
assert.deepEqual(candidate.preview, { name: 'Trail Guide', stageCount: 1, initialTitle: 'At the trailhead' })
assert.equal(candidate.entries.length, 2)
assert.throws(
  () => assembleAuthoredCandidate('bad', {
    ...DEFAULT_CUSTOMIZATION,
    completionMode: 'finite',
    stages: DEFAULT_CUSTOMIZATION.stages.map((stage) => ({ ...stage, agentFallback: false })),
  }, 1),
  /terminal/,
)
assert.throws(
  () => assembleAuthoredCandidate('bad', { ...DEFAULT_CUSTOMIZATION, stages: [...DEFAULT_CUSTOMIZATION.stages, { ...DEFAULT_CUSTOMIZATION.stages[0]! }] }, 1),
  /Duplicate/,
)
const seed = createDefaultCustomizationSeed()
seed.name = 'Edited Guide'
seed.stages[0]!.title = 'Edited trailhead'
assert.equal(DEFAULT_CUSTOMIZATION.name, 'Trail Guide')
assert.equal(assembleAuthoredCandidate('edited', seed, 1).preview.name, 'Edited Guide')
let activated = false
const stored = new Map<string, { id: string; data: Record<string, unknown> }>()
const bundles = {
  async stageCandidate() { return {} as never },
  async activate() { activated = true; return {} as never },
}
const preview = await stageAuthoredCandidate(
  bundles as never,
  () => ({
    async create(entry: { id: string; data: Record<string, unknown> }) { stored.set(entry.id, entry); return entry },
    async readById(id: string) { return stored.get(id) ?? null },
  }) as never,
  candidate,
)
assert.equal(preview.bundleId, candidate.record.id)
assert.equal(activated, false)
await approveCandidate(bundles as never, preview.bundleId, true)
assert.equal(activated, true)
console.log('authoring: ok')
