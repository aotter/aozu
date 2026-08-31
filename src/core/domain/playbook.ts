import type { JsonSchema } from '@aotter/mantle-spec'

import type { AppearanceRef } from './character.ts'
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

const identifier: JsonSchema = { type: 'string', minLength: 1, maxLength: 100 }
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
  label: { type: 'string', minLength: 1, maxLength: 500 },
  source: strictObject({ fact: { const: 'metric' }, id: identifier }, ['fact', 'id']),
  max: { type: 'number', minimum: Number.MIN_VALUE },
}, ['id', 'label', 'source'])

const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`)
  return value as Record<string, unknown>
}

const only = (value: Record<string, unknown>, fields: readonly string[], label: string) => {
  if (Object.keys(value).some((field) => !fields.includes(field))) throw new Error(`Invalid ${label} fields`)
}

const nonEmpty = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${label}`)
  return value
}

const finite = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid ${label}`)
  return value
}

const positiveInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(`Invalid ${label}`)
  return Number(value)
}

const parseAppearance = (value: unknown): AppearanceRef => {
  const appearance = object(value, 'appearance')
  only(appearance, ['packId', 'packVersion', 'appearanceId'], 'appearance')
  return {
    packId: nonEmpty(appearance.packId, 'appearance pack'),
    packVersion: positiveInteger(appearance.packVersion, 'appearance version'),
    appearanceId: nonEmpty(appearance.appearanceId, 'appearance id'),
  }
}

export const normalizePhrase = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en')

export function parseCondition(value: unknown, depth = 0): Condition {
  if (depth > PLAYBOOK_LIMITS.conditionDepth) throw new Error('Condition depth limit exceeded')
  const condition = object(value, 'condition')
  if ('all' in condition || 'any' in condition || 'not' in condition) {
    const operator = 'all' in condition ? 'all' : 'any' in condition ? 'any' : 'not'
    only(condition, [operator], 'condition')
    if (operator === 'not') return { not: parseCondition(condition.not, depth + 1) }
    const children = condition[operator]
    if (!Array.isArray(children) || !children.length) throw new Error('Invalid compound condition')
    const parsed = children.map((child) => parseCondition(child, depth + 1))
    return operator === 'all' ? { all: parsed } : { any: parsed }
  }
  if (condition.fact === 'flag') {
    only(condition, ['fact', 'id', 'value'], 'condition')
    if (typeof condition.value !== 'boolean') throw new Error('Invalid flag condition')
    return { fact: 'flag', id: nonEmpty(condition.id, 'condition id'), value: condition.value }
  }
  if (condition.fact === 'stage') {
    only(condition, ['fact', 'id'], 'condition')
    return { fact: 'stage', id: nonEmpty(condition.id, 'condition id') }
  }
  if (condition.fact === 'capability' || condition.fact === 'inventory' || condition.fact === 'equipped' || condition.fact === 'appearance') {
    only(condition, ['fact', 'id'], 'condition')
    return { fact: condition.fact, id: nonEmpty(condition.id, 'condition id') }
  }
  if (condition.fact === 'itemState') {
    only(condition, ['fact', 'inventoryId', 'field', 'op', 'value'], 'condition')
    if (condition.op !== 'eq' || !['string', 'number', 'boolean'].includes(typeof condition.value) || (typeof condition.value === 'number' && !Number.isFinite(condition.value))) {
      throw new Error('Invalid item state condition')
    }
    return {
      fact: 'itemState',
      inventoryId: nonEmpty(condition.inventoryId, 'inventory id'),
      field: nonEmpty(condition.field, 'item state field'),
      op: 'eq',
      value: condition.value as string | number | boolean,
    }
  }
  if (condition.fact === 'metric' || condition.fact === 'quantity') {
    only(condition, ['fact', 'id', 'op', 'value'], 'condition')
    if (!comparison.includes(condition.op as typeof comparison[number])) throw new Error('Invalid comparison')
    return {
      fact: condition.fact,
      id: nonEmpty(condition.id, 'condition id'),
      op: condition.op as typeof comparison[number],
      value: finite(condition.value, 'condition value'),
    }
  }
  throw new Error('Unsupported condition')
}

export function parseEffect(value: unknown): Effect {
  const effect = object(value, 'effect')
  if (effect.type === 'addMetric') {
    only(effect, ['type', 'metricId', 'amount'], 'effect')
    return { type: effect.type, metricId: nonEmpty(effect.metricId, 'metric id'), amount: finite(effect.amount, 'metric amount') }
  }
  if (effect.type === 'setFlag') {
    only(effect, ['type', 'flagId', 'value'], 'effect')
    if (typeof effect.value !== 'boolean') throw new Error('Invalid flag value')
    return { type: effect.type, flagId: nonEmpty(effect.flagId, 'flag id'), value: effect.value }
  }
  if (effect.type === 'changeStage') {
    only(effect, ['type', 'stageId'], 'effect')
    return { type: effect.type, stageId: nonEmpty(effect.stageId, 'stage id') }
  }
  if (effect.type === 'grantItem') {
    only(effect, ['type', 'inventoryId', 'definitionId', 'quantity', 'state'], 'effect')
    return {
      type: effect.type,
      inventoryId: nonEmpty(effect.inventoryId, 'inventory id'),
      definitionId: nonEmpty(effect.definitionId, 'definition id'),
      quantity: positiveInteger(effect.quantity, 'item quantity'),
      ...(effect.state === undefined ? {} : { state: structuredClone(object(effect.state, 'item state')) }),
    }
  }
  if (effect.type === 'consumeItem') {
    only(effect, ['type', 'inventoryId', 'quantity'], 'effect')
    return { type: effect.type, inventoryId: nonEmpty(effect.inventoryId, 'inventory id'), quantity: positiveInteger(effect.quantity, 'item quantity') }
  }
  if (effect.type === 'equipItem') {
    only(effect, ['type', 'inventoryId', 'slot'], 'effect')
    return { type: effect.type, inventoryId: nonEmpty(effect.inventoryId, 'inventory id'), slot: nonEmpty(effect.slot, 'item slot') }
  }
  if (effect.type === 'unequipItem') {
    only(effect, ['type', 'slot'], 'effect')
    return { type: effect.type, slot: nonEmpty(effect.slot, 'item slot') }
  }
  if (effect.type === 'setItemState') {
    only(effect, ['type', 'inventoryId', 'state'], 'effect')
    return { type: effect.type, inventoryId: nonEmpty(effect.inventoryId, 'inventory id'), state: structuredClone(object(effect.state, 'item state')) }
  }
  if (effect.type === 'setAppearanceOverride') {
    only(effect, ['type', 'slot', 'appearance'], 'effect')
    return {
      type: effect.type,
      slot: nonEmpty(effect.slot, 'appearance slot'),
      appearance: effect.appearance === null ? null : parseAppearance(effect.appearance),
    }
  }
  throw new Error(`Unsupported effect: ${String(effect.type)}`)
}

export function parsePreparedAction(value: unknown): PreparedAction {
  const action = object(value, 'action')
  only(action, ['id', 'label', 'phrases', 'effects'], 'action')
  const phrases = action.phrases ?? []
  const effects = action.effects ?? []
  if (!Array.isArray(phrases) || !Array.isArray(effects)) throw new Error('Invalid action lists')
  return {
    id: nonEmpty(action.id, 'action id'),
    label: nonEmpty(action.label, 'action label'),
    phrases: phrases.map((phrase) => nonEmpty(phrase, 'action phrase')),
    effects: effects.map(parseEffect),
  }
}

export function parsePlaybookRule(value: unknown): PlaybookRule {
  const rule = object(value, 'rule')
  only(rule, ['ruleId', 'priority', 'when', 'effects'], 'rule')
  if (!Number.isSafeInteger(rule.priority) || !Array.isArray(rule.effects)) throw new Error('Invalid rule')
  return {
    id: nonEmpty(rule.ruleId, 'rule id'),
    priority: rule.priority as number,
    when: parseCondition(rule.when),
    effects: rule.effects.map(parseEffect),
  }
}

export function parseProgressBinding(value: unknown): MetricProgressBinding {
  const binding = object(value, 'progress binding')
  only(binding, ['id', 'label', 'source', 'max'], 'progress binding')
  const source = object(binding.source, 'progress source')
  only(source, ['fact', 'id'], 'progress source')
  if (source.fact !== 'metric') throw new Error('Unsupported progress source')
  const max = binding.max === undefined ? undefined : finite(binding.max, 'progress max')
  if (max !== undefined && max <= 0) throw new Error('Progress max must be greater than zero')
  return {
    id: nonEmpty(binding.id, 'progress id'),
    label: nonEmpty(binding.label, 'progress label'),
    source: { fact: 'metric', id: nonEmpty(source.id, 'progress metric') },
    ...(max === undefined ? {} : { max }),
  }
}
