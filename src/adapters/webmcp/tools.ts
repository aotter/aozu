import type { AgentCapability } from '../../core/application/ports.ts'
import { CHARACTER_VARIANT_GROUPS, type CharacterAssetTarget, type CharacterVariantGroup, type CharacterVariantLayer } from '../../core/domain/character.ts'

type ModelContext = {
  registerTool(tool: {
    name: string
    title: string
    description: string
    inputSchema: object
    annotations?: { readOnlyHint?: boolean }
    execute(input: Record<string, unknown>): Promise<unknown>
  }, options?: { signal?: AbortSignal }): Promise<void>
}

type WebMcpDocument = Document & { modelContext?: ModelContext }

export function createAgentCapability(document: Document): AgentCapability {
  return {
    isAvailable: () => Boolean((document as WebMcpDocument).modelContext),
  }
}

export function registerCompanionTools(document: Document, useCases: {
  inspectExperience(): Promise<unknown>
  submitExperience(input: { draftId: string; expectedRevision: number; idempotencyKey: string; candidate: unknown }): Promise<unknown>
  inspect(): Promise<unknown>
  inspectCharacter(): Promise<unknown>
  submitCharacterAsset(input: { target: CharacterAssetTarget; filename: string; dataUrl: string }): Promise<unknown>
  submit(input: { actionId: string; expectedRevision: number; idempotencyKey: string }): Promise<unknown>
  resolve(input: { turnId: string; idempotencyKey: string; dialogue: string; effects: unknown }): Promise<unknown>
}) {
  const modelContext = (document as WebMcpDocument).modelContext
  if (!modelContext) return null
  const controller = new AbortController()
  void Promise.all([
    modelContext.registerTool({
      name: 'inspect_experience_contract',
      title: 'Inspect Experience Contract',
      description: 'Required first step for authoring an experience. Returns the selected immutable Starter identity, exact Experience Draft revision, Direction and Experience Seed, available visual references, incomplete Playbook skeleton, supported vocabulary, and validation limits. No runnable Companion exists until a complete candidate is validated and the user approves it.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => useCases.inspectExperience(),
    }, { signal: controller.signal }),
    modelContext.registerTool({
      name: 'submit_experience_candidate',
      title: 'Submit Experience Candidate',
      description: 'Submit one complete declarative Playbook for the exact inspected draft revision. Starter assets, fixed manifests, handlers, and application code cannot be replaced. Invalid or stale submissions return diagnostics without staging. A valid candidate remains inactive until explicit user review and approval.',
      inputSchema: {
        type: 'object',
        properties: {
          draftId: { type: 'string', minLength: 1 },
          expectedRevision: { type: 'integer', minimum: 0 },
          idempotencyKey: { type: 'string', minLength: 1, maxLength: 100 },
          candidate: {
            type: 'object',
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 200 },
              initialStageId: { type: 'string', minLength: 1, maxLength: 100 },
              metrics: { type: 'object', additionalProperties: { type: 'number' } },
              flags: { type: 'object', additionalProperties: { type: 'boolean' } },
              itemDefinitions: { type: 'array', maxItems: 100, items: { type: 'object' } },
              stages: {
                type: 'array',
                minItems: 1,
                maxItems: 100,
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', minLength: 1, maxLength: 100 },
                    title: { type: 'string', minLength: 1, maxLength: 500 },
                    narrative: { type: 'string', minLength: 1, maxLength: 8000 },
                    terminal: { type: 'boolean' },
                    agentFallback: { type: 'boolean' },
                    scene: {
                      type: 'object',
                      properties: {
                        compositionId: { type: 'string', minLength: 1 },
                        characterStateId: { type: 'string', minLength: 1 },
                      },
                      required: ['compositionId'],
                      additionalProperties: false,
                    },
                    actions: {
                      type: 'array',
                      maxItems: 50,
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', minLength: 1, maxLength: 100 },
                          label: { type: 'string', minLength: 1, maxLength: 200 },
                          phrases: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 500 } },
                          effects: { type: 'array', maxItems: 50, items: { type: 'object' } },
                        },
                        required: ['id', 'label'],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ['id', 'title', 'narrative', 'actions'],
                  additionalProperties: false,
                },
              },
              rules: {
                type: 'array',
                maxItems: 100,
                items: {
                  type: 'object',
                  properties: {
                    ruleId: { type: 'string', minLength: 1, maxLength: 100 },
                    priority: { type: 'integer' },
                    when: { type: 'object' },
                    effects: { type: 'array', maxItems: 50, items: { type: 'object' } },
                  },
                  required: ['ruleId', 'priority', 'when', 'effects'],
                  additionalProperties: false,
                },
              },
            },
            required: ['name', 'initialStageId', 'metrics', 'stages'],
            additionalProperties: false,
          },
        },
        required: ['draftId', 'expectedRevision', 'idempotencyKey', 'candidate'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input) => useCases.submitExperience({
        draftId: String(input.draftId),
        expectedRevision: Number(input.expectedRevision),
        idempotencyKey: String(input.idempotencyKey),
        candidate: input.candidate,
      }),
    }, { signal: controller.signal }),
    modelContext.registerTool({
      name: 'inspect_character_contract',
      title: 'Inspect Character Contract',
      description: 'Required first step before generating or changing character art. Returns the exact rig and production brief. Generate and preprocess assets outside the website, then submit only final 512×768 RGBA PNG layers. The website validates but never removes backgrounds, resizes, realigns, or repairs images.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => useCases.inspectCharacter(),
    }, { signal: controller.signal }),
    modelContext.registerTool({
      name: 'submit_character_asset_candidate',
      title: 'Submit Character Asset Candidate',
      description: 'Fill one layer of a character variant with a final PNG candidate. Inspect the contract first. A variant belongs to body, expression, outfit, or prop. Props are independent, multi-select, full-canvas overlays placed anywhere relative to the canonical character and may contain front and back layers. Send a data:image/png;base64 URL only after producing an exact 512×768 RGBA image with real transparency. Whole-head expressions include the complete aligned head, hairstyle, and facial hair. This stages a draft candidate only and never approves or activates it.',
      inputSchema: {
        type: 'object',
        properties: {
          group: { type: 'string', enum: CHARACTER_VARIANT_GROUPS },
          variantId: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,39}$' },
          label: { type: 'string', minLength: 1, maxLength: 80 },
          layer: { type: 'string', enum: ['body', 'head', 'back', 'front'] },
          filename: { type: 'string', minLength: 1, maxLength: 200 },
          dataUrl: { type: 'string', pattern: '^data:image/png;base64,', maxLength: 7_100_000 },
        },
        required: ['group', 'variantId', 'label', 'layer', 'filename', 'dataUrl'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input) => useCases.submitCharacterAsset({
        target: {
          group: String(input.group) as CharacterVariantGroup,
          variantId: String(input.variantId),
          label: String(input.label),
          layer: String(input.layer) as CharacterVariantLayer,
        },
        filename: String(input.filename),
        dataUrl: String(input.dataUrl),
      }),
    }, { signal: controller.signal }),
    modelContext.registerTool({
      name: 'inspect_companion',
      title: 'Inspect Companion',
      description: 'Required first step for Companion interaction. Read the current stage, revision, prepared actions, and persisted pending user turns. When a pending turn exists, act as the character and call resolve_companion_turn; put the character response in the website instead of printing it in agent chat.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => useCases.inspect(),
    }, { signal: controller.signal }),
    modelContext.registerTool({
      name: 'submit_companion_action',
      title: 'Submit Companion Action',
      description: 'Execute one prepared website action with the exact current revision. The website validates and atomically records effects and progress. Inspect first; never invent action IDs or revisions.',
      inputSchema: {
        type: 'object',
        properties: {
          actionId: { type: 'string', minLength: 1 },
          expectedRevision: { type: 'integer', minimum: 0 },
          idempotencyKey: { type: 'string', minLength: 1, maxLength: 100 },
        },
        required: ['actionId', 'expectedRevision', 'idempotencyKey'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input) => useCases.submit({
        actionId: String(input.actionId),
        expectedRevision: Number(input.expectedRevision),
        idempotencyKey: String(input.idempotencyKey),
      }),
    }, { signal: controller.signal }),
    modelContext.registerTool({
      name: 'resolve_companion_turn',
      title: 'Resolve Companion Turn',
      description: 'Write the character response and validated effects directly into the website for one persisted pending turn. Keep your normal agent personality outside the tool; apply the Companion character voice only to dialogue. Do not repeat the dialogue in agent chat after this succeeds.',
      inputSchema: {
        type: 'object',
        properties: {
          turnId: { type: 'string', minLength: 1 },
          idempotencyKey: { type: 'string', minLength: 1, maxLength: 100 },
          dialogue: { type: 'string', minLength: 1, maxLength: 8000 },
          effects: {
            type: 'array',
            maxItems: 50,
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['addMetric', 'setFlag', 'changeStage', 'grantItem', 'consumeItem', 'equipItem', 'unequipItem', 'setItemState', 'setAppearanceOverride'] },
                metricId: { type: 'string' },
                amount: { type: 'number' },
                flagId: { type: 'string' },
                value: { type: 'boolean' },
                stageId: { type: 'string' },
                inventoryId: { type: 'string' },
                definitionId: { type: 'string' },
                quantity: { type: 'integer', minimum: 1 },
                slot: { type: 'string' },
                state: { type: 'object' },
                appearance: {
                  type: ['object', 'null'],
                  properties: {
                    packId: { type: 'string' },
                    packVersion: { type: 'integer', minimum: 1 },
                    appearanceId: { type: 'string' },
                  },
                  additionalProperties: false,
                },
              },
              required: ['type'],
              additionalProperties: false,
            },
          },
        },
        required: ['turnId', 'idempotencyKey', 'dialogue', 'effects'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input) => useCases.resolve({
        turnId: String(input.turnId),
        idempotencyKey: String(input.idempotencyKey),
        dialogue: String(input.dialogue),
        effects: input.effects,
      }),
    }, { signal: controller.signal }),
  ]).catch((error) => console.error('WebMCP registration failed', error))
  return () => controller.abort()
}
