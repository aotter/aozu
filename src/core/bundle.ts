import { linkManifestSet, parseManifestSources, type Diagnostic } from "@aotter/mantle-spec"
import { compileRuntimePlan, type RuntimePlan } from "@aotter/mantle-runtime"

import { PROGRESS_LOOP_IDS, type ProgressLoopId } from './domain/playbook.ts'

export interface BundleIdentityV1 {
  contractVersion: 1
  backboneVersion: string
  templateId: string
  templateVersion: string
}

export interface BundleIdentityV2 {
  contractVersion: 2
  backboneVersion: string
  templateId: string
  templateVersion: string
  loopIds: ProgressLoopId[]
  completionMode: 'finite' | 'continuous'
}

export type BundleIdentity = BundleIdentityV1 | BundleIdentityV2

export interface BundleRecord {
  id: string
  manifestFiles: Readonly<Record<string, string>>
  semanticFingerprint: string
  identity: BundleIdentity
  createdAt: number
  metadata?: {
    name: string
    runId: string
    starter?: {
      id: string
      version: number
      manifestSha256: string
      directionId: string
      seed: import('./domain/starter.ts').ExperienceSeed
    }
  }
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
  if (!record.id || (record.identity.contractVersion !== 1 && record.identity.contractVersion !== 2)) throw new Error("Unsupported bundle identity")
  if (
    !record.identity.backboneVersion ||
    !record.identity.templateId ||
    !record.identity.templateVersion
  ) throw new Error('Invalid bundle identity')
  if (record.identity.contractVersion === 2 && (
    !record.identity.loopIds.length ||
    new Set(record.identity.loopIds).size !== record.identity.loopIds.length ||
    record.identity.loopIds.some((id) => !PROGRESS_LOOP_IDS.includes(id)) ||
    (record.identity.completionMode !== 'finite' && record.identity.completionMode !== 'continuous')
  )) throw new Error('Invalid version 2 bundle identity')
  const plan = compileBundle(record.manifestFiles)
  // Mantle alpha.13 can re-fingerprint legacy manifests; v1 keeps its original value for byte-stable export.
  if (record.identity.contractVersion === 2 && plan.semanticFingerprint !== record.semanticFingerprint) throw new Error("Bundle fingerprint mismatch")
  return { record, plan }
}
