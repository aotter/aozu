import assert from 'node:assert/strict'
import { runtimeDiagnostic } from '@aotter/mantle-spec'

import { createAgentCapability, registerMantleWebMcpTools } from '../src/adapters/webmcp/tools.ts'
import { compileAuthoringBackbone, compileFixedBackbone } from '../src/core/mantle/backbone.ts'

type RegisteredTool = {
  name: string
  annotations: { readOnlyHint?: boolean }
  execute(input: Record<string, unknown>): Promise<unknown>
}

const authoring = compileAuthoringBackbone()
const play = compileFixedBackbone()
assert.equal(createAgentCapability({} as Document).isAvailable(), false)
assert.equal(await registerMantleWebMcpTools({} as Document, authoring, async () => ({ ok: true, data: null })), null)

const registered = new Map<string, RegisteredTool>()
const document = {
  modelContext: {
    async registerTool(tool: RegisteredTool) { registered.set(tool.name, tool) },
  },
} as unknown as Document
assert.equal(createAgentCapability(document).isAvailable(), true)
const invoke = async (trigger: string, input: unknown) => ({ ok: true as const, data: { trigger, input } })
await registerMantleWebMcpTools(document, authoring, invoke)
await registerMantleWebMcpTools(document, play, invoke)
assert.deepEqual([...registered.keys()].sort(), [
  'inspect_character_contract',
  'inspect_companion',
  'inspect_experience_contract',
  'resolve_companion_turn',
  'submit_character_asset_candidate',
  'submit_companion_action',
  'submit_experience_candidate',
])
assert.deepEqual([
  registered.get('inspect_companion')?.annotations.readOnlyHint,
  registered.get('submit_companion_action')?.annotations.readOnlyHint,
], [true, false])
const submitted = { actionId: 'go', expectedRevision: 0, idempotencyKey: 'once' }
assert.deepEqual(await registered.get('submit_companion_action')!.execute(submitted), {
  trigger: 'submit-companion-action', input: submitted,
})

await registerMantleWebMcpTools(document, play, async () => ({
  ok: false,
  diagnostic: runtimeDiagnostic({ code: 'CONFLICT', severity: 'error', path: 'run/revision', message: 'stale' }),
}))
assert.deepEqual(await registered.get('submit_companion_action')!.execute(submitted), {
  status: 'error',
  diagnostics: [runtimeDiagnostic({ code: 'CONFLICT', severity: 'error', path: 'run/revision', message: 'stale' })],
})

let rejectedSignal: AbortSignal | undefined
const rejectingDocument = {
  modelContext: {
    async registerTool(tool: RegisteredTool, options?: { signal?: AbortSignal }) {
      rejectedSignal = options?.signal
      if (tool.name === 'submit_experience_candidate') throw new Error('registration rejected')
    },
  },
} as unknown as Document
await assert.rejects(registerMantleWebMcpTools(rejectingDocument, authoring, invoke), /registration rejected/)
assert.equal(rejectedSignal?.aborted, true)

console.log('webmcp: ok')
