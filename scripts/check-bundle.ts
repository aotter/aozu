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
assert.equal(validateBundle({ ...record, semanticFingerprint: "legacy-fingerprint" }).record.semanticFingerprint, 'legacy-fingerprint')
const v2Record = {
  ...record,
  identity: {
    ...record.identity,
    contractVersion: 2 as const,
    loopIds: ['mastery', 'journey'] as import('../src/core/domain/playbook.ts').ProgressLoopId[],
    completionMode: 'finite' as const,
  },
}
assert.equal(validateBundle(v2Record).plan.semanticFingerprint, plan.semanticFingerprint)
assert.throws(() => validateBundle({ ...v2Record, semanticFingerprint: "tampered" }), /fingerprint/)
console.log("bundle: ok")
