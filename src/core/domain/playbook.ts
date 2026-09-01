import { jsonSchemaToZod, type JsonSchema } from '@aotter/mantle-spec'

import type { ItemEffect } from './items.ts'

export const PROGRESS_LOOP_IDS = ['rhythm', 'mastery', 'bond', 'journey', 'discovery', 'stewardship', 'challenge'] as const
export type ProgressLoopId = typeof PROGRESS_LOOP_IDS[number]

export const PLAYBOOK_LIMITS = {
  stages: 100,
  actionsPerStage: 50,
  phrasesPerAction: 20,
  phraseLength: 500,
  rules: 100,
  effectsPerActionOrRule: 50,
  effectsPerTransaction: 50,
  conditionDepth: 10,
  dialogueLength: 8_000,
} as const

export type Condition =
  | { fact: 'metric'; id: string; op: 'eq' | 'gt' | 'gte' | 'lt' | 'lte'; value: number }
  | { fact: 'flag'; id: string; value: boolean }
  | { fact: 'stage'; id: string }
  | { fact: 'capability' | 'inventory' | 'equipped' | 'appearance'; id: string }
  | { fact: 'quantity'; id: string; op: 'eq' | 'gt' | 'gte' | 'lt' | 'lte'; value: number }
  | { fact: 'itemState'; inventoryId: string; field: string; op: 'eq'; value: string | number | boolean }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }

export type Effect =
  | { type: 'addMetric'; metricId: string; amount: number }
  | { type: 'setFlag'; flagId: string; value: boolean }
  | { type: 'changeStage'; stageId: string }
  | ItemEffect

export interface PlaybookRule {
  id: string
  priority: number
  when: Condition
  effects: Effect[]
}

export interface PreparedAction {
  id: string
  label: string
  phrases: string[]
  effects: Effect[]
}

export interface MetricProgressBinding {
  id: string
  label: string
  source: { fact: 'metric'; id: string }
  max?: number
}

const strictObject = (properties: Readonly<Record<string, JsonSchema>>, required: readonly string[]): JsonSchema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
})

const nonBlank = (maxLength: number): JsonSchema => ({ type: 'string', minLength: 1, maxLength, pattern: '\\S' })
const identifier = nonBlank(100)
const declarativeIdentifier: JsonSchema = { ...identifier, pattern: '^[a-z0-9][a-z0-9:_-]{0,99}$' }
const itemIdentifier: JsonSchema = { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,80}$' }
const comparison = ['eq', 'gt', 'gte', 'lt', 'lte'] as const
const appearanceSchema = strictObject({
  packId: identifier,
  packVersion: { type: 'integer', minimum: 1 },
  appearanceId: identifier,
}, ['packId', 'packVersion', 'appearanceId'])

const conditionDefinition: JsonSchema = {
  oneOf: [
    strictObject({ fact: { const: 'metric' }, id: identifier, op: { enum: comparison }, value: { type: 'number' } }, ['fact', 'id', 'op', 'value']),
    strictObject({ fact: { const: 'flag' }, id: identifier, value: { type: 'boolean' } }, ['fact', 'id', 'value']),
    strictObject({ fact: { const: 'stage' }, id: identifier }, ['fact', 'id']),
    ...(['capability', 'inventory', 'equipped', 'appearance'] as const).map((fact) =>
      strictObject({ fact: { const: fact }, id: identifier }, ['fact', 'id'])),
    strictObject({ fact: { const: 'quantity' }, id: identifier, op: { enum: comparison }, value: { type: 'number' } }, ['fact', 'id', 'op', 'value']),
    strictObject({
      fact: { const: 'itemState' },
      inventoryId: identifier,
      field: identifier,
      op: { const: 'eq' },
      value: { type: ['string', 'number', 'boolean'] },
    }, ['fact', 'inventoryId', 'field', 'op', 'value']),
    strictObject({ all: { type: 'array', minItems: 1, items: { $ref: '#/$defs/Condition' } } }, ['all']),
    strictObject({ any: { type: 'array', minItems: 1, items: { $ref: '#/$defs/Condition' } } }, ['any']),
    strictObject({ not: { $ref: '#/$defs/Condition' } }, ['not']),
  ],
}

export const CONDITION_SCHEMA: JsonSchema = {
  $defs: { Condition: conditionDefinition },
  $ref: '#/$defs/Condition',
}

