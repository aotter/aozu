import type { LoadoutProjection } from '../domain/items.ts'
import type { ItemEffect } from '../domain/items.ts'
import {
  PLAYBOOK_LIMITS,
  normalizePhrase,
  parseEffect,
  parsePlaybookRule,
  parsePreparedAction,
  type Condition,
  type Effect,
  type PlaybookRule,
  type PreparedAction,
} from '../domain/playbook.ts'

export { normalizePhrase, parsePlaybookRule, parsePreparedAction }
export type { Condition, Effect, PlaybookRule, PreparedAction } from '../domain/playbook.ts'

const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`)
  return value as Record<string, unknown>
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

function applyEffect(data: Record<string, unknown>, effect: Effect, enforceDeclaredFacts = false): Record<string, unknown> {
  if (effect.type === 'changeStage') return { ...data, currentStageId: effect.stageId }
  if (effect.type === 'setFlag') {
    const flags = object(data.flags ?? {}, 'flags')
    if (enforceDeclaredFacts && !Object.hasOwn(flags, effect.flagId)) throw new Error(`Undeclared flag: ${effect.flagId}`)
    return { ...data, flags: { ...flags, [effect.flagId]: effect.value } }
  }
  if (effect.type !== 'addMetric') throw new Error(`Item effect escaped transaction planning: ${effect.type}`)
  const metrics = object(data.metrics ?? {}, 'metrics')
  if (enforceDeclaredFacts && !Object.hasOwn(metrics, effect.metricId)) throw new Error(`Undeclared metric: ${effect.metricId}`)
  const current = Number(metrics[effect.metricId] ?? 0)
  if (!Number.isFinite(current)) throw new Error(`Invalid metric: ${effect.metricId}`)
  return { ...data, metrics: { ...metrics, [effect.metricId]: current + effect.amount } }
}

export const isItemEffect = (effect: Effect): effect is ItemEffect =>
  ['grantItem', 'consumeItem', 'equipItem', 'unequipItem', 'setItemState', 'setAppearanceOverride'].includes(effect.type)

export function executePlaybookPlan(
  runData: Record<string, unknown>,
  actionEffects: Effect[],
  rules: PlaybookRule[],
  postActionItemFacts?: LoadoutProjection,
  enforceDeclaredFacts = false,
) {
  if (rules.length > PLAYBOOK_LIMITS.rules) throw new Error('Playbook rule limit exceeded')
  let postActionRun = structuredClone(runData)
  for (const effect of actionEffects) if (!isItemEffect(effect)) postActionRun = applyEffect(postActionRun, effect, enforceDeclaredFacts)
  const matchedEffects = [...rules]
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
    .filter((rule) => evaluate(rule.when, postActionRun, postActionItemFacts))
    .flatMap((rule) => rule.effects)
  const effects = [...actionEffects, ...matchedEffects]
  if (effects.length > PLAYBOOK_LIMITS.effectsPerTransaction) throw new Error('Playbook effect limit exceeded')
  if (effects.filter((effect) => effect.type === 'changeStage').length > 1) {
    throw Object.assign(new Error('Multiple stage transitions in one transaction'), { code: 'conflicting_stage_transition' })
  }
  let next = structuredClone(runData)
  const itemEffects: ItemEffect[] = []
  const apply = (effect: Effect) => {
    if (isItemEffect(effect)) itemEffects.push(effect)
    else next = applyEffect(next, effect, enforceDeclaredFacts)
  }
  effects.forEach(apply)
  return { runData: next, itemEffects }
}
