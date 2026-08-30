import type { Entry } from '@aotter/mantle-spec'

import type { PendingTurnRepository } from '../../core/application/ports.ts'
import { ENTRY_STORE, openCompanionDatabase, requestResult, transactionDone } from './database.ts'

type StoredEntry = Entry & { bundleId: string; authorId: string | null }

const publicEntry = (entry: StoredEntry): Entry => ({
  id: entry.id,
  collection: entry.collection,
  status: entry.status,
  version: entry.version,
  data: entry.data,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
})

export function createIndexedDbPendingTurnRepository(): PendingTurnRepository {
  return {
    async create(input) {
      const database = await openCompanionDatabase()
      try {
        const transaction = database.transaction(ENTRY_STORE, 'readwrite')
        const store = transaction.objectStore(ENTRY_STORE)
        const id = `turn:${input.runId}:${input.idempotencyKey}`
        const existing = (await requestResult(store.get([input.bundleId, id]))) as StoredEntry | undefined
        if (existing) return publicEntry(existing)
        const run = (await requestResult(store.get([input.bundleId, input.runId]))) as StoredEntry | undefined
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
        store.add(turn)
        await transactionDone(transaction)
        return publicEntry(turn)
      } finally {
        database.close()
      }
    },
  }
}