export const EFFECT_SCHEMA: JsonSchema = {
  oneOf: [
    strictObject({ type: { const: 'addMetric' }, metricId: identifier, amount: { type: 'number' } }, ['type', 'metricId', 'amount']),
    strictObject({ type: { const: 'setFlag' }, flagId: identifier, value: { type: 'boolean' } }, ['type', 'flagId', 'value']),
    strictObject({ type: { const: 'changeStage' }, stageId: identifier }, ['type', 'stageId']),
    strictObject({
      type: { const: 'grantItem' }, inventoryId: identifier, definitionId: identifier,
      quantity: { type: 'integer', minimum: 1 }, state: { type: 'object', additionalProperties: true },
    }, ['type', 'inventoryId', 'definitionId', 'quantity']),
    strictObject({ type: { const: 'consumeItem' }, inventoryId: identifier, quantity: { type: 'integer', minimum: 1 } }, ['type', 'inventoryId', 'quantity']),
    strictObject({ type: { const: 'equipItem' }, inventoryId: identifier, slot: identifier }, ['type', 'inventoryId', 'slot']),
    strictObject({ type: { const: 'unequipItem' }, slot: identifier }, ['type', 'slot']),
    strictObject({ type: { const: 'setItemState' }, inventoryId: identifier, state: { type: 'object', additionalProperties: true } }, ['type', 'inventoryId', 'state']),
    strictObject({
      type: { const: 'setAppearanceOverride' }, slot: identifier,
      appearance: { oneOf: [appearanceSchema, { type: 'null' }] },
    }, ['type', 'slot', 'appearance']),
  ],
}

export const PLAYBOOK_SCHEMA_DEFS = CONDITION_SCHEMA.$defs!
export const CONDITION_REF: JsonSchema = { $ref: '#/$defs/Condition' }
export const PROGRESS_BINDING_SCHEMA: JsonSchema = strictObject({
  id: identifier,
  label: nonBlank(500),
  source: strictObject({ fact: { const: 'metric' }, id: identifier }, ['fact', 'id']),
  max: { type: 'number', minimum: Number.MIN_VALUE },
}, ['id', 'label', 'source'])

export const PREPARED_ACTION_SCHEMA: JsonSchema = strictObject({
  id: identifier,
  label: nonBlank(200),
  phrases: {
    type: 'array', maxItems: PLAYBOOK_LIMITS.phrasesPerAction,
    items: nonBlank(PLAYBOOK_LIMITS.phraseLength),
  },
  effects: { type: 'array', maxItems: PLAYBOOK_LIMITS.effectsPerActionOrRule, items: EFFECT_SCHEMA },
}, ['id', 'label'])

export const PLAYBOOK_RULE_SCHEMA: JsonSchema = {
  ...strictObject({
    ruleId: identifier,
    priority: { type: 'integer' },
    when: CONDITION_REF,
    effects: { type: 'array', maxItems: PLAYBOOK_LIMITS.effectsPerActionOrRule, items: EFFECT_SCHEMA },
  }, ['ruleId', 'priority', 'when', 'effects']),
  $defs: PLAYBOOK_SCHEMA_DEFS,
}

const candidateAppearanceSchema = strictObject({
  packId: declarativeIdentifier,
  packVersion: { type: 'integer', minimum: 1 },
  appearanceId: declarativeIdentifier,
}, ['packId', 'packVersion', 'appearanceId'])
const itemDefinitionSchema = strictObject({
  id: itemIdentifier,
  name: nonBlank(200),
  equipSlot: declarativeIdentifier,
  defaultAppearance: candidateAppearanceSchema,
  grants: { type: 'array', items: identifier },
  actionIds: { type: 'array', items: identifier },
  stackable: { type: 'boolean' },
  maxQuantity: { type: 'integer', minimum: 1 },
  stateSchema: { type: 'object', additionalProperties: true },
  appearanceFacts: {
    type: 'array',
    items: strictObject({
      appearance: candidateAppearanceSchema,
      facts: { type: 'array', items: identifier },
    }, ['appearance', 'facts']),
  },
}, ['id', 'name'])
const candidateActionSchema = strictObject({
  ...PREPARED_ACTION_SCHEMA.properties,
  id: declarativeIdentifier,
}, ['id', 'label'])
const candidateSceneSchema = strictObject({
  compositionId: declarativeIdentifier,
  characterStateId: declarativeIdentifier,
}, ['compositionId'])

