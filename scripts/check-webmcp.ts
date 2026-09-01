import assert from 'node:assert/strict'
import { runtimeDiagnostic } from '@aotter/mantle-spec'
import type { WebMcpTool } from '@aotter/mantle-web/webmcp'

import { bindMantleWebMcpTools, createAgentCapability } from '../src/adapters/webmcp/tools.ts'
import { compileAuthoringBackbone, compileFixedBackbone } from '../src/core/mantle/backbone.ts'

const authoring = compileAuthoringBackbone()
const play = compileFixedBackbone()
assert.equal(createAgentCapability({} as Document).isAvailable(), false)
assert.equal(await bindMantleWebMcpTools({} as Document, authoring, async () => ({ ok: true, data: null })), null)

const registered = new Map<string, WebMcpTool>()
let registrationSignal: AbortSignal | undefined
const document = {
  modelContext: {
    async registerTool(tool: WebMcpTool, options: { signal: AbortSignal }) {
      registered.set(tool.name, tool)
      registrationSignal = options.signal
    },
  },
} as unknown as Document
assert.equal(createAgentCapability(document).isAvailable(), true)
const invoke = async (trigger: string, input: unknown) => ({ ok: true as const, data: { trigger, input } })
await bindMantleWebMcpTools(document, authoring, invoke)
const dispose = await bindMantleWebMcpTools(document, play, invoke)
assert.deepEqual([...registered.keys()].sort(), [
  'inspect_character_contract',
  'inspect_companion',
  'inspect_experience_contract',
  'inspect_workspace',
  'navigate_companion',
  'resolve_companion_turn',
  'set_character_variant_transform',
  'submit_character_asset_candidate',
  'submit_companion_action',
  'submit_experience_candidate',
])
assert.deepEqual([
  registered.get('inspect_companion')?.annotations.readOnlyHint,
  registered.get('submit_companion_action')?.annotations.readOnlyHint,
], [true, false])
const submitted = { actionId: 'go', expectedRevision: 0, idempotencyKey: 'once' }
assert.deepEqual(await registered.get('submit_companion_action')!.execute(submitted, {}), {
  trigger: 'submit-companion-action', input: submitted,
})
const boundSignal = registrationSignal
dispose?.()
assert.equal(boundSignal?.aborted, true)

await bindMantleWebMcpTools(document, play, async () => ({
  ok: false,
  diagnostic: runtimeDiagnostic({ code: 'CONFLICT', severity: 'error', path: 'run/revision', message: 'stale' }),
}))
await assert.rejects(registered.get('submit_companion_action')!.execute(submitted, {}), /stale/)

console.log('webmcp: ok')
