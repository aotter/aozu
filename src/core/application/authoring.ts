import { EntryDataValidator, firstZodIssueAsJsonPointer, jsonSchemaToZod } from '@aotter/mantle-spec'

import { compileBundle, type BundleRecord } from '../bundle.ts'
import type { AppearanceRef, CharacterDraft } from '../domain/character.ts'
import type { ItemDefinition } from '../domain/items.ts'
import {
  normalizePhrase,
  EXPERIENCE_CANDIDATE_SCHEMA,
  parseCondition,
  type Condition,
  type Effect,
  type MetricProgressBinding,
} from '../domain/playbook.ts'
import { resolveSceneComposition } from '../domain/scene.ts'
import {
  type ExperienceCandidatePreviewSnapshot,
  type ExperienceDraft,
  type ExperienceSeed,
  type ValidatedStarterPackage,
  sameExperienceSeed,
} from '../domain/starter.ts'
import { FIXED_BACKBONE_SOURCES, FIXED_BACKBONE_VERSION } from '../mantle/backbone.ts'
import { buildCharacterDraftResources } from './character-creation.ts'

export const AUTHORING_NAMESPACE = 'companion-authoring'

export interface ExperienceCandidateInput {
  name: string
  seed: ExperienceSeed
  initialStageId: string
  metrics: Record<string, number>
  flags: Record<string, boolean>
  itemDefinitions: ItemDefinition[]
  stages: Array<{
    id: string
    title: string
    narrative: string
    terminal?: boolean
    agentFallback?: boolean
    scene?: { compositionId?: string; characterStateId?: string }
    actions: Array<{ id: string; label: string; phrases: string[]; effects: Effect[] }>
    progress: MetricProgressBinding[]
  }>
  rules: Array<{ ruleId: string; priority: number; when: Condition; effects: Effect[] }>
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
const candidateValidator = jsonSchemaToZod(EXPERIENCE_CANDIDATE_SCHEMA)

const fail = (code: string, path: string, message: string): never => {
  throw new ExperienceCandidateValidationError({ code, path, message })
}

const parseInput = (value: unknown): ExperienceCandidateInput => {
  const parsed = candidateValidator.safeParse(value)
  if (!parsed.success) {
    const issue = firstZodIssueAsJsonPointer(parsed.error)
    return fail('invalid_candidate', `candidate${issue.instancePath}`, issue.message)
  }
  const candidate = parsed.data as ExperienceCandidateInput
  for (const field of ['metrics', 'flags'] as const) {
    for (const key of Object.keys(candidate[field] ?? {})) {
      if (!idPattern.test(key)) fail('invalid_id', `candidate.${field}.${key}`, 'Expected a lowercase declarative ID')
    }
  }
  return {
    ...candidate,
    flags: candidate.flags ?? {},
    itemDefinitions: candidate.itemDefinitions ?? [],
    rules: candidate.rules ?? [],
    stages: candidate.stages.map((stage) => ({
      ...stage,
      actions: stage.actions.map((action) => ({ ...action, phrases: action.phrases ?? [], effects: action.effects ?? [] })),
      progress: stage.progress ?? [],
    })),
  }
}

const appearanceKey = (reference: AppearanceRef) => `${reference.packId}@${reference.packVersion}:${reference.appearanceId}`

const visitCondition = (condition: Condition, visitor: (condition: Exclude<Condition, { all: Condition[] } | { any: Condition[] } | { not: Condition }>) => void) => {
  if ('all' in condition) condition.all.forEach((child) => visitCondition(child, visitor))
  else if ('any' in condition) condition.any.forEach((child) => visitCondition(child, visitor))
  else if ('not' in condition) visitCondition(condition.not, visitor)
  else visitor(condition)
}

const conditionCanBe = (condition: Condition, stageId: string, truth: boolean): boolean => {
  if ('not' in condition) return conditionCanBe(condition.not, stageId, !truth)
  if ('all' in condition) return truth
    ? condition.all.every((child) => conditionCanBe(child, stageId, true))
    : condition.all.some((child) => conditionCanBe(child, stageId, false))
  if ('any' in condition) return truth
    ? condition.any.some((child) => conditionCanBe(child, stageId, true))
    : condition.any.every((child) => conditionCanBe(child, stageId, false))
  if (condition.fact !== 'stage') return true
  return truth ? condition.id === stageId : condition.id !== stageId
}

const possibleRuleSources = (condition: Condition, allStages: ReadonlySet<string>): Set<string> =>
  new Set([...allStages].filter((stageId) => conditionCanBe(condition, stageId, true)))

const validateExperience = (
  draft: ExperienceDraft,
  storyResources: ValidatedStarterPackage | null,
  character: ReturnType<typeof buildCharacterDraftResources>,
  input: ExperienceCandidateInput,
) => {
  const stages = new Map(input.stages.map((stage) => [stage.id, stage]))
  if (stages.size !== input.stages.length) fail('duplicate_stage', 'candidate.stages', 'Stage IDs must be unique')
  if (!stages.has(input.initialStageId)) fail('missing_initial_stage', 'candidate.initialStageId', 'Initial stage does not exist')
  for (const required of storyResources?.starter.skeleton.requiredStageIds ?? []) if (!stages.has(required)) fail('missing_skeleton_stage', 'candidate.stages', `Required skeleton stage is missing: ${required}`)
  for (const required of storyResources?.starter.skeleton.requiredMetricIds ?? []) if (!(required in input.metrics)) fail('missing_skeleton_metric', 'candidate.metrics', `Required skeleton metric is missing: ${required}`)

  const sceneCompositions = new Set(storyResources?.starter.scenePack.compositions.map(({ id }) => id) ?? [])
  const initial = stages.get(input.initialStageId)!
  if (!initial.scene || initial.scene.characterStateId !== character.state.id || initial.scene.compositionId !== draft.story?.sceneCompositionId) fail(
    'initial_scene_mismatch', `candidate.stages.${initial.id}.scene`,
    'Initial stage must use the current Character Draft and the selected Story scene, if any',
  )
  if (draft.story && !sameExperienceSeed(input.seed, draft.story.seed)) fail('seed_mismatch', 'candidate.seed', 'Candidate seed must match the selected Story')

  const definitions = new Map((input.itemDefinitions ?? []).map((definition) => [definition.id, definition]))
  if (definitions.size !== (input.itemDefinitions?.length ?? 0)) fail('duplicate_item_definition', 'candidate.itemDefinitions', 'Item definition IDs must be unique')
  const appearances = new Set(character.pack.appearances.map(({ id: appearanceId }) => appearanceKey({
    packId: character.pack.id,
    packVersion: character.pack.version,
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

  const parsedRules = input.rules.map((rule, index) => {
    try {
      return { id: rule.ruleId, priority: rule.priority, when: parseCondition(rule.when), effects: rule.effects }
    } catch (error) {
      return fail('condition_depth', `candidate.rules[${index}].when`, error instanceof Error ? error.message : 'Invalid Condition')
    }
  })
  if (new Set(parsedRules.map(({ id: ruleId }) => ruleId)).size !== parsedRules.length) fail('duplicate_rule', 'candidate.rules', 'Rule IDs must be unique')

  const allEffects: Effect[] = []
  const grantedInventoryIds = new Set<string>()
  const preparedActionIds = new Set<string>()
  const phrases = new Map<string, string>()
  const edges = new Map<string, Set<string>>([...stages].map(([stageId]) => [stageId, new Set()]))
  for (const [stageId, stage] of stages) {
    if (stage.terminal && (stage.actions.length || stage.agentFallback)) fail('invalid_terminal_stage', `candidate.stages.${stageId}`, 'Terminal stages cannot expose actions or agent fallback')
    if (!stage.terminal && !stage.agentFallback && !stage.actions.length) fail('stage_without_route', `candidate.stages.${stageId}`, 'Reachable non-terminal stages need a local action or agent fallback')
    if (stage.scene && (
      (!stage.scene.compositionId && !stage.scene.characterStateId) ||
      (stage.scene.compositionId && !sceneCompositions.has(stage.scene.compositionId)) ||
      (stage.scene.characterStateId && stage.scene.characterStateId !== character.state.id)
    )) {
      fail('unknown_visual_reference', `candidate.stages.${stageId}.scene`, 'Stage visuals must use the current Character Draft and selected Story resources')
    }
    stage.actions.forEach((action, index) => {
      if (preparedActionIds.has(action.id)) fail('duplicate_action', `candidate.stages.${stageId}.actions[${index}].id`, 'Action IDs must be globally unique')
      preparedActionIds.add(action.id)
      for (const phrase of action.phrases) {
        const normalized = normalizePhrase(phrase)
        const prior = phrases.get(normalized)
        if (prior) fail('ambiguous_phrase', `candidate.stages.${stageId}.actions[${index}].phrases`, `Prepared phrase is already used by action ${prior}`)
        phrases.set(normalized, action.id)
      }
      for (const effect of action.effects) {
        allEffects.push(effect)
        if (effect.type === 'changeStage') edges.get(stageId)!.add(effect.stageId)
      }
    })
    if (new Set(stage.progress.map(({ id }) => id)).size !== stage.progress.length) fail('duplicate_progress_binding', `candidate.stages.${stageId}.progress`, 'Progress binding IDs must be unique within a stage')
    stage.progress.forEach((binding, index) => {
      if (!(binding.source.id in input.metrics)) fail('unknown_metric', `candidate.stages.${stageId}.progress[${index}]`, `Unknown metric: ${binding.source.id}`)
    })
  }

  for (const rule of parsedRules) {
    const targets = rule.effects.filter((effect): effect is Extract<Effect, { type: 'changeStage' }> => effect.type === 'changeStage')
    possibleRuleSources(rule.when, new Set(stages.keys()))
      .forEach((source) => {
        if (!stages.get(source)?.terminal) targets.forEach(({ stageId }) => edges.get(source)?.add(stageId))
      })
    allEffects.push(...rule.effects)
  }
  allEffects.forEach((effect) => {
    if (effect.type === 'grantItem') grantedInventoryIds.add(effect.inventoryId)
  })

  for (const definition of definitions.values()) {
    for (const actionId of definition.actionIds ?? []) if (!preparedActionIds.has(actionId)) fail('unknown_action', 'candidate.itemDefinitions', `Item definition references an unknown action: ${actionId}`)
  }

  for (const [source, targets] of edges) for (const target of targets) if (!stages.has(target)) fail('unknown_stage_target', `candidate.stages.${source}`, `Unknown stage target: ${target}`)
  const definedFlags = new Set(Object.keys(input.flags ?? {}))
  for (const [index, effect] of allEffects.entries()) {
    if (effect.type === 'addMetric' && !(effect.metricId in input.metrics)) fail('unknown_metric', `candidate.effects[${index}]`, `Unknown metric: ${effect.metricId}`)
    if (effect.type === 'setFlag' && !definedFlags.has(effect.flagId)) fail('unknown_flag', `candidate.effects[${index}]`, `Unknown flag: ${effect.flagId}`)
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
  if (input.seed.completionMode === 'finite') {
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
  } else if (![...reachable].some((stageId) => {
    const stage = stages.get(stageId)!
    return !stage.terminal && (stage.actions.length > 0 || stage.agentFallback)
  })) {
    fail('missing_continuing_route', 'candidate.stages', 'Continuous experiences require a reachable local action or agent fallback')
  }
}

export function assembleExperienceCandidate(
  bundleId: string,
  draft: ExperienceDraft,
  storyResources: ValidatedStarterPackage | null,
  characterDraft: CharacterDraft,
  value: unknown,
  createdAt = Date.now(),
): AuthoredExperienceCandidate {
  if (draft.story ? (
    !storyResources ||
    draft.story.starter.id !== storyResources.starter.id ||
    draft.story.starter.version !== storyResources.starter.version ||
    draft.story.starter.manifestSha256 !== storyResources.manifestSha256
  ) : storyResources) fail('starter_mismatch', 'draft.story', 'Validated Story resources do not match the draft')
  const input = parseInput(value)
  const character = buildCharacterDraftResources(characterDraft)
  validateExperience(draft, storyResources, character, input)
  const plan = compileBundle(manifestFiles)
  const runId = `run:${bundleId}`
  const story = draft.story
  const record: BundleRecord = {
    id: bundleId,
    manifestFiles,
    semanticFingerprint: plan.semanticFingerprint,
    identity: {
      contractVersion: 2,
      backboneVersion: FIXED_BACKBONE_VERSION,
      templateId: story?.starter.id ?? 'custom-experience',
      templateVersion: String(story?.starter.version ?? 1),
      loopIds: structuredClone(input.seed.loopIds),
      completionMode: input.seed.completionMode,
    },
    createdAt,
    metadata: {
      name: input.name,
      runId,
      ...(story ? { starter: {
        id: story.starter.id,
        version: story.starter.version,
        manifestSha256: story.starter.manifestSha256,
        directionId: story.direction.id,
        seed: structuredClone(story.seed),
      } } : {}),
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
    ...input.stages.map(({ id: stageId, ...data }) => ({ id: stageId, collection: 'stages', data })),
    ...(input.rules ?? []).map((data) => ({ id: `rule:${data.ruleId}`, collection: 'rules', data })),
    ...(input.itemDefinitions ?? []).map((definition) => ({ id: `definition:${definition.id}`, collection: 'item-definitions', data: { definition } })),
    { id: `pack:${character.pack.id}`, collection: 'character-packs', data: { pack: character.pack } },
    { id: character.state.id, collection: 'character-states', data: {
      packId: character.state.packId,
      packVersion: character.state.packVersion,
      composition: character.state.composition,
    } },
    ...(storyResources?.starter.scenePack.assets.map(({ id: assetId, ...data }) => ({ id: assetId, collection: 'scene-assets', data })) ?? []),
    ...(storyResources?.starter.scenePack.compositions.map(({ id: compositionId, ...data }) => ({ id: compositionId, collection: 'scene-compositions', data })) ?? []),
  ]
  if (new Set(entries.map(({ id: entryId }) => entryId)).size !== entries.length) fail('duplicate_entry', 'candidate', 'Resolved runtime entry IDs must be globally unique')
  const validator = new EntryDataValidator()
  for (const entry of entries) {
    const schema = plan.schemas[entry.collection]?.manifest
    if (!schema) fail('unknown_collection', `candidate.${entry.collection}`, `Unknown collection: ${entry.collection}`)
    const errors = validator.validate(schema, entry.data)
    if (errors.length) fail('invalid_entry', `candidate.${entry.collection}.${entry.id}`, `Entry violates the fixed schema at ${errors.map(({ path }) => path).join(', ')}`)
  }

  const storyBlobs = new Map(storyResources?.assets.map(({ id, blob }) => [id, blob]) ?? [])
  const sceneAssets = storyResources?.starter.scenePack.assets.map(({ blobId }) => ({ id: blobId, blob: storyBlobs.get(blobId)! })) ?? []
  const assets = [...character.assets, ...sceneAssets]
  if (new Set(assets.map(({ id }) => id)).size !== assets.length) fail('duplicate_asset', 'candidate', 'Resolved runtime asset IDs must be globally unique')
  const sceneComposition = story && storyResources
    ? storyResources.starter.scenePack.compositions.find(({ id }) => id === story.sceneCompositionId)
    : undefined
  const sceneLayers = sceneComposition && storyResources ? resolveSceneComposition(
    sceneComposition,
    new Map(storyResources.starter.scenePack.assets.map((asset) => [asset.id, asset])),
    storyResources.sceneInspections,
  ).map((layer) => ({ ...layer, blob: storyBlobs.get(layer.blobId)! })) : []
  const initial = input.stages.find(({ id: stageId }) => stageId === input.initialStageId)!

  return {
    record,
    entries,
    assets,
    preview: {
      source: 'experience',
      bundleId,
      name: input.name,
      story: story ? {
        starter: { id: story.starter.id, version: story.starter.version, name: story.starter.name },
        direction: { id: story.direction.id, name: story.direction.name },
      } : null,
      seed: structuredClone(input.seed),
      stageCount: input.stages.length,
      initialTitle: initial.title,
      initialNarrative: initial.narrative,
      agentFallbackCount: input.stages.filter(({ agentFallback }) => agentFallback).length,
      characterLayers: character.layers,
      sceneLayers,
    },
  }
}