export const EXPERIENCE_CANDIDATE_SCHEMA: JsonSchema = {
  ...strictObject({
    name: nonBlank(200),
    initialStageId: declarativeIdentifier,
    metrics: { type: 'object', additionalProperties: { type: 'number' } },
    flags: { type: 'object', additionalProperties: { type: 'boolean' } },
    itemDefinitions: { type: 'array', maxItems: 100, items: itemDefinitionSchema },
    stages: {
      type: 'array', minItems: 1, maxItems: PLAYBOOK_LIMITS.stages,
      items: strictObject({
        id: declarativeIdentifier,
        title: nonBlank(500),
        narrative: nonBlank(PLAYBOOK_LIMITS.dialogueLength),
        terminal: { type: 'boolean' },
        agentFallback: { type: 'boolean' },
        scene: candidateSceneSchema,
        actions: { type: 'array', maxItems: PLAYBOOK_LIMITS.actionsPerStage, items: candidateActionSchema },
        progress: { type: 'array', items: PROGRESS_BINDING_SCHEMA },
      }, ['id', 'title', 'narrative', 'actions']),
    },
    rules: {
      type: 'array', maxItems: PLAYBOOK_LIMITS.rules,
      items: strictObject({
        ruleId: declarativeIdentifier,
        priority: { type: 'integer' },
        when: CONDITION_REF,
        effects: { type: 'array', maxItems: PLAYBOOK_LIMITS.effectsPerActionOrRule, items: EFFECT_SCHEMA },
      }, ['ruleId', 'priority', 'when', 'effects']),
    },
  }, ['name', 'initialStageId', 'metrics', 'stages']),
  $defs: PLAYBOOK_SCHEMA_DEFS,
}

const conditionValidator = jsonSchemaToZod(CONDITION_SCHEMA)
const effectValidator = jsonSchemaToZod(EFFECT_SCHEMA)
const actionValidator = jsonSchemaToZod(PREPARED_ACTION_SCHEMA)
const ruleValidator = jsonSchemaToZod(PLAYBOOK_RULE_SCHEMA)
const progressValidator = jsonSchemaToZod(PROGRESS_BINDING_SCHEMA)

const parse = <T>(validator: ReturnType<typeof jsonSchemaToZod>, value: unknown, label: string): T => {
  const result = validator.safeParse(value)
  if (!result.success) throw new Error(`Invalid ${label}: ${result.error.issues[0]?.message ?? 'validation failed'}`)
  return result.data as T
}

export const normalizePhrase = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en')

export function parseCondition(value: unknown): Condition {
  const condition = parse<Condition>(conditionValidator, value, 'condition')
  let depth = 0
  const pending: Array<{ condition: Condition; depth: number }> = [{ condition, depth: 0 }]
  while (pending.length) {
    const current = pending.pop()!
    depth = Math.max(depth, current.depth)
    if ('not' in current.condition) pending.push({ condition: current.condition.not, depth: current.depth + 1 })
    else if ('all' in current.condition) pending.push(...current.condition.all.map((condition) => ({ condition, depth: current.depth + 1 })))
    else if ('any' in current.condition) pending.push(...current.condition.any.map((condition) => ({ condition, depth: current.depth + 1 })))
  }
  if (depth > PLAYBOOK_LIMITS.conditionDepth) throw new Error('Condition depth limit exceeded')
  return condition
}

export const parseEffect = (value: unknown): Effect => parse(effectValidator, value, 'effect')

export function parsePreparedAction(value: unknown): PreparedAction {
  const action = parse<Omit<PreparedAction, 'phrases' | 'effects'> & Partial<Pick<PreparedAction, 'phrases' | 'effects'>>>(actionValidator, value, 'action')
  return { ...action, phrases: action.phrases ?? [], effects: action.effects ?? [] }
}

export function parsePlaybookRule(value: unknown): PlaybookRule {
  const { ruleId, priority, when, effects } = parse<{ ruleId: string; priority: number; when: Condition; effects: Effect[] }>(ruleValidator, value, 'rule')
  const condition = parseCondition(when)
  return { id: ruleId, priority, when: condition, effects }
}

export const parseProgressBinding = (value: unknown): MetricProgressBinding => parse(progressValidator, value, 'progress binding')
