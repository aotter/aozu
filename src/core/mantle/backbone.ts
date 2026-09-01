import type { JsonSchema, ManifestSource } from "@aotter/mantle-spec"
import type { RuntimePlan } from "@aotter/mantle-runtime"
import {
  EFFECT_SCHEMA,
  EXPERIENCE_CANDIDATE_SCHEMA,
  PLAYBOOK_RULE_SCHEMA,
  PLAYBOOK_LIMITS,
  PLAYBOOK_SCHEMA_DEFS,
  PREPARED_ACTION_SCHEMA,
  PROGRESS_LOOP_IDS,
  PROGRESS_BINDING_SCHEMA,
} from '../domain/playbook.ts'
import { CHARACTER_VARIANT_GROUPS } from '../domain/character.ts'
import { compileBundle } from '../bundle.ts'

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

const actionSchema = PREPARED_ACTION_SCHEMA

const progressSchema = PROGRESS_BINDING_SCHEMA

const sceneReferenceSchema = objectSchema({
  compositionId: { type: "string", minLength: 1 },
  characterStateId: { type: "string", minLength: 1 },
})

const emptyReadOnlyInput = { ...objectSchema({}), readOnly: true }

const nextActionSchema = objectSchema({
  tool: { type: 'string', minLength: 1 },
  required: { type: 'boolean' },
  reason: { type: 'string', minLength: 1 },
}, ['tool', 'required'])

const toolResultSchema = objectSchema({
  status: { const: 'ok' },
  data: { type: 'object' },
  nextActions: { type: 'array', items: nextActionSchema },
}, ['status', 'data'])

const stageProjectionSchema = objectSchema({
  stageId: { type: 'string', minLength: 1 },
  revision: { type: 'integer', minimum: 0 },
  status: { enum: ['active', 'completed', 'blocked'] },
  agentFallback: { type: 'boolean' },
  title: { type: 'string' },
  narrative: { type: 'string' },
  scene: sceneReferenceSchema,
  actions: { type: 'array', items: objectSchema({ id: { type: 'string' }, label: { type: 'string' } }, ['id', 'label']) },
  progress: {
    type: 'array',
    items: objectSchema({
      id: { type: 'string' }, label: { type: 'string' }, value: { type: ['string', 'number'] }, max: { type: 'number' },
    }, ['id', 'label', 'value']),
  },
}, ['stageId', 'revision', 'status', 'agentFallback', 'title', 'narrative', 'actions', 'progress'])

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
    sceneCompositionId: { type: "string", minLength: 1 },
  },
  ["id", "name", "summary", "seed", "sceneCompositionId"],
)

const starterIdentitySchema = objectSchema(
  {
    id: { type: "string", minLength: 1 },
    version: { type: "integer", minimum: 1 },
    name: { type: "string", minLength: 1 },
    manifestSha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
  },
  ["id", "version", "name", "manifestSha256"],
)

const storySelectionSchema: JsonSchema = {
  oneOf: [
    { type: "null" },
    objectSchema(
      {
        starter: starterIdentitySchema,
        direction: directionSchema,
        seed: experienceSeedSchema,
        sceneCompositionId: { type: "string", minLength: 1 },
      },
      ["starter", "direction", "seed", "sceneCompositionId"],
    ),
  ],
}

const appearanceRefSchema = objectSchema({
  packId: { type: 'string', minLength: 1 },
  packVersion: { type: 'integer', minimum: 1 },
  appearanceId: { type: 'string', minLength: 1 },
}, ['packId', 'packVersion', 'appearanceId'])

const experienceDraftProperties = {
  schemaVersion: { const: 1 },
  revision: { type: "integer", minimum: 0 },
  character: {
    oneOf: [
      { type: 'null' },
      objectSchema({
        packId: { type: 'string', minLength: 1 },
        packVersion: { type: 'integer', minimum: 1 },
        composition: { type: 'array', minItems: 1, items: appearanceRefSchema },
      }, ['packId', 'packVersion', 'composition']),
    ],
  },
  story: storySelectionSchema,
  lastSubmission: objectSchema(
    {
      idempotencyKey: { type: "string", minLength: 1, maxLength: 100 },
      bundleId: { type: "string", minLength: 1 },
    },
    ["idempotencyKey", "bundleId"],
  ),
}

const experienceDraftRequired = ["schemaVersion", "revision", "story"]
const experienceDraftCreateProperties = {
  schemaVersion: experienceDraftProperties.schemaVersion,
  revision: experienceDraftProperties.revision,
  character: experienceDraftProperties.character,
  story: experienceDraftProperties.story,
}

export const FIXED_BACKBONE_VERSION = "6"

