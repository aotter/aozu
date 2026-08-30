import type { EntryReader } from '@aotter/mantle-runtime'

import type { StageProjection } from '../domain/companion.ts'
import type { ActionRepository, PendingTurnRepository } from './ports.ts'
import { executePlaybook, parseEffects, parsePlaybookRule } from './playbook.ts'
import { loadStage, projectStage } from './stage.ts'

export async function queueAgentTurn(
  entries: EntryReader,
  turns: PendingTurnRepository,
  input: {
    bundleId: string
    runId: string
    userText: string
    expectedRevision: number
    idempotencyKey: string
    now?: number
  },
) {
  if (!input.userText.trim()) throw new Error('Agent turn text is empty')
  const stage = await loadStage(entries, input.runId)
  if (stage.revision !== input.expectedRevision) throw new Error('Run revision conflict')
  return turns.create({
    ...input,
    nodeId: stage.stageId,
    userText: input.userText.trim(),
    now: input.now ?? Date.now(),
  })
}

export async function resolveAgentTurn(
  entries: EntryReader,
  actions: ActionRepository,
  input: {
    bundleId: string
    turnId: string
    idempotencyKey: string
    dialogue: string
    effects: unknown
    now?: number
  },
): Promise<StageProjection> {
  if (!input.dialogue.trim()) throw new Error('Agent dialogue is empty')
  const turn = await entries.readById(input.turnId)
  if (!turn || turn.collection !== 'pending-agent-turns') throw new Error(`Pending turn not found: ${input.turnId}`)
  const runId = String(turn.data.runId ?? '')
  const expectedRevision = Number(turn.data.expectedRevision)
  const run = await entries.readById(runId)
  if (!run || run.collection !== 'runs') throw new Error(`Run not found: ${runId}`)
  const rules = (await entries.readPublished({ collection: 'rules' })).map((entry) => parsePlaybookRule(entry.data))
  const next = executePlaybook(run.data, parseEffects(input.effects), rules)
  const now = input.now ?? Date.now()
  const commit = await actions.commit({
    bundleId: input.bundleId,
    runId,
    expectedRevision,
    actionId: 'agent-resolution',
    idempotencyKey: input.idempotencyKey,
    nextRunData: { ...next, currentDialogue: input.dialogue, revision: expectedRevision + 1 },
    eventData: {
      runId,
      actionId: 'agent-resolution',
      idempotencyKey: input.idempotencyKey,
      summary: input.dialogue,
      createdAtMs: now,
    },
    now,
    resolveTurnId: turn.id,
    resolutionDialogue: input.dialogue,
  })
  const stage = await entries.readById(String(commit.run.data.currentStageId ?? ''))
  if (!stage) throw new Error('Committed stage is missing')
  return projectStage(commit.run, stage)
}
