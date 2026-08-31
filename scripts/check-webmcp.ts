import assert from 'node:assert/strict'

import { createAgentCapability, registerCompanionTools } from '../src/adapters/webmcp/tools.ts'

assert.equal(createAgentCapability({} as Document).isAvailable(), false)
const names: string[] = []
const document = { modelContext: { async registerTool(tool: { name: string }) { names.push(tool.name) } } } as unknown as Document
assert.equal(createAgentCapability(document).isAvailable(), true)
registerCompanionTools(document, { async inspectExperience() {}, async submitExperience() {}, async inspect() {}, async inspectCharacter() {}, async submitCharacterAsset() {}, async submit() {}, async resolve() {} })
await Promise.resolve()
assert.deepEqual(names.sort(), ['inspect_character_contract', 'inspect_companion', 'inspect_experience_contract', 'resolve_companion_turn', 'submit_character_asset_candidate', 'submit_companion_action', 'submit_experience_candidate'])
console.log('webmcp: ok')
