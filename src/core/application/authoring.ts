import { EntryDataValidator } from '@aotter/mantle-spec'

import { compileBundle, type BundleRecord } from '../bundle.ts'
import { FIXED_BACKBONE_SOURCES, FIXED_BACKBONE_VERSION } from '../mantle/backbone.ts'
import type { BundleActivationRepository, EntryRepositoryFactory } from './ports.ts'
import type { StagedCandidatePreview } from './candidate.ts'
import { parsePlaybookRule, parsePreparedAction, type Effect } from './playbook.ts'

export interface AgentCustomization {
  id: string
  name: string
  completionMode: 'finite' | 'continuous'
  initialStageId: string
  stages: Array<{
    id: string
    title: string
    narrative: string
    terminal?: boolean
    agentFallback?: boolean
    actions: Array<{ id: string; label: string; phrases?: string[]; effects?: Effect[] }>
  }>
  rules?: Array<{ ruleId: string; priority: number; when: unknown; effects: Effect[] }>
}

export interface AuthoredCandidate {
  record: BundleRecord
  entries: Array<{ id: string; collection: string; data: Record<string, unknown> }>
  preview: { name: string; stageCount: number; initialTitle: string }
}

const manifestFiles = Object.fromEntries(FIXED_BACKBONE_SOURCES.map(({ sourceId, text }) => [sourceId, text]))

export const DEFAULT_CUSTOMIZATION: AgentCustomization = {
  id: 'trail-guide',
  name: 'Trail Guide',
  completionMode: 'continuous',
  initialStageId: 'trailhead',
  stages: [
    {
      id: 'trailhead',
      title: 'At the trailhead',
      narrative: 'Your guide waits beside a rain-darkened map.',
      agentFallback: true,
      actions: [
        {
          id: 'set-out',
          label: 'Set out together',
          phrases: ['let us go', "let's go"],
          effects: [{ type: 'addMetric', metricId: 'bond', amount: 1 }],
        },
      ],
    },
  ],
}

export const createDefaultCustomizationSeed = (): AgentCustomization =>
  structuredClone(DEFAULT_CUSTOMIZATION)

export function assembleAuthoredCandidate(
  bundleId: string,
  customization: AgentCustomization,
  createdAt = Date.now(),
): AuthoredCandidate {
  validateCustomization(customization)
  const plan = compileBundle(manifestFiles)
  const runId = `run:${customization.id}`
  const record: BundleRecord = {
    id: bundleId,
    manifestFiles,
    semanticFingerprint: plan.semanticFingerprint,
    identity: {
      contractVersion: 1,
      backboneVersion: FIXED_BACKBONE_VERSION,
      templateId: 'adventure',
      templateVersion: '1',
    },
    createdAt,
    metadata: { name: customization.name, runId },
  }
  const entries = [
    {
      id: runId,
      collection: 'runs',
      data: {
        currentStageId: customization.initialStageId,
        revision: 0,
        status: 'active',
        metrics: { bond: 0 },
        flags: {},
      },
    },
    ...customization.stages.map(({ id, ...data }) => ({ id, collection: 'stages', data: { ...data, progress: [] } })),
    ...(customization.rules ?? []).map((data) => ({ id: `rule:${data.ruleId}`, collection: 'rules', data })),
  ]
  const validator = new EntryDataValidator()
  for (const entry of entries) {
    const schema = plan.schemas[entry.collection]?.manifest
    if (!schema) throw new Error(`Unknown collection: ${entry.collection}`)
    const errors = validator.validate(schema, entry.data)
    if (errors.length) throw new Error(`Invalid ${entry.collection}/${entry.id}: ${errors.map(({ path }) => path).join(', ')}`)
  }
  const initial = customization.stages.find(({ id }) => id === customization.initialStageId)!
  return {
    record,
    entries,
    preview: { name: customization.name, stageCount: customization.stages.length, initialTitle: initial.title },
  }
}

export async function stageAuthoredCandidate(
  bundles: BundleActivationRepository,
  entriesFor: EntryRepositoryFactory,
  candidate: AuthoredCandidate,
): Promise<StagedCandidatePreview> {
  await bundles.stageCandidate(candidate.record)
  const repository = entriesFor(candidate.record.id)
  for (const entry of candidate.entries) {
    await repository.create({ ...entry, status: 'published', authorId: null, now: candidate.record.createdAt })
    const stored = await repository.readById(entry.id)
    if (!stored || JSON.stringify(stored.data) !== JSON.stringify(entry.data)) throw new Error(`Entry read-back failed: ${entry.id}`)
  }
  return {
    source: 'preset',
    bundleId: candidate.record.id,
    ...candidate.preview,
  }
}

function validateCustomization(customization: AgentCustomization) {
  if (!customization.id || !customization.name || !customization.stages.length || customization.stages.length > 100) {
    throw new Error('Invalid customization identity')
  }
  const stages = new Map(customization.stages.map((stage) => [stage.id, stage]))
  if (stages.size !== customization.stages.length) throw new Error('Duplicate stage ID')
  if (!stages.has(customization.initialStageId)) throw new Error('Initial stage does not exist')
  const edges = new Map<string, string[]>()
  for (const stage of customization.stages) {
    if (!stage.terminal && !stage.agentFallback && !stage.actions.length) throw new Error(`Stage has no route: ${stage.id}`)
    const targets: string[] = []
    for (const action of stage.actions) {
      const parsed = parsePreparedAction(action)
      for (const effect of parsed.effects) if (effect.type === 'changeStage') targets.push(effect.stageId)
    }
    for (const target of targets) if (!stages.has(target)) throw new Error(`Unknown stage target: ${target}`)
    edges.set(stage.id, targets)
  }
  for (const rule of customization.rules ?? []) parsePlaybookRule(rule)
  const reachable = new Set<string>()
  const pending = [customization.initialStageId]
  while (pending.length) {
    const id = pending.pop()!
    if (reachable.has(id)) continue
    reachable.add(id)
    pending.push(...(edges.get(id) ?? []))
  }
  if (reachable.size !== stages.size) throw new Error('Customization contains unreachable stages')
  if (customization.completionMode === 'finite') {
    const escapable = new Set([...reachable].filter((id) => stages.get(id)?.terminal || stages.get(id)?.agentFallback))
    let changed = true
    while (changed) {
      changed = false
      for (const id of reachable) {
        if (!escapable.has(id) && (edges.get(id) ?? []).some((target) => escapable.has(target))) {
          escapable.add(id)
          changed = true
        }
      }
    }
    if (!escapable.size) throw new Error('Finite customization has no reachable terminal stage')
    if ([...reachable].some((id) => !escapable.has(id))) throw new Error('Finite customization contains a closed component')
  }
}
