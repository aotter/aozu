import assert from 'node:assert/strict'

import { assembleExperienceCandidate, ExperienceCandidateValidationError } from '../src/core/application/authoring.ts'
import { approveCandidate } from '../src/core/application/candidate.ts'
import { createExperienceDraftData, type ExperienceDraft } from '../src/core/domain/starter.ts'
import { loadFocusStudioFixture } from './starter-fixture.ts'

const resources = await loadFocusStudioFixture()
const draft: ExperienceDraft = {
  id: 'draft-1',
  ...createExperienceDraftData(resources, 'daily-study'),
  createdAt: 1,
  updatedAt: 1,
}
const input = {
  name: 'Focus Friend',
  initialStageId: 'study-session',
  metrics: { focus: 0 },
  flags: {},
  stages: [{
    id: 'study-session',
    title: 'Settle in',
    narrative: 'Choose one small topic and begin.',
    agentFallback: true,
    scene: { compositionId: 'scene:focus-studio', characterStateId: 'character:focus-default' },
    actions: [{
      id: 'focus-now',
      label: 'Start focusing',
      phrases: ['start now'],
      effects: [{ type: 'addMetric', metricId: 'focus', amount: 1 }],
    }],
  }],
}

const candidate = assembleExperienceCandidate('bundle-check', draft, resources, input, 1)
assert.equal(candidate.preview.source, 'starter')
assert.deepEqual(candidate.preview.seed.loopIds, ['rhythm', 'mastery'])
assert.equal(candidate.preview.agentFallbackCount, 1)
assert.equal(candidate.entries.length, 6)
assert.equal(candidate.record.identity.templateId, 'focus-studio')
assert.equal(candidate.record.identity.templateVersion, '1')
assert.deepEqual(candidate.record.metadata?.starter?.seed, draft.seed)
assert.equal(candidate.record.metadata?.starter?.manifestSha256, resources.manifestSha256)
assert.equal(candidate.assets.length, 3)

assert.throws(
  () => assembleExperienceCandidate('changed-starter', draft, { ...resources, manifestSha256: '0'.repeat(64) }, input, 1),
  (error) => error instanceof ExperienceCandidateValidationError && error.diagnostics[0]?.code === 'starter_mismatch',
)

assert.throws(
  () => assembleExperienceCandidate('missing-metric', draft, resources, { ...input, metrics: {} }, 1),
  (error) => error instanceof ExperienceCandidateValidationError && error.diagnostics[0]?.code === 'missing_skeleton_metric',
)
assert.throws(
  () => assembleExperienceCandidate('bad-scene', draft, resources, {
    ...input,
    stages: [{ ...input.stages[0]!, scene: { ...input.stages[0]!.scene, compositionId: 'scene:invented' } }],
  }, 1),
  (error) => error instanceof ExperienceCandidateValidationError && error.diagnostics[0]?.code === 'initial_scene_mismatch',
)
assert.throws(
  () => assembleExperienceCandidate('ambiguous', draft, resources, {
    ...input,
    stages: [{
      ...input.stages[0]!,
      actions: [
        input.stages[0]!.actions[0]!,
        { id: 'also-start', label: 'Also start', phrases: ['START NOW'], effects: [] },
      ],
    }],
  }, 1),
  (error) => error instanceof ExperienceCandidateValidationError && error.diagnostics[0]?.code === 'ambiguous_phrase',
)

let activated = false
const bundles = { async activate() { activated = true; return {} as never } }
await approveCandidate(bundles as never, candidate.record.id, true)
assert.equal(activated, true)
console.log('authoring: ok')
