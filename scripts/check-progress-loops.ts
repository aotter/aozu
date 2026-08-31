import assert from 'node:assert/strict'

import { assembleExperienceCandidate, ExperienceCandidateValidationError, type ExperienceCandidateInput } from '../src/core/application/authoring.ts'
import { submitAction } from '../src/core/application/stage.ts'
import { validateBundle } from '../src/core/bundle.ts'
import { createExperienceDraftData, validateLoadedStarterPackage, type ExperienceDraft } from '../src/core/domain/starter.ts'
import { inspectCharacterFixture, inspectSceneFixture, loadFocusStudioFixture } from './starter-fixture.ts'

const base = await loadFocusStudioFixture()
const starter = structuredClone(base.starter)
starter.directions.push({
  id: 'mastery-journey',
  name: 'Mastery Journey',
  summary: 'Advance by practicing one shared skill.',
  seed: {
    kind: 'task',
    directionId: 'mastery-journey',
    loopIds: ['mastery', 'journey'],
    completionMode: 'finite',
    brief: 'Use one metric-backed mastery action to advance a finite journey.',
  },
  characterStateId: 'character:focus-default',
  sceneCompositionId: 'scene:focus-studio',
})
const resources = await validateLoadedStarterPackage(
  { starter, assets: base.assets },
  inspectCharacterFixture,
  inspectSceneFixture,
  '5',
)
const draft: ExperienceDraft = {
  id: 'draft-mastery-journey',
  ...createExperienceDraftData(resources, 'mastery-journey'),
  createdAt: 1,
  updatedAt: 1,
}
const scene = { compositionId: 'scene:focus-studio', characterStateId: 'character:focus-default' }
const input: ExperienceCandidateInput = {
  name: 'Mastery Journey',
  initialStageId: 'study-session',
  metrics: { focus: 0 },
  flags: { ready: false },
  itemDefinitions: [],
  stages: [
    {
      id: 'study-session', title: 'Begin', narrative: 'Practice once.', scene,
      actions: [{ id: 'practice-start', label: 'Practice', phrases: ['practice'], effects: [{ type: 'addMetric', metricId: 'focus', amount: 2 }] }],
      progress: [{ id: 'focus', label: 'Focus', source: { fact: 'metric', id: 'focus' }, max: 3 }],
    },
    {
      id: 'journey-middle', title: 'Continue', narrative: 'Practice again.', scene,
      actions: [{ id: 'practice-finish', label: 'Practice again', phrases: ['practice again'], effects: [{ type: 'addMetric', metricId: 'focus', amount: 1 }] }],
      progress: [{ id: 'focus', label: 'Focus', source: { fact: 'metric', id: 'focus' }, max: 3 }],
    },
    { id: 'journey-complete', title: 'Complete', narrative: 'Done.', terminal: true, scene, actions: [], progress: [] },
  ],
  rules: [
    {
      ruleId: 'advance-middle', priority: 1,
      when: { all: [{ fact: 'stage', id: 'study-session' }, { fact: 'metric', id: 'focus', op: 'gte', value: 2 }] },
      effects: [{ type: 'changeStage', stageId: 'journey-middle' }],
    },
    {
      ruleId: 'advance-complete', priority: 1,
      when: { all: [{ fact: 'stage', id: 'journey-middle' }, { fact: 'metric', id: 'focus', op: 'gte', value: 3 }] },
      effects: [{ type: 'changeStage', stageId: 'journey-complete' }],
    },
  ],
}

const candidate = assembleExperienceCandidate('bundle-mastery-journey', draft, resources, input, 1)
assert.deepEqual(candidate.record.identity.contractVersion === 2 ? candidate.record.identity.loopIds : [], ['mastery', 'journey'])
assert.equal(JSON.stringify(candidate.entries).includes('loopIds'), false)
const roundTrippedRecord = JSON.parse(JSON.stringify(candidate.record))
assert.deepEqual(validateBundle(roundTrippedRecord).record.identity, candidate.record.identity)

