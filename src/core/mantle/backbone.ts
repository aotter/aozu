import { linkManifestSet, parseManifestSources, type Diagnostic, type ManifestSource } from "@aotter/mantle-spec"
import { compileRuntimePlan, type RuntimePlan } from "@aotter/mantle-runtime"

const source = (sourceId: string, manifest: object): ManifestSource => ({
  sourceId,
  text: JSON.stringify(manifest),
})

const envelope = (kind: string, name: string, spec: object) => ({
  apiVersion: "cms.mantle.aotter.net/v1",
  kind,
  metadata: { name },
  spec,
})

const objectSchema = (properties: object, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
})

const actionSchema = objectSchema(
  {
    id: { type: "string", minLength: 1 },
    label: { type: "string", minLength: 1 },
  },
  ["id", "label"],
)

const progressSchema = objectSchema(
  {
    id: { type: "string", minLength: 1 },
    label: { type: "string", minLength: 1 },
    value: { type: ["string", "number"] },
    max: { type: "number" },
  },
  ["id", "label", "value"],
)

export const FIXED_BACKBONE_VERSION = "1"

export const FIXED_BACKBONE_SOURCES = [
  source(
    "fixed/run.yaml",
    envelope(
      "Schema",
      "runs",
      {
        title: "Runs",
        lifecycle: "operational",
        schema: objectSchema(
          {
            currentStageId: { type: "string", minLength: 1 },
            revision: { type: "integer", minimum: 0 },
            status: { enum: ["active", "completed", "blocked"] },
            currentDialogueId: { type: "string" },
          },
          ["currentStageId", "revision", "status"],
        ),
      },
    ),
  ),
  source(
    "fixed/stage.yaml",
    envelope(
      "Schema",
      "stages",
      {
        title: "Stages",
        lifecycle: "operational",
        schema: objectSchema(
          {
            title: { type: "string", minLength: 1 },
            narrative: { type: "string" },
            actions: { type: "array", items: actionSchema },
            progress: { type: "array", items: progressSchema },
            scene: {
              type: "object",
              properties: {
                backgroundAssetId: { type: "string" },
                characterStateId: { type: "string" },
              },
              additionalProperties: false,
            },
            terminal: { type: "boolean" },
            agentFallback: { type: "boolean" },
          },
          ["title", "narrative", "actions", "progress"],
        ),
      },
    ),
  ),
  source(
    "fixed/progress-event.yaml",
    envelope(
      "Schema",
      "progress-events",
      {
        title: "Progress events",
        lifecycle: "operational",
        indexes: [["runId", "createdAtMs"]],
        schema: objectSchema(
          {
            runId: { type: "string", minLength: 1 },
            actionId: { type: "string", minLength: 1 },
            idempotencyKey: { type: "string", minLength: 1, "x-mcp-hint": "idempotency-key" },
            summary: { type: "string" },
            createdAtMs: { type: "integer", minimum: 0, "x-mcp-hint": "timestamp-ms" },
          },
          ["runId", "actionId", "idempotencyKey", "createdAtMs"],
        ),
      },
    ),
  ),
  source(
    "fixed/current-stage.yaml",
    envelope("View", "current-stage", {
      from: "stages",
      surface: "public",
      fields: ["title", "narrative", "actions", "progress", "terminal"],
      limit: 1,
    }),
  ),
  source(
    "fixed/submit-action.yaml",
    envelope("Procedure", "submit-action", {
      input: objectSchema(
        {
          runId: { type: "string", minLength: 1 },
          actionId: { type: "string", minLength: 1 },
          expectedRevision: { type: "integer", minimum: 0 },
          idempotencyKey: { type: "string", minLength: 1, "x-mcp-hint": "idempotency-key" },
          text: { type: "string" },
        },
        ["runId", "actionId", "expectedRevision", "idempotencyKey"],
      ),
      output: objectSchema({
        stageId: { type: "string" },
        revision: { type: "integer" },
        status: { enum: ["active", "completed", "blocked"] },
        title: { type: "string" },
        narrative: { type: "string" },
        actions: { type: "array", items: actionSchema },
        progress: { type: "array", items: progressSchema },
      }),
      handler: { kind: "ref", ref: "companion.submit-action" },
    }),
  ),
  source(
    "fixed/submit-action-mcp.yaml",
    envelope("Trigger", "submit-action-mcp", {
      source: { kind: "mcp", surface: "public" },
      target: { procedure: "submit-action" },
    }),
  ),
] as const satisfies readonly ManifestSource[]

const diagnosticError = (phase: string, diagnostics: readonly Diagnostic[]) =>
  new Error(`${phase}: ${diagnostics.map(({ code, path }) => `${code}@${path}`).join(", ")}`)

export function compileFixedBackbone(): RuntimePlan {
  const parsed = parseManifestSources({ sources: FIXED_BACKBONE_SOURCES })
  if (!parsed.ok) throw diagnosticError("parse", parsed.diagnostics)

  const linked = linkManifestSet(parsed.value)
  if (!linked.ok) throw diagnosticError("link", linked.diagnostics)

  const compiled = compileRuntimePlan(linked.value)
  if (!compiled.ok) throw diagnosticError("compile", compiled.diagnostics)
  return compiled.value
}
