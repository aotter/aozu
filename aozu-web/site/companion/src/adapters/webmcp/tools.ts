import type { AgentCapability } from '../../core/application/ports.ts'
import { CHARACTER_VARIANT_GROUPS, type CharacterAssetTarget, type CharacterVariantGroup, type CharacterVariantLayer } from '../../core/domain/character.ts'
import { ADVENTURE_SCORE_KEY, parseAdventureScores } from '../../../adventure.ts'

export const AOZU_ACTIVITIES = ['meals', 'money', 'steps', 'travel', 'fitness', 'writing', 'room-shooter', 'forest-runner'] as const

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
  inspect(): Promise<unknown>
  inspectCharacter(): Promise<unknown>
  submitCharacterAsset(input: { target: CharacterAssetTarget; filename: string; dataUrl: string }): Promise<unknown>
  submit(input: { actionId: string; expectedRevision: number; idempotencyKey: string }): Promise<unknown>
  resolve(input: { turnId: string; idempotencyKey: string; dialogue: string; effects: unknown }): Promise<unknown>
}) {
  const modelContext = (document as WebMcpDocument).modelContext
  if (!modelContext) return null
  const controller = new AbortController()
  const sendUiCommand = (detail: Record<string, unknown>) => {
    document.defaultView?.dispatchEvent(new CustomEvent('aozu-ui-command', { detail }))
  }
  void Promise.all([
    modelContext.registerTool({
      name: 'open_aozu_dialogue',
      title: 'Open AOZU Companion Dialogue',
      description: 'Open the normally collapsed AOZU dialogue in the website so the user can continue an interaction with the active companion. Use this whenever browser guidance, pasted information, writing, travel planning, or another user reply is needed.',
      inputSchema: {
        type: 'object',
        properties: { message: { type: 'string', minLength: 1, maxLength: 800 } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      async execute(input) {
        sendUiCommand({ command: 'open-dialogue', message: typeof input.message === 'string' ? input.message : '' })
        return { status: 'ok', data: { dialogue: 'open' } }
      },
    }, { signal: controller.signal }),
    modelContext.registerTool({
      name: 'start_aozu_activity',
      title: 'Start AOZU Activity',
      description: 'Guide the active companion into a life task, shared writing, travel planning, or one of the playable room and forest adventures. The website opens the needed dialogue or game view for the user.',
      inputSchema: {
        type: 'object',
        properties: {
          activity: { type: 'string', enum: AOZU_ACTIVITIES },
          message: { type: 'string', maxLength: 800 },
        },
        required: ['activity'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      async execute(input) {
        const activity = String(input.activity)
        if (!AOZU_ACTIVITIES.includes(activity as (typeof AOZU_ACTIVITIES)[number])) throw new Error('Unknown AOZU activity')
        sendUiCommand({ command: 'start-activity', activity, message: typeof input.message === 'string' ? input.message : '' })
        return { status: 'ok', data: { activity } }
      },
    }, { signal: controller.signal }),
    modelContext.registerTool({
      name: 'inspect_aozu_adventure_scores',
      title: 'Inspect AOZU Adventure Scores',
      description: 'Read the locally stored best scores for the room rubber-band shooter and forest jump adventure.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      async execute() {
        const storage = document.defaultView?.localStorage
        return { status: 'ok', data: parseAdventureScores(storage?.getItem(ADVENTURE_SCORE_KEY) ?? null) }
      },
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
