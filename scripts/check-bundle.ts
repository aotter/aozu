import assert from "node:assert/strict"
import { compileBundle, validateBundle } from "../src/core/bundle.ts"
import { FIXED_BACKBONE_SOURCES, FIXED_BACKBONE_VERSION } from "../src/core/mantle/backbone.ts"

const manifestFiles = Object.fromEntries(FIXED_BACKBONE_SOURCES.map(({ sourceId, text }) => [sourceId, text]))
const plan = compileBundle(manifestFiles)
const record = {
  id: "check-bundle",
  manifestFiles,
  semanticFingerprint: plan.semanticFingerprint,
  identity: {
    contractVersion: 1 as const,
    backboneVersion: FIXED_BACKBONE_VERSION,
    templateId: "test-starter",
    templateVersion: "1",
  },
  createdAt: 1,
}

assert.equal(validateBundle(record).plan.semanticFingerprint, plan.semanticFingerprint)
assert.throws(() => validateBundle({ ...record, semanticFingerprint: "tampered" }), /fingerprint/)
console.log("bundle: ok")
