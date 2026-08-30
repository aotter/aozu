import type { Entry } from '@aotter/mantle-spec'
import type { EntryReader } from '@aotter/mantle-runtime'

import type { StageProjection } from '../domain/companion.ts'
import type { ActionRepository } from './ports.ts'

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
  const status = runData.status
  if (status !== 'active' && status !== 'completed' && status !== 'blocked') throw new Error('Invalid run status')
  if (!Number.isSafeInteger(runData.revision) || (runData.revision as number) < 0) throw new Error('Invalid run revision')
  const actions = Array.isArray(stageData.actions)
    ? stageData.actions.map((value) => {
        const action = record(value, 'action')
        return { id: string(action.id, 'action id'), label: string(action.label, 'action label') }
      })
    : []
  const progress = Array.isArray(stageData.progress)
    ? stageData.progress.map((value) => {
        const item = record(value, 'progress')
        const progressValue = item.value
        if (typeof progressValue !== 'string' && typeof progressValue !== 'number') throw new Error('Invalid progress value')
        return {
          id: string(item.id, 'progress id'),
          label: string(item.label, 'progress label'),
          value: progressValue,
          ...(typeof item.max === 'number' ? { max: item.max } : {}),
        }
      })
    : []
  const scene = stageData.scene === undefined ? undefined : record(stageData.scene, 'scene')
  return {
    stageId: stage.id,
    revision: runData.revision as number,
    status,
    title: string(stageData.title, 'stage title'),
    narrative: string(stageData.narrative, 'stage narrative'),
    ...(scene
      ? {
          scene: {
            ...(typeof scene.backgroundAssetId === 'string' ? { backgroundAssetId: scene.backgroundAssetId } : {}),
            ...(typeof scene.characterStateId === 'string' ? { characterStateId: scene.characterStateId } : {}),
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
    now?: number
  },
): Promise<StageProjection> {
  const before = await loadStage(entries, input.runId)
  const action = before.actions.find(({ id }) => id === input.actionId)
  if (!action) throw new Error(`Action not available: ${input.actionId}`)
  const run = await entries.readById(input.runId)
  if (!run) throw new Error(`Run not found: ${input.runId}`)
  const now = input.now ?? Date.now()
  const commit = await actions.commit({
    ...input,
    nextRunData: { ...run.data, revision: input.expectedRevision + 1 },
    eventData: {
      runId: input.runId,
      actionId: input.actionId,
      idempotencyKey: input.idempotencyKey,
      summary: action.label,
      createdAtMs: now,
    },
    now,
  })
  const stage = await entries.readById(string(commit.run.data.currentStageId, 'current stage id'))
  if (!stage) throw new Error('Committed stage is missing')
  return projectStage(commit.run, stage)
}
