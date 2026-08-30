import assert from 'node:assert/strict'

import { assembleAuthoredCandidate, DEFAULT_CUSTOMIZATION } from '../src/core/application/authoring.ts'

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
console.log('authoring: ok')
