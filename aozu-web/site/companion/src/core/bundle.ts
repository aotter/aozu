import { linkManifestSet, parseManifestSources, type Diagnostic } from "@aotter/mantle-spec"
import { compileRuntimePlan, type RuntimePlan } from "@aotter/mantle-runtime"

export interface BundleIdentity {
  contractVersion: 1
  backboneVersion: string
  templateId: string
  templateVersion: string
}

export interface BundleRecord {
  id: string
  manifestFiles: Readonly<Record<string, string>>
  semanticFingerprint: string
  identity: BundleIdentity
  createdAt: number
  metadata?: { name: string; runId: string }
}

export interface ValidatedBundle {
  record: BundleRecord
  plan: RuntimePlan
}

const diagnostics = (phase: string, values: readonly Diagnostic[]) =>
  new Error(`${phase}: ${values.map(({ code, path }) => `${code}@${path}`).join(", ")}`)

export function compileBundle(manifestFiles: Readonly<Record<string, string>>): RuntimePlan {
  const parsed = parseManifestSources({
    sources: Object.entries(manifestFiles)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([sourceId, text]) => ({ sourceId, text })),
  })
  if (!parsed.ok) throw diagnostics("parse", parsed.diagnostics)
  const linked = linkManifestSet(parsed.value)
  if (!linked.ok) throw diagnostics("link", linked.diagnostics)
  const compiled = compileRuntimePlan(linked.value)
  if (!compiled.ok) throw diagnostics("compile", compiled.diagnostics)
  return compiled.value
}

export function validateBundle(record: BundleRecord): ValidatedBundle {
  if (!record.id || record.identity.contractVersion !== 1) throw new Error("Unsupported bundle identity")
  const plan = compileBundle(record.manifestFiles)
  if (plan.semanticFingerprint !== record.semanticFingerprint) throw new Error("Bundle fingerprint mismatch")
  return { record, plan }
}
