import { EntryDataValidator } from '@aotter/mantle-spec'

import { compileBundle, type BundleRecord } from '../bundle.ts'
import { resolveCharacterComposition, type AppearanceRef } from '../domain/character.ts'
import type { ItemDefinition } from '../domain/items.ts'
import { resolveSceneComposition } from '../domain/scene.ts'
import {
  EXPERIENCE_LIMITS,
  type ExperienceCandidatePreviewSnapshot,
  type ExperienceDraft,
  type ValidatedStarterPackage,
} from '../domain/starter.ts'
import { FIXED_BACKBONE_SOURCES, FIXED_BACKBONE_VERSION } from '../mantle/backbone.ts'
import { normalizePhrase, parsePlaybookRule, parsePreparedAction, type Condition, type Effect } from './playbook.ts'

export const AUTHORING_NAMESPACE = 'companion-authoring'

export interface ExperienceCandidateInput {
  name: string
  initialStageId: string
  metrics: Record<string, number>
  flags?: Record<string, boolean>
  itemDefinitions?: ItemDefinition[]
  stages: Array<{
    id: string
    title: string
    narrative: string
    terminal?: boolean
    agentFallback?: boolean
    scene?: { compositionId: string; characterStateId?: string }
    actions: Array<{ id: string; label: string; phrases?: string[]; effects?: Effect[] }>
  }>
  rules?: Array<{ ruleId: string; priority: number; when: unknown; effects: Effect[] }>
}

export interface AuthoringDiagnostic {
  code: string
  path: string
  message: string
}

export class ExperienceCandidateValidationError extends Error {
  readonly diagnostics: AuthoringDiagnostic[]

  constructor(diagnostic: AuthoringDiagnostic) {
    super(diagnostic.message)
    this.name = 'ExperienceCandidateValidationError'
    this.diagnostics = [diagnostic]
  }
}

export interface AuthoredExperienceCandidate {
  record: BundleRecord
  entries: Array<{ id: string; collection: string; data: Record<string, unknown> }>
  assets: Array<{ id: string; blob: Blob }>
  preview: ExperienceCandidatePreviewSnapshot
}

const manifestFiles = Object.fromEntries(FIXED_BACKBONE_SOURCES.map(({ sourceId, text }) => [sourceId, text]))
const idPattern = /^[a-z0-9][a-z0-9:_-]{0,99}$/
const itemIdPattern = /^[a-z0-9][a-z0-9_-]{0,80}$/

const fail = (code: string, path: string, message: string): never => {
  throw new ExperienceCandidateValidationError({ code, path, message })
}

const object = (value: unknown, path: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('invalid_type', path, 'Expected an object')
  return value as Record<string, unknown>
}

const only = (value: Record<string, unknown>, keys: readonly string[], path: string) => {
  const unexpected = Object.keys(value).find((key) => !keys.includes(key))
  if (unexpected) fail('unknown_field', `${path}.${unexpected}`, 'Unknown field')
}

const text = (value: unknown, path: string, max = 8_000): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) return fail('invalid_string', path, 'Expected a non-empty string within the contract limit')
  return value
}

const id = (value: unknown, path: string): string => {
  const parsed = text(value, path, 100)
  if (!idPattern.test(parsed)) fail('invalid_id', path, 'Expected a lowercase declarative ID')
  return parsed
}

const list = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) return fail('invalid_type', path, 'Expected an array')
  return value
}

const effectFields: Readonly<Record<string, readonly string[]>> = {
  addMetric: ['type', 'metricId', 'amount'],
  setFlag: ['type', 'flagId', 'value'],
  changeStage: ['type', 'stageId'],
  grantItem: ['type', 'inventoryId', 'definitionId', 'quantity', 'state'],
  consumeItem: ['type', 'inventoryId', 'quantity'],
  equipItem: ['type', 'inventoryId', 'slot'],
  unequipItem: ['type', 'slot'],
  setItemState: ['type', 'inventoryId', 'state'],
  setAppearanceOverride: ['type', 'slot', 'appearance'],
}

