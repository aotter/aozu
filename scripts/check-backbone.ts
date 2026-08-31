import assert from "node:assert/strict"
import { EntryDataValidator } from "@aotter/mantle-spec"
import { compileFixedBackbone, FIXED_BACKBONE_VERSION } from "../src/core/mantle/backbone.ts"

const plan = compileFixedBackbone()

assert.equal(FIXED_BACKBONE_VERSION, "3")
assert.deepEqual(Object.keys(plan.schemas).sort(), ["character-loadouts", "character-packs", "character-states", "inventory-items", "item-definitions", "journal-entries", "pending-agent-turns", "progress-events", "rules", "runs", "scene-assets", "scene-compositions", "stages"])
assert.equal(plan.views["current-stage"]?.query.kind, "declarative")
assert.equal(plan.procedures["submit-action"]?.manifest.spec.handler.kind, "ref")
assert.ok(plan.mcpTools.some(({ name }) => name === "submit_action"))
assert.ok(new EntryDataValidator().validate(plan.schemas.stages!.manifest, { title: "Bad scene", narrative: "", actions: [], progress: [], scene: {} }).length)
assert.equal(plan.httpRoutes.length, 0)

console.log("backbone: ok")
