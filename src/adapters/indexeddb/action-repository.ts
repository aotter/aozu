import type { Entry } from '@aotter/mantle-spec'

import type { ActionRepository } from '../../core/application/ports.ts'
import { ENTRY_STORE, openCompanionDatabase, requestResult, transactionDone } from './database.ts'

type StoredEntry = Entry & { bundleId: string; authorId: string | null }

const publicEntry = (entry: StoredEntry): Entry => ({
  id: entry.id,
  collection: entry.collection,
  ...(typeof entry.data.locale === 'string' ? { locale: entry.data.locale } : {}),
  status: entry.status,
  version: entry.version,
  data: entry.data,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
})

const conflict = (expected: number, actual: number) =>
  Object.assign(new Error(`Run revision conflict: expected ${expected}, found ${actual}`), {
    name: 'RunRevisionConflict',
    expected,
    actual,
  })

export function createIndexedDbActionRepository(): ActionRepository {
  return {
    async commit(input) {
      const database = await openCompanionDatabase()
      try {
        const transaction = database.transaction(ENTRY_STORE, 'readwrite')
        const store = transaction.objectStore(ENTRY_STORE)
        const runKey = [input.bundleId, input.runId]
        const eventId = `event:${input.runId}:${input.idempotencyKey}`
        const eventKey = [input.bundleId, eventId]
        const existingEvent = (await requestResult(store.get(eventKey))) as StoredEntry | undefined
        const current = (await requestResult(store.get(runKey))) as StoredEntry | undefined
        if (!current || current.collection !== 'runs') throw new Error(`Run not found: ${input.runId}`)
        if (existingEvent) return { run: publicEntry(current), event: publicEntry(existingEvent), replayed: true }
        const actualRevision = current.data.revision
        if (!Number.isSafeInteger(actualRevision) || actualRevision !== input.expectedRevision) {
          throw conflict(input.expectedRevision, Number(actualRevision))
        }
        const run: StoredEntry = {
          ...current,
          data: structuredClone(input.nextRunData),
          version: current.version + 1,
          updatedAt: input.now,
        }
        const event: StoredEntry = {
          bundleId: input.bundleId,
          id: eventId,
          collection: 'progress-events',
          status: 'published',
          version: 1,
          data: structuredClone(input.eventData),
          authorId: null,
          createdAt: input.now,
          updatedAt: input.now,
        }
        store.put(run)
        store.add(event)
        await transactionDone(transaction)
        return { run: publicEntry(run), event: publicEntry(event), replayed: false }
      } finally {
        database.close()
      }
    },
  }
}