const parseEffectShape = (value: unknown, path: string): Effect => {
  const effect = object(value, path)
  if (typeof effect.type !== 'string' || !effectFields[effect.type]) return fail('unsupported_effect', `${path}.type`, 'Effect type is not supported by this contract')
  only(effect, effectFields[effect.type]!, path)
  return structuredClone(effect) as unknown as Effect
}

const parseConditionShape = (value: unknown, path: string, depth = 0): unknown => {
  if (depth > EXPERIENCE_LIMITS.conditionDepth) return fail('condition_depth', path, 'Condition depth exceeds the contract limit')
  const condition = object(value, path)
  if ('all' in condition || 'any' in condition || 'not' in condition) {
    const operator = 'all' in condition ? 'all' : 'any' in condition ? 'any' : 'not'
    only(condition, [operator], path)
    if (operator === 'not') return { not: parseConditionShape(condition.not, `${path}.not`, depth + 1) }
    const children = list(condition[operator], `${path}.${operator}`)
    if (!children.length) return fail('invalid_condition', `${path}.${operator}`, 'Compound conditions cannot be empty')
    return { [operator]: children.map((child, index) => parseConditionShape(child, `${path}.${operator}[${index}]`, depth + 1)) }
  }
  const fact = typeof condition.fact === 'string' ? condition.fact : ''
  const fields = fact === 'flag' ? ['fact', 'id', 'value']
    : fact === 'stage' || fact === 'capability' || fact === 'inventory' || fact === 'equipped' || fact === 'appearance' ? ['fact', 'id']
      : fact === 'metric' || fact === 'quantity' ? ['fact', 'id', 'op', 'value']
        : fact === 'itemState' ? ['fact', 'inventoryId', 'field', 'op', 'value']
          : undefined
  if (!fields) return fail('unsupported_condition', `${path}.fact`, 'Condition fact is not supported by this contract')
  only(condition, fields, path)
  return structuredClone(condition)
}

const validateAppearanceRefShape = (value: unknown, path: string) => {
  const reference = object(value, path)
  only(reference, ['packId', 'packVersion', 'appearanceId'], path)
  id(reference.packId, `${path}.packId`)
  id(reference.appearanceId, `${path}.appearanceId`)
  if (!Number.isSafeInteger(reference.packVersion) || Number(reference.packVersion) < 1) fail('invalid_appearance', `${path}.packVersion`, 'Appearance pack version must be a positive integer')
}

