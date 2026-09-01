import assert from 'node:assert/strict'

import { createAgentCapability, registerCompanionTools } from '../src/adapters/webmcp/tools.ts'

assert.equal(createAgentCapability({} as Document).isAvailable(), false)
const names: string[] = []
const document = { modelContext: { async registerTool(tool: { name: string }) { names.push(tool.name) } } } as unknown as Document
assert.equal(createAgentCapability(document).isAvailable(), true)
registerCompanionTools(document, { async inspect() {}, async inspectCharacter() {}, async submitCharacterAsset() {}, async submit() {}, async resolve() {} })
await Promise.resolve()
assert.deepEqual(names.sort(), ['inspect_aozu_adventure_scores', 'inspect_character_contract', 'inspect_companion', 'open_aozu_dialogue', 'resolve_companion_turn', 'start_aozu_activity', 'submit_character_asset_candidate', 'submit_companion_action'])
console.log('webmcp: ok')
