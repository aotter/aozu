import type { Entry } from '@aotter/mantle-spec'
import type { EntryReader } from '@aotter/mantle-runtime'

import type { StageProjection } from '../domain/companion.ts'
import { parseProgressBinding } from '../domain/playbook.ts'
import type { ActionRepository } from './ports.ts'
import { executePlaybookPlan, isItemEffect, parsePlaybookRule, resolvePreparedAction } from './playbook.ts'
import { planItemEffects } from './items.ts'

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`)
  return value as Record<string, unknown>
}

const string = (value: unknown, label: string) => {
  if (typeof value !== 'string') throw new Error(`Invalid ${label}`)
  return value
}

export function projectStage(run: Entry, stage: Entry): StageProjection {
  const runData = record(run.data, 'run')
  const stageData = record(stage.data, 'stage')
  const storedStatus = runData.status
  if (storedStatus !== 'active' && storedStatus !== 'completed' && storedStatus !== 'blocked') throw new Error('Invalid run status')
  const status = stageData.terminal === true ? 'completed' : storedStatus
  if (!Number.isSafeInteger(runData.revision) || (runData.revision as number) < 0) throw new Error('Invalid run revision')
  const actions = Array.isArray(stageData.actions)
    ? stageData.actions.map((value) => {
        const action = record(value, 'action')
        return { id: string(action.id, 'action id'), label: string(action.label, 'action label') }
      })
    : []
  const progress = Array.isArray(stageData.progress)
    ? stageData.progress.map((value) => {
        const raw = record(value, 'progress')
        if (!('source' in raw)) {
          const legacyValue = raw.value
          if (typeof legacyValue !== 'string' && typeof legacyValue !== 'number') throw new Error('Invalid legacy progress value')
          return {
            id: string(raw.id, 'progress id'),
            label: string(raw.label, 'progress label'),
            value: legacyValue,
            ...(typeof raw.max === 'number' ? { max: raw.max } : {}),
          }
        }
        const item = parseProgressBinding(raw)
        const progressValue = record(runData.metrics ?? {}, 'metrics')[item.source.id]
        if (typeof progressValue !== 'number' || !Number.isFinite(progressValue)) throw new Error(`Invalid progress metric: ${item.source.id}`)
        return {
          id: item.id,
          label: item.label,
          value: progressValue,
          ...(item.max === undefined ? {} : { max: item.max }),
        }
      })
    : []
  const scene = stageData.scene === undefined ? undefined : record(stageData.scene, 'scene')
  const compositionId = typeof scene?.compositionId === 'string' ? scene.compositionId : undefined
  const characterStateId = typeof scene?.characterStateId === 'string' ? scene.characterStateId : undefined
  if (scene && !compositionId && !characterStateId && typeof scene.backgroundAssetId !== 'string') throw new Error('Invalid scene reference')
  return {
    stageId: stage.id,
    revision: runData.revision as number,
    status,
    agentFallback: stageData.agentFallback === true,
    title: string(stageData.title, 'stage title'),
    narrative: string(stageData.narrative, 'stage narrative'),
    ...(compositionId || characterStateId
      ? {
          scene: {
            ...(compositionId ? { compositionId } : {}),
            ...(characterStateId ? { characterStateId } : {}),
          },
        }
      : {}),
    actions,
    progress,
  }
}

export async function loadStage(entries: EntryReader, runId: string): Promise<StageProjection> {
  const run = await entries.readById(runId)
  if (!run || run.collection !== 'runs') throw new Error(`Run not found: ${runId}`)
  const stageId = string(run.data.currentStageId, 'current stage id')
  const stage = await entries.readById(stageId)
  if (!stage || stage.collection !== 'stages') throw new Error(`Stage not found: ${stageId}`)
  return projectStage(run, stage)
}

export async function submitAction(
  entries: EntryReader,
  actions: ActionRepository,
  input: {
    bundleId: string
    runId: string
    actionId: string
    expectedRevision: number
    idempotencyKey: string
    contractVersion?: 1 | 2
    now?: number
  },
): Promise<StageProjection> {
  const before = await loadStage(entries, input.runId)
  if (before.status !== 'active') throw new Error(`Run is not active: ${before.status}`)
  const run = await entries.readById(input.runId)
  if (!run) throw new Error(`Run not found: ${input.runId}`)
  const stage = await entries.readById(before.stageId)
  if (!stage) throw new Error(`Stage not found: ${before.stageId}`)
  const resolved = resolvePreparedAction(Array.isArray(stage.data.actions) ? stage.data.actions : [], { actionId: input.actionId })
  if (resolved.path === 'cold') throw new Error(`Action not available: ${input.actionId}`)
  const rules = (await entries.readPublished({ collection: 'rules' })).map((entry) => parsePlaybookRule(entry.data))
  const currentItems = await planItemEffects(entries, input.runId, [])
  const actionItemEffects = resolved.action.effects.filter(isItemEffect)
  const postActionItems = actionItemEffects.length ? await planItemEffects(entries, input.runId, actionItemEffects) : currentItems
  const execution = executePlaybookPlan(run.data, resolved.action.effects, rules, postActionItems.projection, input.contractVersion === 2)
  const itemPlan = execution.itemEffects.length ? await planItemEffects(entries, input.runId, execution.itemEffects) : null
  const nextStage = await entries.readById(string(execution.runData.currentStageId, 'current stage id'))
  if (!nextStage || nextStage.collection !== 'stages') throw new Error('Next stage is missing')
  const now = input.now ?? Date.now()
  const commit = await actions.commit({
    ...input,
    nextRunData: {
      ...execution.runData,
      ...(nextStage.data.terminal === true ? { status: 'completed' } : {}),
      revision: input.expectedRevision + 1,
    },
    eventData: {
      runId: input.runId,
      actionId: input.actionId,
      idempotencyKey: input.idempotencyKey,
      summary: resolved.action.label,
      createdAtMs: now,
    },
    now,
    ...(itemPlan ? { itemMutations: itemPlan.itemMutations } : {}),
  })
  return projectStage(commit.run, nextStage)
}

export async function submitInteraction(
  entries: EntryReader,
  actions: ActionRepository,
  input: {
    bundleId: string
    runId: string
    expectedRevision: number
    idempotencyKey: string
    contractVersion?: 1 | 2
    actionId?: string
    text?: string
    now?: number
  },
) {
  const current = await loadStage(entries, input.runId)
  const stage = await entries.readById(current.stageId)
  if (!stage) throw new Error(`Stage not found: ${current.stageId}`)
  const resolved = resolvePreparedAction(Array.isArray(stage.data.actions) ? stage.data.actions : [], input)
  if (resolved.path === 'cold') return resolved
  const projection = await submitAction(entries, actions, { ...input, actionId: resolved.action.id })
  return { path: resolved.path, projection } as const
}