const parseInput = (value: unknown): ExperienceCandidateInput => {
  const candidate = object(value, 'candidate')
  only(candidate, ['name', 'initialStageId', 'metrics', 'flags', 'itemDefinitions', 'stages', 'rules'], 'candidate')
  const metrics = object(candidate.metrics, 'candidate.metrics')
  const flags = candidate.flags === undefined ? {} : object(candidate.flags, 'candidate.flags')
  const parsedMetrics: Record<string, number> = {}
  const parsedFlags: Record<string, boolean> = {}
  for (const [key, amount] of Object.entries(metrics)) {
    id(key, `candidate.metrics.${key}`)
    if (!Number.isFinite(amount)) fail('invalid_metric', `candidate.metrics.${key}`, 'Metric values must be finite numbers')
    parsedMetrics[key] = amount as number
  }
  for (const [key, enabled] of Object.entries(flags)) {
    id(key, `candidate.flags.${key}`)
    if (typeof enabled !== 'boolean') fail('invalid_flag', `candidate.flags.${key}`, 'Flag values must be boolean')
    parsedFlags[key] = enabled as boolean
  }

  const stages = list(candidate.stages, 'candidate.stages').map((raw, stageIndex) => {
    const path = `candidate.stages[${stageIndex}]`
    const stage = object(raw, path)
    only(stage, ['id', 'title', 'narrative', 'terminal', 'agentFallback', 'scene', 'actions'], path)
    if (stage.terminal !== undefined && typeof stage.terminal !== 'boolean') fail('invalid_type', `${path}.terminal`, 'Expected a boolean')
    if (stage.agentFallback !== undefined && typeof stage.agentFallback !== 'boolean') fail('invalid_type', `${path}.agentFallback`, 'Expected a boolean')
    const terminal = stage.terminal as boolean | undefined
    const agentFallback = stage.agentFallback as boolean | undefined
    const scene = stage.scene === undefined ? undefined : object(stage.scene, `${path}.scene`)
    if (scene) only(scene, ['compositionId', 'characterStateId'], `${path}.scene`)
    const actions = list(stage.actions, `${path}.actions`).map((rawAction, actionIndex) => {
      const actionPath = `${path}.actions[${actionIndex}]`
      const action = object(rawAction, actionPath)
      only(action, ['id', 'label', 'phrases', 'effects'], actionPath)
      return {
        id: id(action.id, `${actionPath}.id`),
        label: text(action.label, `${actionPath}.label`, 200),
        phrases: action.phrases === undefined ? [] : list(action.phrases, `${actionPath}.phrases`).map((phrase, phraseIndex) => text(phrase, `${actionPath}.phrases[${phraseIndex}]`, 500)),
        effects: action.effects === undefined ? [] : list(action.effects, `${actionPath}.effects`).map((effect, effectIndex) => parseEffectShape(effect, `${actionPath}.effects[${effectIndex}]`)),
      }
    })
    return {
      id: id(stage.id, `${path}.id`),
      title: text(stage.title, `${path}.title`, 500),
      narrative: text(stage.narrative, `${path}.narrative`),
      ...(terminal === undefined ? {} : { terminal }),
      ...(agentFallback === undefined ? {} : { agentFallback }),
      ...(scene ? { scene: {
        compositionId: id(scene.compositionId, `${path}.scene.compositionId`),
        ...(scene.characterStateId === undefined ? {} : { characterStateId: id(scene.characterStateId, `${path}.scene.characterStateId`) }),
      } } : {}),
      actions,
    }
  })

  const rules = candidate.rules === undefined ? [] : list(candidate.rules, 'candidate.rules').map((raw, ruleIndex) => {
    const path = `candidate.rules[${ruleIndex}]`
    const rule = object(raw, path)
    only(rule, ['ruleId', 'priority', 'when', 'effects'], path)
    if (!Number.isSafeInteger(rule.priority)) fail('invalid_priority', `${path}.priority`, 'Rule priority must be an integer')
    return {
      ruleId: id(rule.ruleId, `${path}.ruleId`),
      priority: rule.priority as number,
      when: parseConditionShape(rule.when, `${path}.when`),
      effects: list(rule.effects, `${path}.effects`).map((effect, effectIndex) => parseEffectShape(effect, `${path}.effects[${effectIndex}]`)),
    }
  })

  const itemDefinitions = candidate.itemDefinitions === undefined ? [] : list(candidate.itemDefinitions, 'candidate.itemDefinitions').map((raw, index) => {
    const definitionValue = object(raw, `candidate.itemDefinitions[${index}]`)
    const path = `candidate.itemDefinitions[${index}]`
    only(definitionValue, ['id', 'name', 'equipSlot', 'defaultAppearance', 'grants', 'actionIds', 'stackable', 'maxQuantity', 'stateSchema', 'appearanceFacts'], path)
    const definition = definitionValue as unknown as ItemDefinition
    id(definition.id, `${path}.id`)
    if (!itemIdPattern.test(definition.id)) fail('invalid_item_definition', `${path}.id`, 'Item definition ID is not runtime-compatible')
    text(definition.name, `${path}.name`, 200)
    if (definition.equipSlot !== undefined) id(definition.equipSlot, `${path}.equipSlot`)
    if (definition.defaultAppearance !== undefined) validateAppearanceRefShape(definition.defaultAppearance, `${path}.defaultAppearance`)
    for (const field of ['grants', 'actionIds'] as const) {
      if (definition[field] !== undefined) list(definition[field], `${path}.${field}`).forEach((value, itemIndex) => text(value, `${path}.${field}[${itemIndex}]`, 100))
    }
    if (definition.stackable !== undefined && typeof definition.stackable !== 'boolean') fail('invalid_item_definition', `${path}.stackable`, 'stackable must be boolean')
    if (definition.maxQuantity !== undefined && (!Number.isSafeInteger(definition.maxQuantity) || definition.maxQuantity < 1)) fail('invalid_item_definition', `${path}.maxQuantity`, 'maxQuantity must be a positive integer')
    if (definition.stateSchema !== undefined) object(definition.stateSchema, `${path}.stateSchema`)
    if (definition.appearanceFacts !== undefined) list(definition.appearanceFacts, `${path}.appearanceFacts`).forEach((rawBinding, bindingIndex) => {
      const bindingPath = `${path}.appearanceFacts[${bindingIndex}]`
      const binding = object(rawBinding, bindingPath)
      only(binding, ['appearance', 'facts'], bindingPath)
      validateAppearanceRefShape(binding.appearance, `${bindingPath}.appearance`)
      list(binding.facts, `${bindingPath}.facts`).forEach((fact, factIndex) => text(fact, `${bindingPath}.facts[${factIndex}]`, 100))
    })
    return structuredClone(definition)
  })

  return {
    name: text(candidate.name, 'candidate.name', 200),
    initialStageId: id(candidate.initialStageId, 'candidate.initialStageId'),
    metrics: parsedMetrics,
    flags: parsedFlags,
    itemDefinitions,
    stages,
    rules,
  }
}