const entry = (id: string, collection: string, data: Record<string, unknown>) => ({
  id, collection, status: 'published' as const, version: 1, data, createdAt: 1, updatedAt: 1,
})
const entriesById = new Map(candidate.entries.map(({ id, collection, data }) => [id, entry(id, collection, data)]))
const runId = candidate.record.metadata!.runId
let storedRun = entriesById.get(runId)!
const events: unknown[] = []
const entries = {
  async readById(id: string) { return id === runId ? storedRun : entriesById.get(id) ?? null },
  async readPublished({ collection }: { collection: string }) {
    return [...entriesById.values()].filter((value) => value.collection === collection)
  },
}
const actions = {
  async commit(commit: { expectedRevision: number; nextRunData: Record<string, unknown>; eventData: Record<string, unknown> }) {
    assert.equal(storedRun.data.revision, commit.expectedRevision)
    storedRun = { ...storedRun, version: storedRun.version + 1, data: structuredClone(commit.nextRunData) }
    events.push(structuredClone(commit.eventData))
    return { run: storedRun, event: entry(`event:${events.length}`, 'progress-events', commit.eventData), replayed: false }
  },
}

const middle = await submitAction(entries as never, actions as never, {
  bundleId: candidate.record.id, runId, contractVersion: 2, actionId: 'practice-start', expectedRevision: 0, idempotencyKey: 'first', now: 2,
})
assert.equal(middle.stageId, 'journey-middle')
assert.equal(middle.progress[0]?.value, 2)
const complete = await submitAction(entries as never, actions as never, {
  bundleId: candidate.record.id, runId, contractVersion: 2, actionId: 'practice-finish', expectedRevision: 1, idempotencyKey: 'second', now: 3,
})
assert.equal(complete.status, 'completed')
assert.equal(complete.progress.length, 0)
await assert.rejects(
  submitAction(entries as never, actions as never, {
    bundleId: candidate.record.id, runId, contractVersion: 2, actionId: 'practice-finish', expectedRevision: 2, idempotencyKey: 'third', now: 4,
  }),
  /Run is not active: completed/,
)
assert.equal(events.length, 2)

const expectDiagnostic = (changed: ExperienceCandidateInput, code: string) => assert.throws(
  () => assembleExperienceCandidate(`bad-${code}`, draft, resources, changed, 1),
  (error) => error instanceof ExperienceCandidateValidationError && error.diagnostics[0]?.code === code,
)
const duplicatePhrase = structuredClone(input)
duplicatePhrase.stages[1]!.actions[0]!.phrases = ['PRACTICE']
expectDiagnostic(duplicatePhrase, 'ambiguous_phrase')
const undeclaredFlag = structuredClone(input)
undeclaredFlag.stages[0]!.actions[0]!.effects.push({ type: 'setFlag', flagId: 'invented', value: true })
expectDiagnostic(undeclaredFlag, 'unknown_flag')
const danglingStage = structuredClone(input)
danglingStage.rules[0]!.effects = [{ type: 'changeStage', stageId: 'missing' }]
expectDiagnostic(danglingStage, 'unknown_stage_target')
const danglingItem = structuredClone(input)
danglingItem.stages[0]!.actions[0]!.effects.push({ type: 'grantItem', inventoryId: 'map-1', definitionId: 'missing-map', quantity: 1 })
expectDiagnostic(danglingItem, 'unknown_item_definition')
const danglingScene = structuredClone(input)
danglingScene.stages[1]!.scene = { compositionId: 'scene:missing' }
expectDiagnostic(danglingScene, 'unknown_visual_reference')
const duplicateProgress = structuredClone(input)
duplicateProgress.stages[0]!.progress.push(structuredClone(duplicateProgress.stages[0]!.progress[0]!))
expectDiagnostic(duplicateProgress, 'duplicate_progress_binding')
const terminalOnlyRoute = structuredClone(input)
terminalOnlyRoute.stages.push({
  id: 'unreachable', title: 'Unreachable', narrative: 'Never reached.', agentFallback: true, scene, actions: [], progress: [],
})
terminalOnlyRoute.rules.push({
  ruleId: 'after-terminal', priority: 1, when: { fact: 'stage', id: 'journey-complete' }, effects: [{ type: 'changeStage', stageId: 'unreachable' }],
})
expectDiagnostic(terminalOnlyRoute, 'unreachable_stage')

const continuousDraft = structuredClone(draft)
continuousDraft.seed.completionMode = 'continuous'
const terminalOnly = structuredClone(input)
terminalOnly.stages = [{
  id: 'study-session', title: 'Already done', narrative: 'Done.', terminal: true, scene, actions: [], progress: [],
}]
terminalOnly.initialStageId = 'study-session'
terminalOnly.rules = []
assert.throws(
  () => assembleExperienceCandidate('bad-continuous', continuousDraft, resources, terminalOnly, 1),
  (error) => error instanceof ExperienceCandidateValidationError && error.diagnostics[0]?.code === 'missing_continuing_route',
)

console.log('progress loops: ok')
