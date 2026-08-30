import assert from "node:assert/strict"
import { compileFixedBackbone } from "../src/core/mantle/backbone.ts"

const plan = compileFixedBackbone()

assert.deepEqual(Object.keys(plan.schemas).sort(), ["progress-events", "runs", "stages"])
assert.equal(plan.views["current-stage"]?.query.kind, "declarative")
assert.equal(plan.procedures["submit-action"]?.manifest.spec.handler.kind, "ref")
assert.ok(plan.mcpTools.some(({ name }) => name === "submit_action"))
assert.equal(plan.httpRoutes.length, 0)

console.log("backbone: ok")
