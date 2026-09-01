import assert from 'node:assert/strict'

import { assembleExperienceCandidate, ExperienceCandidateValidationError, selectExperienceCharacter, type ExperienceCandidateInput } from '../src/core/application/authoring.ts'
import { approveCandidate, loadPendingCandidatePreview } from '../src/core/application/candidate.ts'
import { validateBundle } from '../src/core/bundle.ts'
import { buildCharacterDraftResources, createCharacterDraftFromStarter } from '../src/core/application/character-creation.ts'
import { submitAction } from '../src/core/application/stage.ts'
import { createBlankExperienceDraftData, createExperienceDraftData, type ExperienceDraft } from '../src/core/domain/starter.ts'
import { loadFocusStudioFixture } from './starter-fixture.ts'

const resources = await loadFocusStudioFixture()
const baseDirection = resources.starter.directions[0]!
resources.starter.directions.push({
  ...baseDirection,
  id: 'mastery-journey', name: 'Mastery Journey',
  seed: {
    ...baseDirection.seed,
    directionId: 'mastery-journey', loopIds: ['mastery', 'journey'], completionMode: 'finite',
  },
})
const draft: ExperienceDraft = {
  id: 'draft-mastery-journey',
  ...createExperienceDraftData(resources, 'mastery-journey'),
  createdAt: 1,
  updatedAt: 1,
}
const characterDraft = createCharacterDraftFromStarter(resources, 'character:focus-default')
const characterResources = buildCharacterDraftResources(characterDraft)
const characterStateId = characterResources.state.id
let selectedDraftEntry = {
  id: draft.id,
  collection: 'experience-drafts',
  status: 'published' as const,
  version: 1,
  data: { ...createExperienceDraftData(resources, 'mastery-journey'), lastSubmission: { idempotencyKey: 'old', bundleId: 'old' } } as Record<string, unknown>,
  createdAt: 1,
  updatedAt: 1,
}
const selectedEntry = await selectExperienceCharacter({
  async readById() { return selectedDraftEntry },
  async update(args: { data: Record<string, unknown> }) {
    selectedDraftEntry = { ...selectedDraftEntry, version: selectedDraftEntry.version + 1, data: args.data }
    return selectedDraftEntry
  },
} as never, {
  draftId: draft.id,
  expectedRevision: 0,
  packId: characterResources.pack.id,
  packVersion: characterResources.pack.version,
  composition: characterResources.state.composition,
  now: 2,
})
assert.equal(selectedEntry.data.revision, 1)
assert.equal('lastSubmission' in selectedEntry.data, false)
await assert.rejects(() => selectExperienceCharacter({ async readById() { return selectedDraftEntry } } as never, {
  draftId: draft.id,
  expectedRevision: 0,
  packId: characterResources.pack.id,
  packVersion: characterResources.pack.version,
  composition: characterResources.state.composition,
}), /stale/)
const scene = { compositionId: 'scene:focus-studio', characterStateId }
const input: ExperienceCandidateInput = {
  name: 'Mastery Journey',
  seed: structuredClone(draft.story!.seed),
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

const candidate = assembleExperienceCandidate('bundle-mastery-journey', draft, resources, characterResources, input, 1)
assert.deepEqual(candidate.record.identity.contractVersion === 2 ? candidate.record.identity.loopIds : [], ['mastery', 'journey'])
assert.equal(JSON.stringify(candidate.entries).includes('loopIds'), false)
assert.equal(candidate.preview.source, 'experience')
assert.equal(candidate.entries.find(({ collection }) => collection === 'character-packs')?.data.pack.id, characterResources.pack.id)
assert.equal(characterResources.assets.every(({ id }) => candidate.assets.some((asset) => asset.id === id)), true)
assert.equal(candidate.record.metadata?.starter?.manifestSha256, resources.manifestSha256)
assert.equal(candidate.assets.length, 3)
const storedCandidateEntries = new Map(candidate.entries.map(({ id, collection, data }) => [id, {
  id, collection, data, status: 'published' as const, version: 1, createdAt: 1, updatedAt: 1,
}]))
const storedCandidateAssets = new Map(candidate.assets.map(({ id, blob }) => [id, blob]))
const characterInspections = new Map(characterDraft.variants.flatMap(({ layers }) =>
  Object.values(layers).filter((asset) => asset).map((asset) => [asset!.blob, asset!.inspection] as const),
))
const sceneInspections = new Map(resources.starter.scenePack.assets.map(({ blobId }) => [
  resources.assets.find(({ id }) => id === blobId)!.blob,
  resources.sceneInspections.get(blobId)!,
]))
const resumed = await loadPendingCandidatePreview(
  { async getPendingReview() { return { bundle: validateBundle(candidate.record), source: 'experience' as const, createdAt: 1 } } } as never,
  () => ({
    async readById(id: string) { return storedCandidateEntries.get(id) ?? null },
    async readPublished({ collection }: { collection?: string } = {}) {
      return [...storedCandidateEntries.values()].filter((value) => !collection || value.collection === collection)
    },
  } as never),
  () => ({
    async get(id: string) { return storedCandidateAssets.get(id) ?? null },
    async list() { return [...storedCandidateAssets].map(([id, blob]) => ({ id, blob })) },
  }),
  async (blob) => characterInspections.get(blob)!,
  async (blob) => sceneInspections.get(blob)!,
)
assert.equal(resumed?.source, 'experience')
assert.equal(resumed?.name, candidate.preview.name)
assert.equal(resumed?.source === 'experience' ? resumed.stageCount : 0, candidate.preview.stageCount)
assert.equal(resumed?.source === 'experience' ? resumed.characterLayers.length : 0, candidate.preview.characterLayers.length)
assert.equal(resumed?.source === 'experience' ? resumed.sceneLayers.length : 0, candidate.preview.sceneLayers.length)
const blankDraft: ExperienceDraft = {
  id: 'draft-blank', ...createBlankExperienceDraftData(), createdAt: 1, updatedAt: 1,
}
const blank = assembleExperienceCandidate('bundle-blank', blankDraft, null, characterResources, {
  name: 'Blank Story',
  seed: { kind: 'story', directionId: 'custom-story', loopIds: ['rhythm'], completionMode: 'continuous', brief: 'Create a small story.' },
  initialStageId: 'start', metrics: {}, flags: {}, itemDefinitions: [],
  stages: [{ id: 'start', title: 'Start', narrative: 'Begin.', agentFallback: true, scene: { characterStateId }, actions: [], progress: [] }],
  rules: [],
}, 1)
assert.equal(blank.preview.story, null)
assert.equal(blank.preview.sceneLayers.length, 0)
assert.equal(blank.assets.length, 2)
assert.equal(blank.record.metadata?.starter, undefined)
let activated = false
await approveCandidate({ async activate() { activated = true; return {} as never } } as never, candidate.record.id, true)
assert.equal(activated, true)
assert.throws(
  () => assembleExperienceCandidate('changed-starter', draft, { ...resources, manifestSha256: '0'.repeat(64) }, characterResources, input, 1),
  (error) => error instanceof ExperienceCandidateValidationError && error.diagnostics[0]?.code === 'starter_mismatch',
)

const entry = (id: string, collection: string, data: Record<string, unknown>) => ({
  id, collection, status: 'published' as const, version: 1, data, createdAt: 1, updatedAt: 1,
})
const entriesById = new Map(candidate.entries.map(({ id, collection, data }) => [id, entry(id, collection, data)]))
const runId = candidate.record.metadata!.runId
let storedRun = entriesById.get(runId)!
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
    return { run: storedRun, event: entry(`event:${storedRun.version}`, 'progress-events', commit.eventData), replayed: false }
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

const expectDiagnostic = (changed: ExperienceCandidateInput, code: string) => assert.throws(
  () => assembleExperienceCandidate(`bad-${code}`, draft, resources, characterResources, changed, 1),
  (error) => error instanceof ExperienceCandidateValidationError && error.diagnostics[0]?.code === code,
)
const invalidCandidates: Array<[string, (changed: ExperienceCandidateInput) => void]> = [
  ['missing_skeleton_metric', (changed) => { changed.metrics = {} }],
  ['initial_scene_mismatch', (changed) => { changed.stages[0]!.scene = { compositionId: 'scene:invented' } }],
  ['ambiguous_phrase', (changed) => { changed.stages[1]!.actions[0]!.phrases = ['PRACTICE'] }],
  ['unknown_flag', (changed) => { changed.stages[0]!.actions[0]!.effects.push({ type: 'setFlag', flagId: 'invented', value: true }) }],
  ['unknown_stage_target', (changed) => { changed.rules[0]!.effects = [{ type: 'changeStage', stageId: 'missing' }] }],
  ['unknown_item_definition', (changed) => {
    changed.stages[0]!.actions[0]!.effects.push({ type: 'grantItem', inventoryId: 'map-1', definitionId: 'missing-map', quantity: 1 })
  }],
  ['duplicate_progress_binding', (changed) => {
    changed.stages[0]!.progress.push(structuredClone(changed.stages[0]!.progress[0]!))
  }],
  ['unreachable_stage', (changed) => {
    changed.stages.push({ id: 'unreachable', title: 'Unreachable', narrative: 'Never reached.', agentFallback: true, scene, actions: [], progress: [] })
    changed.rules.push({
      ruleId: 'after-terminal', priority: 1, when: { fact: 'stage', id: 'journey-complete' }, effects: [{ type: 'changeStage', stageId: 'unreachable' }],
    })
  }],
]
for (const [code, mutate] of invalidCandidates) {
  const changed = structuredClone(input)
  mutate(changed)
  expectDiagnostic(changed, code)
}

const continuousDraft = structuredClone(draft)
continuousDraft.story!.seed.completionMode = 'continuous'
const terminalOnly = structuredClone(input)
terminalOnly.seed.completionMode = 'continuous'
terminalOnly.stages = [{
  id: 'study-session', title: 'Already done', narrative: 'Done.', terminal: true, scene, actions: [], progress: [],
}]
terminalOnly.initialStageId = 'study-session'
terminalOnly.rules = []
assert.throws(
  () => assembleExperienceCandidate('bad-continuous', continuousDraft, resources, characterResources, terminalOnly, 1),
  (error) => error instanceof ExperienceCandidateValidationError && error.diagnostics[0]?.code === 'missing_continuing_route',
)

console.log('experience: ok')
