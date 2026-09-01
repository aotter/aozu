import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { loadStarterCatalog } from '../src/adapters/browser/starter-packages.ts'
import { buildCharacterPack, createCharacterDraftFromStarter, isCharacterDraftPopulated, resolveStarterCharacterLayers } from '../src/core/application/character-creation.ts'
import { resolveStarterSceneLayers } from '../src/core/application/scene.ts'
import { createExperienceDraftData } from '../src/core/domain/starter.ts'
import { inspectCharacterFixture, inspectSceneFixture, publicFile } from './starter-fixture.ts'

const fetcher = async (input: RequestInfo | URL) => {
  const pathname = new URL(String(input), 'http://localhost').pathname
  try {
    const bytes = await readFile(publicFile(pathname))
    const mediaType = pathname.endsWith('.json') ? 'application/json' : pathname.endsWith('.webp') ? 'image/webp' : 'image/png'
    return new Response(bytes, { status: 200, headers: { 'content-type': mediaType } })
  } catch {
    return new Response(null, { status: 404 })
  }
}

const packages = await loadStarterCatalog(fetcher, inspectCharacterFixture, inspectSceneFixture, '6')
assert.equal(packages.length, 1)
assert.equal(packages[0]!.starter.id, 'focus-studio')
assert.equal(packages[0]!.starter.scenePack.assets[0]!.mediaType, 'image/webp')
assert.deepEqual(packages[0]!.starter.directions[0]!.seed.loopIds, ['rhythm', 'mastery'])
assert.match(packages[0]!.manifestSha256, /^[0-9a-f]{64}$/)
const draft = createExperienceDraftData(packages[0]!, 'daily-study')
assert.equal(draft.revision, 0)
assert.equal(draft.starter.id, 'focus-studio')
assert.equal(draft.starter.manifestSha256, packages[0]!.manifestSha256)
assert.equal('assets' in draft, false)
assert.equal('stages' in draft, false)
const character = createCharacterDraftFromStarter(packages[0]!, 'daily-study')
assert.equal(isCharacterDraftPopulated(character), true)
assert.equal(buildCharacterPack(character).defaultComposition.length, 2)
assert.equal(character.variants.find(({ group, id }) => group === 'body' && id === 'base')!.layers.body!.source, 'starter')
assert.equal(character.variants.find(({ group, id }) => group === 'expression' && id === 'neutral')!.layers.head!.source, 'starter')
assert.deepEqual(resolveStarterCharacterLayers(packages[0]!, 'daily-study').map(({ slot }) => slot), ['character-skin', 'expression-head'])
assert.deepEqual(resolveStarterSceneLayers(packages[0]!, 'daily-study').map(({ plane }) => plane), ['back'])
console.log('starter packages: ok')
