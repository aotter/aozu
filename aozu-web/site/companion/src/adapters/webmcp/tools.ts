import type { AgentCapability } from '../../core/application/ports.ts'
import { CHARACTER_VARIANT_GROUPS, type CharacterAssetTarget, type CharacterVariantGroup, type CharacterVariantLayer } from '../../core/domain/character.ts'
import { ADVENTURE_SCORE_KEY, parseAdventureScores } from '../../../adventure.ts'
import { AOZU_FORGE_QUESTS, AOZU_FORGE_STARTER_ITEM_IDS, AOZU_PARTNERS, AOZU_WARDROBE_ITEMS } from '../../../aozu.ts'

export const AOZU_ACTIVITIES = ['meals', 'money', 'steps', 'travel', 'fitness', 'writing', 'room-shooter', 'forest-runner'] as const
const AOZU_LIFE_ACTIVITIES = ['meals', 'money', 'steps', 'fitness'] as const
const AOZU_MEMORY_CATEGORIES = ['life', 'travel', 'writing', 'learning', 'bond'] as const
const AOZU_FORGE_KEY = 'aozu:p0-forge-profile'

const readText = (value: unknown, label: string, maximum: number) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new Error(`Invalid ${label}`)
  return value.trim()
}

const readOptionalText = (value: unknown, label: string, maximum: number) => value === undefined ? undefined : readText(value, label, maximum)
const readIdempotencyKey = (value: unknown) => {
  const key = readText(value, 'idempotencyKey', 100)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(key)) throw new Error('Invalid idempotencyKey')
  return key
}

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
  const stageProposal = (proposal: Record<string, unknown>) => {
    sendUiCommand({ command: 'stage-proposal', proposal })
    return { status: 'ok', data: { proposalId: proposal.id, state: 'awaiting-user-confirmation' } }
  }
  void Promise.all([
    modelContext.registerTool({
      name: 'inspect_aozu_capabilities',
      title: 'Inspect AOZU Adventure Capabilities',
      description: 'Inspect the active AOZU Companion plus the activities, partners, wardrobe items, Companion Forge options, and human-confirmation rules available for an agent-led adventure. Use this before proposing character creation, life records, trips, outfits, memories, or ability cards.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      async execute() {
        return {
          status: 'ok',
          data: {
            current: await useCases.inspect(),
            activities: AOZU_ACTIVITIES,
            partners: AOZU_PARTNERS.map(({ id, displayName, role }) => ({ id, displayName, role })),
            wardrobe: AOZU_WARDROBE_ITEMS.map(({ id, label, theme, slot }) => ({ id, label, theme, slot })),
            forge: {
              questKinds: AOZU_FORGE_QUESTS.map(({ id, label, ability, rewardItemId }) => ({ id, label, ability, rewardItemId })),
              starterItemIds: AOZU_FORGE_STARTER_ITEM_IDS,
              loop: ['create-companion', 'complete-three-step-origin-quest', 'equip-reward', 'seal-origin-card'],
            },
            rule: 'WebMCP stages proposals. The user confirms them in AOZU before points, journals, outfits, memories, or cards change.',
          },
        }
      },
    }, { signal: controller.signal }),
    modelContext.registerTool({
      name: 'inspect_aozu_forge',
      title: 'Inspect AOZU Companion Forge',
      description: 'Read the current local Companion Forge profile and the exact creation options. Call this before staging a new companion. The normal AOZU form remains available when WebMCP is unavailable.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      async execute() {
        const storage = document.defaultView?.localStorage
        let profile: unknown = null
        try { profile = JSON.parse(storage?.getItem(AOZU_FORGE_KEY) ?? 'null') } catch { profile = null }
        return {
          status: 'ok',
          data: {
            profile,
            partners: AOZU_PARTNERS.map(({ id, displayName, role, personality }) => ({ id, displayName, role, personality })),
            quests: AOZU_FORGE_QUESTS,
            starterItems: AOZU_WARDROBE_ITEMS.filter(({ id }) => AOZU_FORGE_STARTER_ITEM_IDS.includes(id as (typeof AOZU_FORGE_STARTER_ITEM_IDS)[number])).map(({ id, label, slot }) => ({ id, label, slot })),
            confirmation: 'stage_aozu_companion only opens a visible review. The user must confirm in AOZU before a profile, quest, equipment, memory, or card changes.',
          },
        }
      },
    }, { signal: controller.signal }),
    modelContext.registerTool({
      name: 'stage_aozu_companion',
      title: 'Stage AOZU Companion',
      description: 'Propose one AOZU companion identity and its first three-step Origin Quest. Use only IDs returned by inspect_aozu_forge. This stages a visible preview; creation, initial equipment, and quest activation require explicit user confirmation in AOZU.',
      inputSchema: {
        type: 'object',
        properties: {
          basePartnerId: { type: 'string', enum: AOZU_PARTNERS.map(({ id }) => id) },
          name: { type: 'string', minLength: 1, maxLength: 24 },
          personality: { type: 'string', minLength: 2, maxLength: 120 },
          role: { type: 'string', minLength: 2, maxLength: 60 },
          questKind: { type: 'string', enum: AOZU_FORGE_QUESTS.map(({ id }) => id) },
          questGoal: { type: 'string', minLength: 4, maxLength: 120 },
          steps: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string', minLength: 2, maxLength: 80 } },
          starterItemId: { type: 'string', enum: AOZU_FORGE_STARTER_ITEM_IDS },
          dialogue: { type: 'string', minLength: 1, maxLength: 800 },
          idempotencyKey: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' },
        },
        required: ['basePartnerId', 'name', 'personality', 'role', 'questKind', 'questGoal', 'steps', 'starterItemId', 'idempotencyKey'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      async execute(input) {
        const basePartnerId = String(input.basePartnerId)
        const questKind = String(input.questKind)
        const starterItemId = String(input.starterItemId)
        if (!AOZU_PARTNERS.some(({ id }) => id === basePartnerId)) throw new Error('Unknown basePartnerId')
        if (!AOZU_FORGE_QUESTS.some(({ id }) => id === questKind)) throw new Error('Unknown questKind')
        if (!AOZU_FORGE_STARTER_ITEM_IDS.includes(starterItemId as (typeof AOZU_FORGE_STARTER_ITEM_IDS)[number])) throw new Error('Unknown starterItemId')
        if (!Array.isArray(input.steps) || input.steps.length !== 3) throw new Error('Origin Quest needs exactly three steps')
        return stageProposal({
          id: readIdempotencyKey(input.idempotencyKey),
          kind: 'forge',
          basePartnerId,
          name: readText(input.name, 'name', 24),
          personality: readText(input.personality, 'personality', 120),
          role: readText(input.role, 'role', 60),
          questKind,
          questGoal: readText(input.questGoal, 'questGoal', 120),
          steps: input.steps.map((value) => readText(value, 'step', 80)),
          starterItemId,
          dialogue: readOptionalText(input.dialogue, 'dialogue', 800),
        })
      },
    }, { signal: controller.signal }),
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
      name: 'stage_aozu_life_event',
      title: 'Stage AOZU Life Event',
      description: 'Propose a meal, expense, step, or fitness record as one chapter of the active Companion adventure. This only opens an AOZU review; the user must confirm before the deterministic local action runs.',
      inputSchema: {
        type: 'object',
        properties: {
          activity: { type: 'string', enum: AOZU_LIFE_ACTIVITIES },
          summary: { type: 'string', minLength: 1, maxLength: 300 },
          dialogue: { type: 'string', minLength: 1, maxLength: 800 },
          idempotencyKey: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' },
        },
        required: ['activity', 'summary', 'idempotencyKey'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      async execute(input) {
        const activity = String(input.activity)
        if (!AOZU_LIFE_ACTIVITIES.includes(activity as (typeof AOZU_LIFE_ACTIVITIES)[number])) throw new Error('Unknown life activity')
        return stageProposal({
          id: readIdempotencyKey(input.idempotencyKey),
          kind: 'life',
          activity,
          summary: readText(input.summary, 'summary', 300),
          dialogue: readOptionalText(input.dialogue, 'dialogue', 800),
        })
      },
    }, { signal: controller.signal }),
    modelContext.registerTool({
      name: 'stage_aozu_trip_plan',
      title: 'Stage AOZU Trip Plan',
      description: 'Propose up to 12 places for the active Companion travel journal. Each stop needs a day, type, name, and location. AOZU shows the complete plan for user confirmation before writing it to the journal.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 80 },
          stops: {
            type: 'array',
            minItems: 1,
            maxItems: 12,
            items: {
              type: 'object',
              properties: {
                day: { type: 'integer', minimum: 1, maximum: 3 },
                kind: { type: 'string', enum: ['spot', 'food'] },
                name: { type: 'string', minLength: 1, maxLength: 80 },
                location: { type: 'string', minLength: 1, maxLength: 120 },
              },
              required: ['day', 'kind', 'name', 'location'],
              additionalProperties: false,
            },
          },
          dialogue: { type: 'string', minLength: 1, maxLength: 800 },
          idempotencyKey: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' },
        },
        required: ['title', 'stops', 'idempotencyKey'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      async execute(input) {
        if (!Array.isArray(input.stops) || input.stops.length < 1 || input.stops.length > 12) throw new Error('Invalid stops')
        const stops = input.stops.map((value) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid stop')
          const stop = value as Record<string, unknown>
          const day = Number(stop.day)
          const kind = String(stop.kind)
          if (![1, 2, 3].includes(day) || !['spot', 'food'].includes(kind)) throw new Error('Invalid stop')
          return { day, kind, name: readText(stop.name, 'stop name', 80), location: readText(stop.location, 'stop location', 120) }
        })
        return stageProposal({
          id: readIdempotencyKey(input.idempotencyKey),
          kind: 'travel',
          title: readText(input.title, 'title', 80),
          stops,
          dialogue: readOptionalText(input.dialogue, 'dialogue', 800),
        })
      },
    }, { signal: controller.signal }),
    modelContext.registerTool({
      name: 'stage_aozu_outfit',
      title: 'Stage AOZU Outfit',
      description: 'Propose one owned paper-doll item for the active Companion. AOZU opens the wardrobe preview and waits for the user before the item is magnetically equipped and the character composite changes.',
      inputSchema: {
        type: 'object',
        properties: {
          itemId: { type: 'string', enum: AOZU_WARDROBE_ITEMS.map(({ id }) => id) },
          dialogue: { type: 'string', minLength: 1, maxLength: 800 },
          idempotencyKey: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' },
        },
        required: ['itemId', 'idempotencyKey'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      async execute(input) {
        const itemId = String(input.itemId)
        if (!AOZU_WARDROBE_ITEMS.some(({ id }) => id === itemId)) throw new Error('Unknown wardrobe item')
        return stageProposal({
          id: readIdempotencyKey(input.idempotencyKey),
          kind: 'outfit',
          itemId,
          dialogue: readOptionalText(input.dialogue, 'dialogue', 800),
        })
      },
    }, { signal: controller.signal }),
    modelContext.registerTool({
      name: 'stage_aozu_memory',
      title: 'Stage AOZU Memory',
      description: 'Propose a short shared memory for the active Companion. AOZU shows the title, summary, and category; nothing becomes long-term memory until the user confirms it.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 80 },
          summary: { type: 'string', minLength: 1, maxLength: 500 },
          category: { type: 'string', enum: AOZU_MEMORY_CATEGORIES },
          dialogue: { type: 'string', minLength: 1, maxLength: 800 },
          idempotencyKey: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' },
        },
        required: ['title', 'summary', 'category', 'idempotencyKey'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      async execute(input) {
        const category = String(input.category)
        if (!AOZU_MEMORY_CATEGORIES.includes(category as (typeof AOZU_MEMORY_CATEGORIES)[number])) throw new Error('Unknown memory category')
        return stageProposal({
          id: readIdempotencyKey(input.idempotencyKey),
          kind: 'memory',
          title: readText(input.title, 'title', 80),
          summary: readText(input.summary, 'summary', 500),
          category,
          dialogue: readOptionalText(input.dialogue, 'dialogue', 800),
        })
      },
    }, { signal: controller.signal }),
    modelContext.registerTool({
      name: 'stage_aozu_ability_card',
      title: 'Stage AOZU Ability Card',
      description: 'Propose a callable card that packages one learned Companion ability and a minimal memory summary. AOZU presents the card contract for user confirmation and never includes credentials or raw private history.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 80 },
          ability: { type: 'string', minLength: 1, maxLength: 120 },
          summary: { type: 'string', minLength: 1, maxLength: 500 },
          requiredCapabilities: { type: 'array', maxItems: 10, items: { type: 'string', minLength: 1, maxLength: 80 } },
          dialogue: { type: 'string', minLength: 1, maxLength: 800 },
          idempotencyKey: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' },
        },
        required: ['title', 'ability', 'summary', 'requiredCapabilities', 'idempotencyKey'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      async execute(input) {
        if (!Array.isArray(input.requiredCapabilities) || input.requiredCapabilities.length > 10) throw new Error('Invalid requiredCapabilities')
        return stageProposal({
          id: readIdempotencyKey(input.idempotencyKey),
          kind: 'card',
          title: readText(input.title, 'title', 80),
          ability: readText(input.ability, 'ability', 120),
          summary: readText(input.summary, 'summary', 500),
          requiredCapabilities: input.requiredCapabilities.map((value) => readText(value, 'capability', 80)),
          dialogue: readOptionalText(input.dialogue, 'dialogue', 800),
        })
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