const ALL_BACKBONE_SOURCES = [
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
    "authoring/experience-draft.yaml",
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
        schema: PLAYBOOK_RULE_SCHEMA,
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
    "authoring/select-experience-draft.yaml",
    envelope("Procedure", "select-experience-draft", {
      title: 'Select Experience Draft',
      description: 'Persist the selected Story starting point, or Blank, as the current Experience Draft. Character artwork normally comes from the editable Character Draft and may explicitly reference an installed local Character Pack.',
      input: objectSchema(experienceDraftCreateProperties, experienceDraftRequired),
      output: { type: "object" },
      handler: { kind: "builtin", op: "create", schema: "experience-drafts" },
    }),
  ),
  source(
    "authoring/select-experience-draft-mcp.yaml",
    envelope("Trigger", "select-experience-draft", {
      source: { kind: "mcp", surface: "staff" },
      target: { procedure: "select-experience-draft" },
    }),
  ),
  source(
    'authoring/create-local-companion.yaml',
    envelope('Procedure', 'create-local-companion', {
      title: 'Create Local Companion',
      description: 'Validate and activate the selected Character and Starter Playbook without agent participation.',
      input: objectSchema({}),
      output: toolResultSchema,
      handler: { kind: 'ref', ref: 'companion.create-local-companion' },
    }),
  ),
  source(
    'authoring/create-local-companion-trigger.yaml',
    envelope('Trigger', 'create-local-companion', {
      source: { kind: 'mcp', surface: 'staff' },
      target: { procedure: 'create-local-companion' },
    }),
  ),
  source(
    'authoring/inspect-experience-contract.yaml',
    envelope('Procedure', 'inspect-experience-contract', {
      title: 'Inspect Experience Contract',
      description: 'Required first step when an agent customizes an experience. Returns the exact Experience Draft revision, selected character resources, optional Story seed and scene resources, Playbook skeleton, vocabulary, and limits. The local creation flow can activate a Starter Playbook without agent participation.',
      input: emptyReadOnlyInput,
      output: toolResultSchema,
      handler: { kind: 'ref', ref: 'companion.inspect-experience-contract' },
    }),
  ),
  source(
    'authoring/inspect-experience-contract-mcp.yaml',
    envelope('Trigger', 'inspect-experience-contract', {
      source: { kind: 'mcp', surface: 'public' },
      target: { procedure: 'inspect-experience-contract' },
    }),
  ),
  source(
    "authoring/submit-experience-candidate.yaml",
    envelope('Procedure', 'submit-experience-candidate', {
      title: 'Submit Experience Candidate',
      description: 'Submit one complete declarative Playbook for the exact inspected Experience revision and selected character resources. Selected Story assets, fixed manifests, handlers, and application code cannot be replaced. Invalid or stale submissions return diagnostics without staging. A valid candidate remains inactive until explicit user review and approval.',
      input: {
        ...objectSchema({
          draftId: { type: "string", minLength: 1 },
          expectedRevision: { type: "integer", minimum: 0 },
          expectedCharacterUpdatedAt: { type: "integer", minimum: 0 },
          idempotencyKey: { type: "string", minLength: 1, maxLength: 100 },
          candidate: EXPERIENCE_CANDIDATE_SCHEMA,
        }, ['draftId', 'expectedRevision', 'expectedCharacterUpdatedAt', 'idempotencyKey', 'candidate']),
        $defs: PLAYBOOK_SCHEMA_DEFS,
      },
      output: toolResultSchema,
      handler: { kind: 'ref', ref: 'companion.submit-experience-candidate' },
    }),
  ),
  source(
    "authoring/submit-experience-candidate-mcp.yaml",
    envelope("Trigger", "submit-experience-candidate", {
      source: { kind: "mcp", surface: "public" },
      target: { procedure: "submit-experience-candidate" },
    }),
  ),
  source(
    'authoring/inspect-character-contract.yaml',
    envelope('Procedure', 'inspect-character-contract', {
      title: 'Inspect Character Contract',
      description: 'Required first step before generating or changing character art. Returns the exact rig and production brief. Generate and preprocess assets outside the website, then submit only final 512×768 RGBA PNG layers. The website validates but never removes backgrounds, resizes, realigns, or repairs images.',
      input: emptyReadOnlyInput,
      output: toolResultSchema,
      handler: { kind: 'ref', ref: 'companion.inspect-character-contract' },
    }),
  ),
  source(
    'authoring/inspect-character-contract-mcp.yaml',
    envelope('Trigger', 'inspect-character-contract', {
      source: { kind: 'mcp', surface: 'public' },
      target: { procedure: 'inspect-character-contract' },
    }),
  ),
  source(
    'authoring/submit-character-asset-candidate.yaml',
    envelope('Procedure', 'submit-character-asset-candidate', {
      title: 'Submit Character Asset Candidate',
      description: 'Fill one layer of a character variant with a final PNG candidate. Inspect the contract first. A variant belongs to body, expression, outfit, or prop. Props are independent, multi-select, full-canvas overlays placed anywhere relative to the canonical character and may contain front and back layers. Send a data:image/png;base64 URL only after producing an exact 512×768 RGBA image with real transparency. Whole-head expressions include the complete aligned head, hairstyle, and facial hair. This stages a draft candidate only and never approves or activates it.',
      input: objectSchema({
        group: { enum: CHARACTER_VARIANT_GROUPS },
        variantId: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,39}$' },
        label: { type: 'string', minLength: 1, maxLength: 80 },
        layer: { enum: ['body', 'head', 'back', 'front'] },
        filename: { type: 'string', minLength: 1, maxLength: 200 },
        dataUrl: { type: 'string', pattern: '^data:image/png;base64,', maxLength: 7_100_000 },
      }, ['group', 'variantId', 'label', 'layer', 'filename', 'dataUrl']),
      output: toolResultSchema,
      handler: { kind: 'ref', ref: 'companion.submit-character-asset-candidate' },
    }),
  ),
  source(
    'authoring/submit-character-asset-candidate-mcp.yaml',
    envelope('Trigger', 'submit-character-asset-candidate', {
      source: { kind: 'mcp', surface: 'public' },
      target: { procedure: 'submit-character-asset-candidate' },
    }),
  ),
  source(
    'fixed/inspect-companion.yaml',
    envelope('Procedure', 'inspect-companion', {
      title: 'Inspect Companion',
      description: 'Required first step for Companion interaction. Read the current stage, revision, prepared actions, and persisted pending user turns. When a pending turn exists, act as the character and call resolve_companion_turn; put the character response in the website instead of printing it in agent chat.',
      input: emptyReadOnlyInput,
      output: toolResultSchema,
      handler: { kind: 'ref', ref: 'companion.inspect-companion' },
    }),
  ),
  source(
    'fixed/inspect-companion-mcp.yaml',
    envelope('Trigger', 'inspect-companion', {
      source: { kind: 'mcp', surface: 'public' },
      target: { procedure: 'inspect-companion' },
    }),
  ),
  source(
    'fixed/submit-companion-action.yaml',
    envelope('Procedure', 'submit-companion-action', {
      title: 'Submit Companion Action',
      description: 'Execute one prepared website action with the exact current revision. The website validates and atomically records effects and progress. Inspect first; never invent action IDs or revisions.',
      input: objectSchema({
          actionId: { type: "string", minLength: 1 },
          expectedRevision: { type: "integer", minimum: 0 },
          idempotencyKey: { type: "string", minLength: 1, maxLength: 100, "x-mcp-hint": "idempotency-key" },
      }, ['actionId', 'expectedRevision', 'idempotencyKey']),
      output: stageProjectionSchema,
      handler: { kind: 'ref', ref: 'companion.submit-companion-action' },
    }),
  ),
  source(
    'fixed/submit-companion-action-mcp.yaml',
    envelope('Trigger', 'submit-companion-action', {
      source: { kind: 'mcp', surface: 'public' },
      target: { procedure: 'submit-companion-action' },
    }),
  ),
  source(
    'fixed/resolve-companion-turn.yaml',
    envelope('Procedure', 'resolve-companion-turn', {
      title: 'Resolve Companion Turn',
      description: 'Write the character response and validated effects directly into the website for one persisted pending turn. Keep your normal agent personality outside the tool; apply the Companion character voice only to dialogue. Do not repeat the dialogue in agent chat after this succeeds.',
      input: objectSchema({
        turnId: { type: 'string', minLength: 1 },
        idempotencyKey: { type: 'string', minLength: 1, maxLength: 100 },
        dialogue: { type: 'string', minLength: 1, maxLength: PLAYBOOK_LIMITS.dialogueLength },
        effects: { type: 'array', maxItems: PLAYBOOK_LIMITS.effectsPerTransaction, items: EFFECT_SCHEMA },
      }, ['turnId', 'idempotencyKey', 'dialogue', 'effects']),
      output: toolResultSchema,
      handler: { kind: 'ref', ref: 'companion.resolve-companion-turn' },
    }),
  ),
  source(
    'fixed/resolve-companion-turn-mcp.yaml',
    envelope('Trigger', 'resolve-companion-turn', {
      source: { kind: 'mcp', surface: 'public' },
      target: { procedure: 'resolve-companion-turn' },
    }),
  ),
] as const satisfies readonly ManifestSource[]

export const AUTHORING_BACKBONE_SOURCES = ALL_BACKBONE_SOURCES.filter(({ sourceId }) => sourceId.startsWith('authoring/'))
export const FIXED_BACKBONE_SOURCES = ALL_BACKBONE_SOURCES.filter(({ sourceId }) => sourceId.startsWith('fixed/'))

const compileBackbone = (sources: readonly ManifestSource[]): RuntimePlan =>
  compileBundle(Object.fromEntries(sources.map(({ sourceId, text }) => [sourceId, text])))

export const compileAuthoringBackbone = () => compileBackbone(AUTHORING_BACKBONE_SOURCES)
export const compileFixedBackbone = () => compileBackbone(FIXED_BACKBONE_SOURCES)
