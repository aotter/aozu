import type { PendingTurnRepository } from '../../core/application/ports.ts'
import { ENTRY_STORE, openCompanionDatabase, type StoredEntry, toPublicEntry } from './database.ts'

export function createIndexedDbPendingTurnRepository(): PendingTurnRepository {
  return {
    async create(input) {
      const database = await openCompanionDatabase()
      const transaction = database.transaction(ENTRY_STORE, 'readwrite')
      const store = transaction.store
      const id = `turn:${input.runId}:${input.idempotencyKey}`
      const existing = await store.get([input.bundleId, id])
      if (existing) return toPublicEntry(existing)
      const run = await store.get([input.bundleId, input.runId])
      if (!run || run.collection !== 'runs') throw new Error(`Run not found: ${input.runId}`)
      if (run.data.revision !== input.expectedRevision) throw new Error('Run revision conflict')
      const turn: StoredEntry = {
        bundleId: input.bundleId,
        id,
        collection: 'pending-agent-turns',
        status: 'published',
        version: 1,
        data: {
          runId: input.runId,
          nodeId: input.nodeId,
          userText: input.userText,
          expectedRevision: input.expectedRevision,
          status: 'pending',
          createdAtMs: input.now,
        },
        authorId: null,
        createdAt: input.now,
        updatedAt: input.now,
      }
      await store.add(turn)
      await transaction.done
      return toPublicEntry(turn)
    },
  }
}
