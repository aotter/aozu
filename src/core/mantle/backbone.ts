import { linkManifestSet, parseManifestSources, type Diagnostic, type JsonSchema, type ManifestSource } from "@aotter/mantle-spec"
import { compileRuntimePlan, type RuntimePlan } from "@aotter/mantle-runtime"
import {
  CONDITION_REF,
  EFFECT_SCHEMA,
  PLAYBOOK_LIMITS,
  PLAYBOOK_SCHEMA_DEFS,
  PROGRESS_LOOP_IDS,
  PROGRESS_BINDING_SCHEMA,
} from '../domain/playbook.ts'

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

const objectSchema = (properties: Readonly<Record<string, JsonSchema>>, required: string[] = []): JsonSchema => ({
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
    effects: { type: "array", maxItems: PLAYBOOK_LIMITS.effectsPerActionOrRule, items: EFFECT_SCHEMA },
  },
  ["id", "label"],
)

const progressSchema = PROGRESS_BINDING_SCHEMA

const sceneReferenceSchema = objectSchema({
  compositionId: { type: "string", minLength: 1 },
  characterStateId: { type: "string" },
}, ["compositionId"])

const experienceSeedSchema = objectSchema(
  {
    kind: { enum: ["story", "task"] },
    directionId: { type: "string", minLength: 1 },
    loopIds: { type: "array", minItems: 1, items: { enum: PROGRESS_LOOP_IDS } },
    completionMode: { enum: ["finite", "continuous"] },
    brief: { type: "string", minLength: 1, maxLength: 8000 },
  },
  ["kind", "directionId", "loopIds", "completionMode", "brief"],
)

const directionSchema = objectSchema(
  {
    id: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    summary: { type: "string", minLength: 1 },
    seed: experienceSeedSchema,
    characterStateId: { type: "string", minLength: 1 },
    sceneCompositionId: { type: "string", minLength: 1 },
  },
  ["id", "name", "summary", "seed", "characterStateId", "sceneCompositionId"],
)

const experienceDraftProperties = {
  schemaVersion: { const: 1 },
  revision: { type: "integer", minimum: 0 },
  starter: objectSchema(
    {
      id: { type: "string", minLength: 1 },
      version: { type: "integer", minimum: 1 },
      name: { type: "string", minLength: 1 },
      manifestSha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
    },
    ["id", "version", "name", "manifestSha256"],
  ),
  direction: directionSchema,
  seed: experienceSeedSchema,
  characterStateId: { type: "string", minLength: 1 },
  sceneCompositionId: { type: "string", minLength: 1 },
  lastSubmission: objectSchema(
    {
      idempotencyKey: { type: "string", minLength: 1, maxLength: 100 },
      bundleId: { type: "string", minLength: 1 },
    },
    ["idempotencyKey", "bundleId"],
  ),
}

const experienceDraftRequired = ["schemaVersion", "revision", "starter", "direction", "seed", "characterStateId", "sceneCompositionId"]
const experienceDraftCreateProperties = {
  schemaVersion: experienceDraftProperties.schemaVersion,
  revision: experienceDraftProperties.revision,
  starter: experienceDraftProperties.starter,
  direction: experienceDraftProperties.direction,
  seed: experienceDraftProperties.seed,
  characterStateId: experienceDraftProperties.characterStateId,
  sceneCompositionId: experienceDraftProperties.sceneCompositionId,
}

export const FIXED_BACKBONE_VERSION = "5"

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
    "fixed/experience-draft.yaml",
    envelope(
      "Schema",
      "experience-drafts",
      {
        title: "Experience drafts",
        lifecycle: "operational",
        schema: objectSchema(experienceDraftProperties, experienceDraftRequired),
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
            currentDialogue: { type: "string", maxLength: PLAYBOOK_LIMITS.dialogueLength },
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
        schema: {
          ...objectSchema(
          {
            ruleId: { type: "string", minLength: 1 },
            priority: { type: "integer" },
            when: CONDITION_REF,
            effects: { type: "array", maxItems: PLAYBOOK_LIMITS.effectsPerActionOrRule, items: EFFECT_SCHEMA },
          },
          ["ruleId", "priority", "when", "effects"],
          ),
          $defs: PLAYBOOK_SCHEMA_DEFS,
        },
      },
    ),
  ),
  source(
    "fixed/scene-asset.yaml",
    envelope(
      "Schema",
      "scene-assets",
      {
        title: "Scene assets",
        lifecycle: "operational",
        schema: objectSchema(
          {
            blobId: { type: "string", minLength: 1 },
            mediaType: { enum: ["image/png", "image/jpeg", "image/webp"] },
            width: { type: "integer", minimum: 1 },
            height: { type: "integer", minimum: 1 },
            size: { type: "integer", minimum: 1 },
            sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
          },
          ["blobId", "mediaType", "width", "height", "size", "sha256"],
        ),
      },
    ),
  ),
  source(
    "fixed/scene-composition.yaml",
    envelope(
      "Schema",
      "scene-compositions",
      {
        title: "Scene compositions",
        lifecycle: "operational",
        schema: objectSchema(
          {
            layers: {
              type: "array",
              minItems: 1,
              maxItems: 32,
              items: objectSchema(
                {
                  id: { type: "string", minLength: 1 },
                  assetId: { type: "string", minLength: 1 },
                  plane: { enum: ["back", "front"] },
                  order: { type: "integer" },
                },
                ["id", "assetId", "plane", "order"],
              ),
            },
          },
          ["layers"],
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
            scene: sceneReferenceSchema,
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
      fields: ["title", "narrative", "scene", "actions", "progress", "terminal", "agentFallback"],
      limit: 1,
    }),
  ),
  source(
    "fixed/select-experience-draft.yaml",
    envelope("Procedure", "select-experience-draft", {
      input: objectSchema(experienceDraftCreateProperties, experienceDraftRequired),
      output: { type: "object" },
      handler: { kind: "builtin", op: "create", schema: "experience-drafts" },
    }),
  ),
  source(
    "fixed/select-experience-draft-mcp.yaml",
    envelope("Trigger", "select-experience-draft", {
      source: { kind: "mcp", surface: "staff" },
      target: { procedure: "select-experience-draft" },
    }),
  ),
  source(
    "fixed/submit-experience-candidate.yaml",
    envelope("Procedure", "submit-experience-candidate", {
      input: objectSchema(
        {
          draftId: { type: "string", minLength: 1 },
          expectedRevision: { type: "integer", minimum: 0 },
          idempotencyKey: { type: "string", minLength: 1, maxLength: 100 },
          candidateJson: { type: "string", minLength: 2, maxLength: 1_000_000 },
        },
        ["draftId", "expectedRevision", "idempotencyKey", "candidateJson"],
      ),
      output: objectSchema(
        {
          bundleId: { type: "string", minLength: 1 },
          revision: { type: "integer", minimum: 1 },
          replayed: { type: "boolean" },
        },
        ["bundleId", "revision", "replayed"],
      ),
      handler: { kind: "ref", ref: "companion.submit-experience-candidate" },
    }),
  ),
  source(
    "fixed/submit-experience-candidate-mcp.yaml",
    envelope("Trigger", "submit-experience-candidate", {
      source: { kind: "mcp", surface: "public" },
      target: { procedure: "submit-experience-candidate" },
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
        scene: sceneReferenceSchema,
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
