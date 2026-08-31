import assert from "node:assert/strict"
import { EntryDataValidator } from "@aotter/mantle-spec"
import { compileFixedBackbone, FIXED_BACKBONE_VERSION } from "../src/core/mantle/backbone.ts"

const plan = compileFixedBackbone()

assert.equal(FIXED_BACKBONE_VERSION, "5")
assert.deepEqual(Object.keys(plan.schemas).sort(), ["character-loadouts", "character-packs", "character-states", "experience-drafts", "inventory-items", "item-definitions", "journal-entries", "pending-agent-turns", "progress-events", "rules", "runs", "scene-assets", "scene-compositions", "stages"])
assert.equal(plan.views["current-stage"]?.query.kind, "declarative")
assert.equal(plan.procedures["submit-action"]?.manifest.spec.handler.kind, "ref")
assert.equal(plan.triggers["select-experience-draft"]?.target, "select-experience-draft")
assert.equal(plan.triggers["submit-experience-candidate"]?.target, "submit-experience-candidate")
assert.ok(plan.mcpTools.some(({ name }) => name === "submit_action"))
assert.ok(new EntryDataValidator().validate(plan.schemas.stages!.manifest, { title: "Bad scene", narrative: "", actions: [], progress: [], scene: {} }).length)
assert.equal(new EntryDataValidator().validate(plan.schemas.rules!.manifest, {
  ruleId: 'recursive', priority: 1,
  when: { all: [{ fact: 'metric', id: 'xp', op: 'gte', value: 1 }, { not: { fact: 'flag', id: 'done', value: true } }] },
  effects: [{ type: 'changeStage', stageId: 'complete' }],
}).length, 0)
assert.ok(new EntryDataValidator().validate(plan.schemas.rules!.manifest, {
  ruleId: 'open', priority: 1,
  when: { fact: 'metric', id: 'xp', op: 'gte', value: 1, surprise: true },
  effects: [],
}).length)
assert.ok(new EntryDataValidator().validate(plan.schemas.stages!.manifest, {
  title: 'Bad effect', narrative: '', actions: [{ id: 'go', label: 'Go', effects: [{ type: 'invented' }] }], progress: [],
}).length)
assert.equal(new EntryDataValidator().validate(plan.schemas.runs!.manifest, {
  currentStageId: 'start', revision: 0, status: 'active', currentDialogue: 'Hello', metrics: {}, flags: {},
}).length, 0)
assert.ok(new EntryDataValidator().validate(plan.schemas.runs!.manifest, {
  currentStageId: 'start', revision: 0, status: 'active', currentDialogueId: 'legacy',
}).length)
assert.equal(plan.httpRoutes.length, 0)

console.log("backbone: ok")
