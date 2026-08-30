import assert from 'node:assert/strict'

import { createAgentCapability, registerCompanionTools } from '../src/adapters/webmcp/tools.ts'

assert.equal(createAgentCapability({} as Document).isAvailable(), false)
const names: string[] = []
const document = { modelContext: { async registerTool(tool: { name: string }) { names.push(tool.name) } } } as unknown as Document
assert.equal(createAgentCapability(document).isAvailable(), true)
registerCompanionTools(document, { async inspect() {}, async submit() {}, async resolve() {} })
await Promise.resolve()
assert.deepEqual(names.sort(), ['inspect_companion', 'resolve_companion_turn', 'submit_companion_action'])
console.log('webmcp: ok')
