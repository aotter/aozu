import assert from 'node:assert/strict'
import { runtimeDiagnostic } from '@aotter/mantle-spec'

import { createAgentCapability, registerMantleWebMcpTools } from '../src/adapters/webmcp/tools.ts'
import { compileAuthoringBackbone, compileFixedBackbone } from '../src/core/mantle/backbone.ts'

type RegisteredTool = {
  name: string
  title?: string
  description: string
  inputSchema: object
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
const calls: Array<{ trigger: string; input: unknown }> = []
const invoke = async (trigger: string, input: unknown) => {
  calls.push({ trigger, input })
  return { ok: true as const, data: { trigger, input } }
}
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
assert.equal(registered.has('query_view_current_stage'), false)
assert.equal(registered.get('inspect_companion')?.annotations.readOnlyHint, true)
assert.equal(registered.get('submit_companion_action')?.annotations.readOnlyHint, false)
assert.equal(registered.get('inspect_companion')?.title, play.procedures['inspect-companion']?.manifest.spec.title)
assert.equal(registered.get('inspect_companion')?.description, play.procedures['inspect-companion']?.manifest.spec.description)
assert.deepEqual(registered.get('submit_experience_candidate')?.inputSchema, authoring.procedures['submit-experience-candidate']?.manifest.spec.input)
const submitted = { actionId: 'go', expectedRevision: 0, idempotencyKey: 'once' }
assert.deepEqual(await registered.get('submit_companion_action')!.execute(submitted), {
  trigger: 'submit-companion-action', input: submitted,
})
assert.equal(calls[0]?.input, submitted)

const diagnosticDocument = {
  modelContext: { async registerTool(tool: RegisteredTool) { registered.set(tool.name, tool) } },
} as unknown as Document
await registerMantleWebMcpTools(diagnosticDocument, play, async () => ({
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