const appearanceKey = (reference: AppearanceRef) => `${reference.packId}@${reference.packVersion}:${reference.appearanceId}`

const visitCondition = (condition: Condition, visitor: (condition: Exclude<Condition, { all: Condition[] } | { any: Condition[] } | { not: Condition }>) => void) => {
  if ('all' in condition) condition.all.forEach((child) => visitCondition(child, visitor))
  else if ('any' in condition) condition.any.forEach((child) => visitCondition(child, visitor))
  else if ('not' in condition) visitCondition(condition.not, visitor)
  else visitor(condition)
}

const possibleRuleSources = (condition: Condition, allStages: ReadonlySet<string>): Set<string> => {
  if ('not' in condition) return new Set(allStages)
  if ('all' in condition) {
    return condition.all.reduce<Set<string>>((possible, child) => {
      const childSources = possibleRuleSources(child, allStages)
      return new Set([...possible].filter((stageId) => childSources.has(stageId)))
    }, new Set(allStages))
  }
  if ('any' in condition) {
    const possible = new Set<string>()
    condition.any.forEach((child) => possibleRuleSources(child, allStages).forEach((stageId) => possible.add(stageId)))
    return possible
  }
  return condition.fact === 'stage' ? new Set([condition.id]) : new Set(allStages)
}

