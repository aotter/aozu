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
    phrases: { type: "array", items: { type: "string", minLength: 1 } },
    effects: { type: "array", items: { type: "object" } },
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

export const FIXED_BACKBONE_VERSION = "2"

export const FIXED_BACKBONE_SOURCES = [
  source(
    "fixed/item-definition.yaml",
    envelope(
      "Schema",
      "item-definitions",
      {
        title: "Item definitions",
        lifecycle: "operational",
        schema: objectSchema({ definition: { type: "object" } }, ["definition"]),
      },
    ),
  ),
  source(
    "fixed/inventory-item.yaml",
    envelope(
      "Schema",
      "inventory-items",
      {
        title: "Inventory items",
        lifecycle: "operational",
        indexes: [["definitionId"]],
        schema: objectSchema(
          {
            definitionId: { type: "string", minLength: 1 },
            quantity: { type: "integer", minimum: 1 },
            state: { type: "object" },
          },
          ["definitionId", "quantity", "state"],
        ),
      },
    ),
  ),
  source(
    "fixed/character-loadout.yaml",
    envelope(
      "Schema",
      "character-loadouts",
      {
        title: "Character loadouts",
        lifecycle: "operational",
        indexes: [["runId"]],
        schema: objectSchema(
          {
            runId: { type: "string", minLength: 1 },
            equipment: { type: "object" },
            appearanceOverrides: { type: "object" },
          },
          ["runId", "equipment", "appearanceOverrides"],
        ),
      },
    ),
  ),
  source(
    "fixed/character-pack.yaml",
    envelope(
      "Schema",
      "character-packs",
      {
        title: "Character packs",
        lifecycle: "operational",
        schema: objectSchema(
          {
            pack: { type: "object" },
          },
          ["pack"],
        ),
      },
    ),
  ),
  source(
    "fixed/character-state.yaml",
    envelope(
      "Schema",
      "character-states",
      {
        title: "Character states",
        lifecycle: "operational",
        schema: objectSchema(
          {
            packId: { type: "string", minLength: 1 },
            packVersion: { type: "integer", minimum: 1 },
            composition: { type: "array", items: { type: "object" } },
          },
          ["packId", "packVersion", "composition"],
        ),
      },
    ),
  ),
  source(
    "fixed/journal-entry.yaml",
    envelope(
      "Schema",
      "journal-entries",
      {
        title: "Journal entries",
        lifecycle: "operational",
        schema: objectSchema(
          {
            content: { type: "string", minLength: 1, maxLength: 100000 },
          },
          ["content"],
        ),
      },
    ),
  ),
  source(
    "fixed/pending-agent-turn.yaml",
    envelope(
      "Schema",
      "pending-agent-turns",
      {
        title: "Pending agent turns",
        lifecycle: "operational",
        indexes: [["runId"]],
        schema: objectSchema(
          {
            runId: { type: "string", minLength: 1 },
            nodeId: { type: "string", minLength: 1 },
            userText: { type: "string", minLength: 1, maxLength: 4000 },
            expectedRevision: { type: "integer", minimum: 0 },
            status: { type: "string", enum: ["pending", "resolved", "failed"] },
            createdAtMs: { type: "integer", minimum: 0 },
            resolutionDialogue: { type: "string" },
            resolutionEventId: { type: "string" },
          },
          ["runId", "nodeId", "userText", "expectedRevision", "status", "createdAtMs"],
        ),
      },
    ),
  ),
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
            metrics: { type: "object", additionalProperties: { type: "number" } },
            flags: { type: "object", additionalProperties: { type: "boolean" } },
          },
          ["currentStageId", "revision", "status"],
        ),
      },
    ),
  ),
  source(
    "fixed/rule.yaml",
    envelope(
      "Schema",
      "rules",
      {
        title: "Rules",
        lifecycle: "operational",
        indexes: [["priority", "ruleId"]],
        schema: objectSchema(
          {
            ruleId: { type: "string", minLength: 1 },
            priority: { type: "integer" },
            when: { type: "object" },
            effects: { type: "array", items: { type: "object" } },
          },
          ["ruleId", "priority", "when", "effects"],
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
