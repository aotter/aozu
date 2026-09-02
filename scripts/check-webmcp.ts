import assert from 'node:assert/strict'
import { runtimeDiagnostic } from '@aotter/mantle-spec'
import type { WebMcpTool } from '@aotter/mantle-web/webmcp'

import { createWebMcpController } from '../src/adapters/webmcp/controller.ts'
import { bindMantleWebMcpTools, createAgentCapability } from '../src/adapters/webmcp/tools.ts'
import { compileAuthoringBackbone } from '../src/core/mantle/backbone.ts'

const plan = compileAuthoringBackbone()
const triggers = new Set(['inspect-workspace', 'navigate-character', 'inspect-character-contract', 'submit-character-asset-candidate', 'set-character-variant-transform'])
assert.equal(createAgentCapability({} as Document).isAvailable(), false)
assert.equal(await bindMantleWebMcpTools({} as Document, plan, async () => ({ ok: true, data: null }), triggers), null)

const registered = new Map<string, WebMcpTool>()
let registrationSignal: AbortSignal | undefined
const view = {
  location: { pathname: '/characters' },
  addEventListener() {},
  removeEventListener() {},
}
const document = {
  defaultView: view,
  modelContext: {
    async registerTool(tool: WebMcpTool, options: { signal: AbortSignal }) {
      registered.set(tool.name, tool)
      registrationSignal = options.signal
    },
  },
} as unknown as Document
assert.equal(createAgentCapability(document).isAvailable(), true)

let navigated: string | undefined
const invoke = async (trigger: string, input: unknown) => ({
  ok: true as const,
  data: trigger === 'navigate-character'
    ? { status: 'ok', data: { trigger, input }, effects: { navigation: { path: '/characters/id/outfits/raincoat', mode: 'push', reason: 'review' } } }
    : { status: 'ok', data: { trigger, input } },
})
const controller = createWebMcpController(document, plan, [...triggers], invoke)
await controller.ready
assert.deepEqual(controller.getState(), { status: 'ready', toolCount: 5 })
assert.deepEqual([...registered.keys()].sort(), [
  'inspect_character_contract',
  'inspect_workspace',
  'navigate_character',
  'set_character_variant_transform',
  'submit_character_asset_candidate',
])
assert.deepEqual([
  registered.get('inspect_workspace')?.annotations.readOnlyHint,
  registered.get('submit_character_asset_candidate')?.annotations.readOnlyHint,
], [true, false])
const navigation = { destination: 'character-outfits', characterId: 'id', variantId: 'raincoat' }
assert.deepEqual(await registered.get('navigate_character')!.execute(navigation, {}), {
  status: 'ok', data: { trigger: 'navigate-character', input: navigation }, effects: { navigation: { path: '/characters/id/outfits/raincoat', mode: 'push', reason: 'review' } },
})
assert.equal(navigated, undefined)
controller.setNavigate((path) => { navigated = path })
assert.equal(navigated, '/characters/id/outfits/raincoat')
const boundSignal = registrationSignal
controller.dispose()
assert.equal(boundSignal?.aborted, true)

const incomplete = createWebMcpController(document, plan, [...triggers, 'missing-trigger'], invoke)
await incomplete.ready
assert.equal(incomplete.getState().status, 'failed')
incomplete.dispose()

registered.clear()
await bindMantleWebMcpTools(document, plan, async () => ({
  ok: false,
  diagnostic: runtimeDiagnostic({ code: 'CONFLICT', severity: 'error', path: 'character/revision', message: 'stale' }),
}), new Set(['navigate-character']))
await assert.rejects(registered.get('navigate_character')!.execute({ destination: 'characters' }, {}), /stale/)

console.log('webmcp: ok')