const validateExperience = (draft: ExperienceDraft, resources: ValidatedStarterPackage, input: ExperienceCandidateInput) => {
  if (!input.stages.length || input.stages.length > EXPERIENCE_LIMITS.stages) fail('stage_limit', 'candidate.stages', 'Stage count is outside the contract limit')
  if ((input.rules?.length ?? 0) > EXPERIENCE_LIMITS.rules) fail('rule_limit', 'candidate.rules', 'Rule count exceeds the contract limit')
  const stages = new Map(input.stages.map((stage) => [stage.id, stage]))
  if (stages.size !== input.stages.length) fail('duplicate_stage', 'candidate.stages', 'Stage IDs must be unique')
  if (!stages.has(input.initialStageId)) fail('missing_initial_stage', 'candidate.initialStageId', 'Initial stage does not exist')
  for (const required of resources.starter.skeleton.requiredStageIds) if (!stages.has(required)) fail('missing_skeleton_stage', 'candidate.stages', `Required skeleton stage is missing: ${required}`)
  for (const required of resources.starter.skeleton.requiredMetricIds) if (!(required in input.metrics)) fail('missing_skeleton_metric', 'candidate.metrics', `Required skeleton metric is missing: ${required}`)

  const characterStates = new Set(resources.starter.characterStates.map(({ id: stateId }) => stateId))
  const sceneCompositions = new Set(resources.starter.scenePack.compositions.map(({ id: compositionId }) => compositionId))
  const initial = stages.get(input.initialStageId)!
  if (initial.scene?.compositionId !== draft.sceneCompositionId || initial.scene.characterStateId !== draft.characterStateId) {
    fail('initial_scene_mismatch', `candidate.stages.${initial.id}.scene`, 'Initial stage must use the visual references selected by the Experience Draft')
  }

  const definitions = new Map((input.itemDefinitions ?? []).map((definition) => [definition.id, definition]))
  if (definitions.size !== (input.itemDefinitions?.length ?? 0)) fail('duplicate_item_definition', 'candidate.itemDefinitions', 'Item definition IDs must be unique')
  const appearances = new Set(resources.starter.characterPack.appearances.map(({ id: appearanceId }) => appearanceKey({
    packId: resources.starter.characterPack.id,
    packVersion: resources.starter.characterPack.version,
    appearanceId,
  })))
  const capabilities = new Set<string>()
  const appearanceFacts = new Set<string>()
  for (const definition of definitions.values()) {
    definition.grants?.forEach((value) => capabilities.add(value))
    if (definition.defaultAppearance && !appearances.has(appearanceKey(definition.defaultAppearance))) fail('unknown_appearance', 'candidate.itemDefinitions', `Unknown appearance: ${appearanceKey(definition.defaultAppearance)}`)
    for (const binding of definition.appearanceFacts ?? []) {
      if (!appearances.has(appearanceKey(binding.appearance))) fail('unknown_appearance', 'candidate.itemDefinitions', `Unknown appearance: ${appearanceKey(binding.appearance)}`)
      binding.facts.forEach((fact) => appearanceFacts.add(fact))
    }
  }

  const parsedRules = (input.rules ?? []).map((rule, index) => {
    if (rule.effects.length > EXPERIENCE_LIMITS.effectsPerActionOrRule) fail('effect_limit', `candidate.rules[${index}].effects`, 'Rule effect count exceeds the contract limit')
    try { return parsePlaybookRule(rule) } catch (error) {
      return fail('invalid_rule', `candidate.rules[${index}]`, error instanceof Error ? error.message : 'Invalid rule')
    }
  })
  if (new Set(parsedRules.map(({ id: ruleId }) => ruleId)).size !== parsedRules.length) fail('duplicate_rule', 'candidate.rules', 'Rule IDs must be unique')

  const allEffects: Effect[] = []
  const grantedInventoryIds = new Set<string>()
  const preparedActionIds = new Set<string>()
  const edges = new Map<string, Set<string>>([...stages].map(([stageId]) => [stageId, new Set()]))
  for (const [stageId, stage] of stages) {
    if (stage.actions.length > EXPERIENCE_LIMITS.actionsPerStage) fail('action_limit', `candidate.stages.${stageId}.actions`, 'Action count exceeds the contract limit')
    if (!stage.terminal && !stage.agentFallback && !stage.actions.length) fail('stage_without_route', `candidate.stages.${stageId}`, 'Reachable non-terminal stages need a local action or agent fallback')
    if (stage.scene && (!sceneCompositions.has(stage.scene.compositionId) || (stage.scene.characterStateId && !characterStates.has(stage.scene.characterStateId)))) {
      fail('unknown_visual_reference', `candidate.stages.${stageId}.scene`, 'Stage scene references must come from the selected Starter package')
    }
    const actionIds = new Set<string>()
    const phrases = new Map<string, string>()
    stage.actions.forEach((action, index) => {
      if (actionIds.has(action.id)) fail('duplicate_action', `candidate.stages.${stageId}.actions[${index}].id`, 'Action IDs must be unique within a stage')
      actionIds.add(action.id)
      preparedActionIds.add(action.id)
      if ((action.effects?.length ?? 0) > EXPERIENCE_LIMITS.effectsPerActionOrRule) fail('effect_limit', `candidate.stages.${stageId}.actions[${index}].effects`, 'Action effect count exceeds the contract limit')
      const parsed = (() => {
        try { return parsePreparedAction(action) } catch (error) {
          return fail('invalid_action', `candidate.stages.${stageId}.actions[${index}]`, error instanceof Error ? error.message : 'Invalid action')
        }
      })()
      for (const phrase of parsed.phrases) {
        const normalized = normalizePhrase(phrase)
        const prior = phrases.get(normalized)
        if (prior && prior !== action.id) fail('ambiguous_phrase', `candidate.stages.${stageId}.actions[${index}].phrases`, `Prepared phrase is also used by action ${prior}`)
        phrases.set(normalized, action.id)
      }
      for (const effect of parsed.effects) {
        allEffects.push(effect)
        if (effect.type === 'changeStage') edges.get(stageId)!.add(effect.stageId)
        if (effect.type === 'grantItem') grantedInventoryIds.add(effect.inventoryId)
      }
    })
  }

  for (const rule of parsedRules) {
    const targets = rule.effects.filter((effect): effect is Extract<Effect, { type: 'changeStage' }> => effect.type === 'changeStage')
    possibleRuleSources(rule.when, new Set(stages.keys())).forEach((source) => targets.forEach(({ stageId }) => edges.get(source)?.add(stageId)))
    allEffects.push(...rule.effects)
  }

  for (const definition of definitions.values()) {
    for (const actionId of definition.actionIds ?? []) if (!preparedActionIds.has(actionId)) fail('unknown_action', 'candidate.itemDefinitions', `Item definition references an unknown action: ${actionId}`)
  }

  for (const [source, targets] of edges) for (const target of targets) if (!stages.has(target)) fail('unknown_stage_target', `candidate.stages.${source}`, `Unknown stage target: ${target}`)
  const definedFlags = new Set(Object.keys(input.flags ?? {}))
  allEffects.filter((effect): effect is Extract<Effect, { type: 'setFlag' }> => effect.type === 'setFlag').forEach(({ flagId }) => definedFlags.add(flagId))
  for (const [index, effect] of allEffects.entries()) {
    if (effect.type === 'addMetric' && !(effect.metricId in input.metrics)) fail('unknown_metric', `candidate.effects[${index}]`, `Unknown metric: ${effect.metricId}`)
    if (effect.type === 'grantItem') {
      if (!itemIdPattern.test(effect.inventoryId)) fail('invalid_inventory_id', `candidate.effects[${index}]`, `Invalid inventory ID: ${effect.inventoryId}`)
      if (!definitions.has(effect.definitionId) || !Number.isSafeInteger(effect.quantity) || effect.quantity < 1) fail('unknown_item_definition', `candidate.effects[${index}]`, `Unknown or invalid item definition: ${effect.definitionId}`)
    } else if ((effect.type === 'consumeItem' || effect.type === 'equipItem' || effect.type === 'setItemState') && !grantedInventoryIds.has(effect.inventoryId)) {
      fail('unknown_inventory_item', `candidate.effects[${index}]`, `Inventory item is never granted: ${effect.inventoryId}`)
    } else if (effect.type === 'setAppearanceOverride' && effect.appearance && !appearances.has(appearanceKey(effect.appearance))) {
      fail('unknown_appearance', `candidate.effects[${index}]`, `Unknown appearance: ${appearanceKey(effect.appearance)}`)
    }
  }

  for (const [index, rule] of parsedRules.entries()) visitCondition(rule.when, (condition) => {
    if (condition.fact === 'metric' && !(condition.id in input.metrics)) fail('unknown_metric', `candidate.rules[${index}].when`, `Unknown metric: ${condition.id}`)
    if (condition.fact === 'flag' && !definedFlags.has(condition.id)) fail('unknown_flag', `candidate.rules[${index}].when`, `Unknown flag: ${condition.id}`)
    if (condition.fact === 'stage' && !stages.has(condition.id)) fail('unknown_stage', `candidate.rules[${index}].when`, `Unknown stage: ${condition.id}`)
    if ((condition.fact === 'inventory' || condition.fact === 'equipped' || condition.fact === 'quantity') && !definitions.has(condition.id)) fail('unknown_item_definition', `candidate.rules[${index}].when`, `Unknown item definition: ${condition.id}`)
    if (condition.fact === 'itemState' && !grantedInventoryIds.has(condition.inventoryId)) fail('unknown_inventory_item', `candidate.rules[${index}].when`, `Inventory item is never granted: ${condition.inventoryId}`)
    if (condition.fact === 'capability' && !capabilities.has(condition.id)) fail('unknown_capability', `candidate.rules[${index}].when`, `Unknown capability: ${condition.id}`)
    if (condition.fact === 'appearance' && !appearanceFacts.has(condition.id)) fail('unknown_appearance_fact', `candidate.rules[${index}].when`, `Unknown appearance fact: ${condition.id}`)
  })

  const reachable = new Set<string>()
  const pending = [input.initialStageId]
  while (pending.length) {
    const stageId = pending.pop()!
    if (reachable.has(stageId)) continue
    reachable.add(stageId)
    pending.push(...(edges.get(stageId) ?? []))
  }
  if (reachable.size !== stages.size) fail('unreachable_stage', 'candidate.stages', 'Every authored stage must be reachable from the initial stage')
  if (draft.seed.completionMode === 'finite') {
    const escapable = new Set([...reachable].filter((stageId) => stages.get(stageId)?.terminal || stages.get(stageId)?.agentFallback))
    let changed = true
    while (changed) {
      changed = false
      for (const stageId of reachable) {
        if (!escapable.has(stageId) && [...(edges.get(stageId) ?? [])].some((target) => escapable.has(target))) {
          escapable.add(stageId)
          changed = true
        }
      }
    }
    if (![...reachable].some((stageId) => stages.get(stageId)?.terminal)) fail('missing_terminal_stage', 'candidate.stages', 'Finite experiences require a reachable terminal stage')
    if ([...reachable].some((stageId) => !escapable.has(stageId))) fail('closed_finite_component', 'candidate.stages', 'Finite experience contains a reachable component without an exit or agent fallback')
  }
}

