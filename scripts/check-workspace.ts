import assert from 'node:assert/strict'

import { workspaceNavigation, workspacePhase } from '../src/core/application/workspace.ts'

assert.equal(workspacePhase('/character/expressions'), 'character')
assert.equal(workspacePhase('/companion'), 'play')
assert.deepEqual(
  workspaceNavigation({ characterReady: false, experienceReady: false, pendingReview: false, activeCompanion: false }).map(({ id }) => id),
  ['start', 'starter', 'character-expressions', 'character-outfits', 'character-props'],
)
assert.deepEqual(
  workspaceNavigation({ characterReady: true, experienceReady: true, pendingReview: true, activeCompanion: true }).map(({ id }) => id),
  ['start', 'starter', 'character-expressions', 'character-outfits', 'character-props', 'character-review', 'create', 'experience-review', 'play'],
)

console.log('workspace: ok')
