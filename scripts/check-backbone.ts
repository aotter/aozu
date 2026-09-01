import assert from "node:assert/strict"
import { EntryDataValidator } from "@aotter/mantle-spec"
import { compileAuthoringBackbone, compileFixedBackbone, FIXED_BACKBONE_VERSION } from "../src/core/mantle/backbone.ts"

const plan = compileFixedBackbone()
const authoring = compileAuthoringBackbone()

assert.equal(FIXED_BACKBONE_VERSION, "6")
assert.deepEqual(Object.keys(plan.schemas).sort(), ["character-loadouts", "character-packs", "character-states", "inventory-items", "item-definitions", "journal-entries", "pending-agent-turns", "progress-events", "rules", "runs", "scene-assets", "scene-compositions", "stages"])
assert.deepEqual(Object.keys(authoring.schemas), ['experience-drafts'])
assert.equal(plan.views["current-stage"]?.query.kind, "declarative")
assert.deepEqual(Object.keys(plan.procedures).sort(), ['inspect-companion', 'resolve-companion-turn', 'submit-companion-action'])
assert.equal(plan.procedures["submit-companion-action"]?.manifest.spec.handler.kind, "ref")
assert.equal(authoring.triggers["select-experience-draft"]?.target, "select-experience-draft")
assert.equal(authoring.triggers['inspect-workspace']?.target, 'inspect-workspace')
assert.equal(authoring.triggers['navigate-companion']?.target, 'navigate-companion')
assert.equal(authoring.triggers['create-local-companion']?.target, 'create-local-companion')
assert.equal(authoring.triggers["submit-experience-candidate"]?.target, "submit-experience-candidate")
const validate = (collection: keyof typeof plan.schemas, data: Record<string, unknown>) =>
  new EntryDataValidator().validate(plan.schemas[collection]!.manifest, data)
assert.equal(validate('rules', {
  ruleId: 'recursive', priority: 1,
  when: { all: [{ fact: 'metric', id: 'xp', op: 'gte', value: 1 }, { not: { fact: 'flag', id: 'done', value: true } }] },
  effects: [{ type: 'changeStage', stageId: 'complete' }],
}).length, 0)
assert.ok(validate('stages', {
  title: 'Bad effect', narrative: '', actions: [{ id: 'go', label: 'Go', effects: [{ type: 'invented' }] }], progress: [],
}).length)
assert.equal(validate('runs', {
  currentStageId: 'start', revision: 0, status: 'active', currentDialogue: 'Hello', metrics: {}, flags: {},
}).length, 0)
assert.ok(validate('runs', {
  currentStageId: 'start', revision: 0, status: 'active', currentDialogueId: 'legacy',
}).length)
assert.equal(plan.httpRoutes.length, 0)

console.log("backbone: ok")
