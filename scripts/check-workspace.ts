import assert from 'node:assert/strict'

import { activeDraftId, workspaceNavigation, workspacePath, workspacePhase } from '../src/core/application/workspace.ts'

assert.equal(workspacePhase('/character/expressions'), 'character')
assert.equal(workspacePhase('/drafts/demo/character/body'), 'character')
assert.equal(workspacePhase('/drafts/08ff9df7-09e7-4f31-8303-ef3ccaf0e164/character/expressions'), 'character')
assert.equal(workspacePhase('/companion'), 'play')
assert.equal(activeDraftId('/drafts/08ff9df7-09e7-4f31-8303-ef3ccaf0e164/create'), '08ff9df7-09e7-4f31-8303-ef3ccaf0e164')
assert.equal(activeDraftId('/drafts/%/create'), null)
assert.equal(workspacePath('character-props', 'draft/with spaces'), '/drafts/draft%2Fwith%20spaces/character/props')
assert.equal(workspacePath('start', 'ignored'), '/start')
assert.deepEqual(
  workspaceNavigation({ characterReady: false, experienceReady: false, pendingReview: false, activeCompanion: false }).map(({ id }) => id),
  ['start', 'starter', 'character-body', 'character-expressions', 'character-outfits', 'character-props'],
)
assert.deepEqual(
  workspaceNavigation({ characterReady: true, experienceReady: true, pendingReview: true, activeCompanion: true }).map(({ id }) => id),
  ['start', 'starter', 'character-body', 'character-expressions', 'character-outfits', 'character-props', 'character-review', 'create', 'experience-review', 'play'],
)

console.log('workspace: ok')