export function assembleExperienceCandidate(
  bundleId: string,
  draft: ExperienceDraft,
  resources: ValidatedStarterPackage,
  value: unknown,
  createdAt = Date.now(),
): AuthoredExperienceCandidate {
  if (
    draft.starter.id !== resources.starter.id ||
    draft.starter.version !== resources.starter.version ||
    draft.starter.manifestSha256 !== resources.manifestSha256
  ) fail('starter_mismatch', 'draft.starter', 'Validated Starter resources do not match the draft')
  const input = parseInput(value)
  validateExperience(draft, resources, input)
  const plan = compileBundle(manifestFiles)
  const runId = `run:${bundleId}`
  const record: BundleRecord = {
    id: bundleId,
    manifestFiles,
    semanticFingerprint: plan.semanticFingerprint,
    identity: {
      contractVersion: 1,
      backboneVersion: FIXED_BACKBONE_VERSION,
      templateId: draft.starter.id,
      templateVersion: String(draft.starter.version),
    },
    createdAt,
    metadata: {
      name: input.name,
      runId,
      starter: {
        id: draft.starter.id,
        version: draft.starter.version,
        manifestSha256: draft.starter.manifestSha256,
        directionId: draft.direction.id,
        seed: structuredClone(draft.seed),
      },
    },
  }
  const entries: AuthoredExperienceCandidate['entries'] = [
    {
      id: runId,
      collection: 'runs',
      data: {
        currentStageId: input.initialStageId,
        revision: 0,
        status: 'active',
        metrics: structuredClone(input.metrics),
        flags: structuredClone(input.flags ?? {}),
      },
    },
    ...input.stages.map(({ id: stageId, ...data }) => ({ id: stageId, collection: 'stages', data: { ...data, progress: [] } })),
    ...(input.rules ?? []).map((data) => ({ id: `rule:${data.ruleId}`, collection: 'rules', data })),
    ...(input.itemDefinitions ?? []).map((definition) => ({ id: `definition:${definition.id}`, collection: 'item-definitions', data: { definition } })),
    { id: `pack:${resources.starter.characterPack.id}`, collection: 'character-packs', data: { pack: resources.starter.characterPack } },
    ...resources.starter.characterStates.map(({ id: stateId, ...data }) => ({ id: stateId, collection: 'character-states', data })),
    ...resources.starter.scenePack.assets.map(({ id: assetId, ...data }) => ({ id: assetId, collection: 'scene-assets', data })),
    ...resources.starter.scenePack.compositions.map(({ id: compositionId, ...data }) => ({ id: compositionId, collection: 'scene-compositions', data })),
  ]
  if (new Set(entries.map(({ id: entryId }) => entryId)).size !== entries.length) fail('duplicate_entry', 'candidate', 'Resolved runtime entry IDs must be globally unique')
  const validator = new EntryDataValidator()
  for (const entry of entries) {
    const schema = plan.schemas[entry.collection]?.manifest
    if (!schema) fail('unknown_collection', `candidate.${entry.collection}`, `Unknown collection: ${entry.collection}`)
    const errors = validator.validate(schema, entry.data)
    if (errors.length) fail('invalid_entry', `candidate.${entry.collection}.${entry.id}`, `Entry violates the fixed schema at ${errors.map(({ path }) => path).join(', ')}`)
  }

  const blobs = new Map(resources.assets.map(({ id: assetId, blob }) => [assetId, blob]))
  const characterState = resources.starter.characterStates.find(({ id: stateId }) => stateId === draft.characterStateId)!
  const characterLayers = resolveCharacterComposition(resources.starter.characterPack, characterState.composition)
    .map((layer) => ({ ...layer, blob: blobs.get(layer.blobId)! }))
  const sceneComposition = resources.starter.scenePack.compositions.find(({ id: compositionId }) => compositionId === draft.sceneCompositionId)!
  const sceneLayers = resolveSceneComposition(
    sceneComposition,
    new Map(resources.starter.scenePack.assets.map((asset) => [asset.id, asset])),
    resources.sceneInspections,
  ).map((layer) => ({ ...layer, blob: blobs.get(layer.blobId)! }))
  const initial = input.stages.find(({ id: stageId }) => stageId === input.initialStageId)!

  return {
    record,
    entries,
    assets: structuredClone(resources.assets),
    preview: {
      source: 'starter',
      bundleId,
      name: input.name,
      starter: { id: draft.starter.id, version: draft.starter.version, name: draft.starter.name },
      direction: { id: draft.direction.id, name: draft.direction.name },
      seed: structuredClone(draft.seed),
      stageCount: input.stages.length,
      initialTitle: initial.title,
      initialNarrative: initial.narrative,
      agentFallbackCount: input.stages.filter(({ agentFallback }) => agentFallback).length,
      characterLayers,
      sceneLayers,
    },
  }
}
