import type { ItemEffect } from '../domain/items.ts'
import type { AppearanceRef } from '../domain/character.ts'
import type { LoadoutProjection } from '../domain/items.ts'

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

const MAX_RULES = 100
const MAX_EFFECTS = 50

const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`)
  return value as Record<string, unknown>
}

export const normalizePhrase = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en')

export function parsePreparedAction(value: unknown): PreparedAction {
  const action = object(value, 'action')
  if (typeof action.id !== 'string' || typeof action.label !== 'string') throw new Error('Invalid action identity')
  return {
    id: action.id,
    label: action.label,
    phrases: Array.isArray(action.phrases)
      ? action.phrases.map((phrase) => {
          if (typeof phrase !== 'string' || !phrase.trim()) throw new Error('Invalid action phrase')
          return phrase
        })
      : [],
    effects: Array.isArray(action.effects) ? action.effects.map(parseEffect) : [],
  }
}

export function parsePlaybookRule(value: unknown): PlaybookRule {
  const rule = object(value, 'rule')
  if (typeof rule.ruleId !== 'string' || !Number.isSafeInteger(rule.priority)) throw new Error('Invalid rule identity')
  return {
    id: rule.ruleId,
    priority: rule.priority as number,
    when: parseCondition(rule.when),
    effects: Array.isArray(rule.effects) ? rule.effects.map(parseEffect) : [],
  }
}

function parseCondition(value: unknown, depth = 0): Condition {
  if (depth > 10) throw new Error('Condition depth limit exceeded')
  const condition = object(value, 'condition')
  if (Array.isArray(condition.all) && condition.all.length) return { all: condition.all.map((item) => parseCondition(item, depth + 1)) }
  if (Array.isArray(condition.any) && condition.any.length) return { any: condition.any.map((item) => parseCondition(item, depth + 1)) }
  if (condition.not !== undefined) return { not: parseCondition(condition.not, depth + 1) }
  if (condition.fact === 'flag' && typeof condition.id === 'string' && typeof condition.value === 'boolean') {
    return { fact: condition.fact, id: condition.id, value: condition.value }
  }
  if (condition.fact === 'stage' && typeof condition.id === 'string') return { fact: condition.fact, id: condition.id }
  if (
    (condition.fact === 'capability' || condition.fact === 'inventory' || condition.fact === 'equipped' || condition.fact === 'appearance') &&
    typeof condition.id === 'string'
  ) return { fact: condition.fact, id: condition.id }
  if (
    condition.fact === 'quantity' && typeof condition.id === 'string' &&
    (condition.op === 'eq' || condition.op === 'gt' || condition.op === 'gte' || condition.op === 'lt' || condition.op === 'lte') &&
    Number.isFinite(condition.value)
  ) return { fact: condition.fact, id: condition.id, op: condition.op, value: condition.value as number }
  if (
    condition.fact === 'itemState' && typeof condition.inventoryId === 'string' && typeof condition.field === 'string' && condition.op === 'eq' &&
    (typeof condition.value === 'string' || typeof condition.value === 'number' || typeof condition.value === 'boolean')
  ) return { fact: condition.fact, inventoryId: condition.inventoryId, field: condition.field, op: condition.op, value: condition.value }
  if (
    condition.fact === 'metric' &&
    typeof condition.id === 'string' &&
    (condition.op === 'eq' || condition.op === 'gt' || condition.op === 'gte' || condition.op === 'lt' || condition.op === 'lte') &&
    Number.isFinite(condition.value)
  ) {
    return { fact: condition.fact, id: condition.id, op: condition.op, value: condition.value as number }
  }
  throw new Error('Unsupported condition')
}

export function resolvePreparedAction(
  values: unknown[],
  input: { actionId?: string; text?: string },
): { path: 'hot' | 'warm'; action: PreparedAction } | { path: 'cold'; reason: 'unmatched' | 'ambiguous' } {
  const actions = values.map(parsePreparedAction)
  if (input.actionId) {
    const action = actions.find(({ id }) => id === input.actionId)
    return action ? { path: 'hot', action } : { path: 'cold', reason: 'unmatched' }
  }
  if (!input.text) return { path: 'cold', reason: 'unmatched' }
  const normalized = normalizePhrase(input.text)
  const matches = actions.filter(({ phrases }) => phrases.some((phrase) => normalizePhrase(phrase) === normalized))
  return matches.length === 1
    ? { path: 'warm', action: matches[0]! }
    : { path: 'cold', reason: matches.length > 1 ? 'ambiguous' : 'unmatched' }
}

function parseEffect(value: unknown): Effect {
  const effect = object(value, 'effect')
  if (effect.type === 'addMetric' && typeof effect.metricId === 'string' && Number.isFinite(effect.amount)) {
    return { type: effect.type, metricId: effect.metricId, amount: effect.amount as number }
  }
  if (effect.type === 'setFlag' && typeof effect.flagId === 'string' && typeof effect.value === 'boolean') {
    return { type: effect.type, flagId: effect.flagId, value: effect.value }
  }
  if (effect.type === 'changeStage' && typeof effect.stageId === 'string') {
    return { type: effect.type, stageId: effect.stageId }
  }
  if (effect.type === 'grantItem' && typeof effect.inventoryId === 'string' && typeof effect.definitionId === 'string' && Number.isSafeInteger(effect.quantity)) {
    return { type: effect.type, inventoryId: effect.inventoryId, definitionId: effect.definitionId, quantity: effect.quantity as number, state: object(effect.state ?? {}, 'item state') }
  }
  if (effect.type === 'consumeItem' && typeof effect.inventoryId === 'string' && Number.isSafeInteger(effect.quantity)) {
    return { type: effect.type, inventoryId: effect.inventoryId, quantity: effect.quantity as number }
  }
  if (effect.type === 'equipItem' && typeof effect.inventoryId === 'string' && typeof effect.slot === 'string') {
    return { type: effect.type, inventoryId: effect.inventoryId, slot: effect.slot }
  }
  if (effect.type === 'unequipItem' && typeof effect.slot === 'string') return { type: effect.type, slot: effect.slot }
  if (effect.type === 'setItemState' && typeof effect.inventoryId === 'string') {
    return { type: effect.type, inventoryId: effect.inventoryId, state: object(effect.state, 'item state') }
  }
  if (effect.type === 'setAppearanceOverride' && typeof effect.slot === 'string') {
    const appearance = effect.appearance === null ? null : object(effect.appearance, 'appearance')
    if (appearance && (typeof appearance.packId !== 'string' || !Number.isSafeInteger(appearance.packVersion) || typeof appearance.appearanceId !== 'string')) throw new Error('Invalid appearance')
    return { type: effect.type, slot: effect.slot, appearance: appearance as AppearanceRef | null }
  }
  throw new Error(`Unsupported effect: ${String(effect.type)}`)
}

export const parseEffects = (value: unknown): Effect[] => {
  if (!Array.isArray(value)) throw new Error('Invalid effects')
  return value.map(parseEffect)
}

function evaluate(condition: Condition, data: Record<string, unknown>, items?: LoadoutProjection): boolean {
  if ('all' in condition) return condition.all.every((item) => evaluate(item, data, items))
  if ('any' in condition) return condition.any.some((item) => evaluate(item, data, items))
  if ('not' in condition) return !evaluate(condition.not, data, items)
  if (condition.fact === 'stage') return data.currentStageId === condition.id
  if (condition.fact === 'flag') return object(data.flags ?? {}, 'flags')[condition.id] === condition.value
  if (condition.fact === 'capability') return items?.capabilities.includes(condition.id) ?? false
  if (condition.fact === 'inventory') return items?.ownedDefinitionIds.includes(condition.id) ?? false
  if (condition.fact === 'equipped') return items?.equippedDefinitionIds.includes(condition.id) ?? false
  if (condition.fact === 'appearance') return items?.trustedAppearanceFacts.includes(condition.id) ?? false
  if (condition.fact === 'itemState') return items?.itemStates[condition.inventoryId]?.[condition.field] === condition.value
  if (condition.fact !== 'metric' && condition.fact !== 'quantity') return false
  const actual = condition.fact === 'quantity'
    ? (items?.quantities[condition.id] ?? 0)
    : Number(object(data.metrics ?? {}, 'metrics')[condition.id] ?? 0)
  return condition.op === 'eq'
    ? actual === condition.value
    : condition.op === 'gt'
      ? actual > condition.value
      : condition.op === 'gte'
        ? actual >= condition.value
        : condition.op === 'lt'
          ? actual < condition.value
          : actual <= condition.value
}

function applyEffect(data: Record<string, unknown>, effect: Effect): Record<string, unknown> {
  if (effect.type === 'changeStage') return { ...data, currentStageId: effect.stageId }
  if (effect.type === 'setFlag') {
    return { ...data, flags: { ...object(data.flags ?? {}, 'flags'), [effect.flagId]: effect.value } }
  }
  if (effect.type !== 'addMetric') throw new Error(`Item effect escaped transaction planning: ${effect.type}`)
  const metrics = object(data.metrics ?? {}, 'metrics')
  const current = Number(metrics[effect.metricId] ?? 0)
  if (!Number.isFinite(current)) throw new Error(`Invalid metric: ${effect.metricId}`)
  return { ...data, metrics: { ...metrics, [effect.metricId]: current + effect.amount } }
}

export const isItemEffect = (effect: Effect): effect is ItemEffect =>
  ['grantItem', 'consumeItem', 'equipItem', 'unequipItem', 'setItemState', 'setAppearanceOverride'].includes(effect.type)

export function executePlaybook(
  runData: Record<string, unknown>,
  actionEffects: Effect[],
  rules: PlaybookRule[],
): Record<string, unknown> {
  const result = executePlaybookPlan(runData, actionEffects, rules)
  if (result.itemEffects.length) throw new Error('Item effects require the action transaction')
  return result.runData
}

export function executePlaybookPlan(
  runData: Record<string, unknown>,
  actionEffects: Effect[],
  rules: PlaybookRule[],
  itemFacts?: LoadoutProjection,
) {
  if (rules.length > MAX_RULES) throw new Error('Playbook rule limit exceeded')
  let effects = 0
  let next = structuredClone(runData)
  const itemEffects: ItemEffect[] = []
  const apply = (effect: Effect) => {
    effects += 1
    if (effects > MAX_EFFECTS) throw new Error('Playbook effect limit exceeded')
    if (isItemEffect(effect)) itemEffects.push(effect)
    else next = applyEffect(next, effect)
  }
  actionEffects.forEach(apply)
  for (const rule of [...rules].sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))) {
    if (evaluate(rule.when, next, itemFacts)) rule.effects.map(parseEffect).forEach(apply)
  }
  return { runData: next, itemEffects }
}
