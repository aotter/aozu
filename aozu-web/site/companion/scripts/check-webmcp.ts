import assert from 'node:assert/strict'

import { createAgentCapability, registerCompanionTools } from '../src/adapters/webmcp/tools.ts'

assert.equal(createAgentCapability({} as Document).isAvailable(), false)
const names: string[] = []
const commands: unknown[] = []
const tools: Array<{ name: string; execute(input: Record<string, unknown>): Promise<unknown> }> = []
const storage = new Map<string, string>([['aozu:p0-ability-cards', JSON.stringify([{ id: 'origin-card-1' }])]])
const modelContext = { async registerTool(tool: { name: string; execute(input: Record<string, unknown>): Promise<unknown> }) { names.push(tool.name); tools.push(tool) } }
const document = {
  defaultView: { navigator: {}, localStorage: { getItem(key: string) { return storage.get(key) ?? null } }, dispatchEvent(event: CustomEvent) { commands.push(event.detail); return true } },
  modelContext,
} as unknown as Document
assert.equal(createAgentCapability(document).isAvailable(), true)
assert.equal(createAgentCapability({ defaultView: { navigator: { modelContext } } } as unknown as Document).isAvailable(), true)
registerCompanionTools(document, { async inspect() {}, async inspectCharacter() {}, async submitCharacterAsset() {}, async submit() {}, async resolve() {} })
await Promise.resolve()
assert.deepEqual(names.sort(), [
  'inspect_aozu_adventure_scores', 'inspect_aozu_capabilities', 'inspect_aozu_forge', 'inspect_character_contract', 'inspect_companion', 'open_aozu_dialogue', 'resolve_companion_turn',
  'stage_aozu_ability_card', 'stage_aozu_card_recall', 'stage_aozu_checklist_completion', 'stage_aozu_companion', 'stage_aozu_life_event', 'stage_aozu_memory', 'stage_aozu_outfit', 'stage_aozu_trip_plan', 'start_aozu_activity',
  'submit_character_asset_candidate', 'submit_companion_action',
])
const forge = tools.find(({ name }) => name === 'stage_aozu_companion')!
await forge.execute({ basePartnerId: 'otter', name: '小歐', personality: '好奇又可靠', role: '旅程夥伴', questKind: 'travel', questGoal: '完成週末旅行手札', steps: ['說出目的地', '補上位置', '完成一項清單'], starterItemId: 'voyage-cap', idempotencyKey: 'forge-demo-1' })
assert.deepEqual(commands.at(-1), { command: 'stage-proposal', proposal: { id: 'forge-demo-1', kind: 'forge', basePartnerId: 'otter', name: '小歐', personality: '好奇又可靠', role: '旅程夥伴', questKind: 'travel', questGoal: '完成週末旅行手札', steps: ['說出目的地', '補上位置', '完成一項清單'], starterItemId: 'voyage-cap', dialogue: undefined } })
await assert.rejects(() => forge.execute({ basePartnerId: 'otter', name: '小歐', personality: '好奇又可靠', role: '旅程夥伴', questKind: 'travel', questGoal: '完成週末旅行手札', steps: ['只有一步'], starterItemId: 'voyage-cap', idempotencyKey: 'forge-demo-2' }), /exactly three steps/)
const trip = tools.find(({ name }) => name === 'stage_aozu_trip_plan')!
await trip.execute({ title: '台南散步', stops: [{ day: 1, kind: 'food', name: '早餐店', location: '中西區' }], idempotencyKey: 'trip-demo-1' })
assert.deepEqual(commands.at(-1), { command: 'stage-proposal', proposal: { id: 'trip-demo-1', kind: 'travel', title: '台南散步', stops: [{ day: 1, kind: 'food', name: '早餐店', location: '中西區' }], dialogue: undefined } })
await assert.rejects(() => trip.execute({ title: '壞資料', stops: [{ day: 9, kind: 'food', name: '早餐店', location: '中西區' }], idempotencyKey: 'trip-demo-2' }), /Invalid stop/)
const outfit = tools.find(({ name }) => name === 'stage_aozu_outfit')!
await outfit.execute({ itemId: 'explorer-vest', idempotencyKey: 'outfit-demo-1' })
assert.deepEqual(commands.at(-1), { command: 'stage-proposal', proposal: { id: 'outfit-demo-1', kind: 'outfit', itemId: 'explorer-vest', dialogue: undefined } })
const life = tools.find(({ name }) => name === 'stage_aozu_life_event')!
await life.execute({ activity: 'fitness', summary: '完成十分鐘伸展', idempotencyKey: 'life-demo-1' })
assert.deepEqual(commands.at(-1), { command: 'stage-proposal', proposal: { id: 'life-demo-1', kind: 'life', activity: 'fitness', summary: '完成十分鐘伸展', dialogue: undefined } })
const checklist = tools.find(({ name }) => name === 'stage_aozu_checklist_completion')!
await checklist.execute({ entryId: 'stop-rice-cake', idempotencyKey: 'checklist-demo-1' })
assert.deepEqual(commands.at(-1), { command: 'stage-proposal', proposal: { id: 'checklist-demo-1', kind: 'checklist', entryId: 'stop-rice-cake', dialogue: undefined } })
const recall = tools.find(({ name }) => name === 'stage_aozu_card_recall')!
await recall.execute({ cardId: 'origin-card-1', idempotencyKey: 'recall-demo-1' })
assert.deepEqual(commands.at(-1), { command: 'stage-proposal', proposal: { id: 'recall-demo-1', kind: 'recall', cardId: 'origin-card-1', dialogue: undefined } })
await assert.rejects(() => recall.execute({ cardId: 'missing', idempotencyKey: 'recall-demo-2' }), /Unknown AOZU cardId/)
console.log('webmcp: ok')
