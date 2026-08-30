import type { ActionRepository } from '../../core/application/ports.ts'
import { ENTRY_STORE, openCompanionDatabase, type StoredEntry, toPublicEntry } from './database.ts'

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
      const transaction = database.transaction(ENTRY_STORE, 'readwrite')
      const store = transaction.store
      const runKey: [string, string] = [input.bundleId, input.runId]
      const eventId = `event:${input.runId}:${input.idempotencyKey}`
      const eventKey: [string, string] = [input.bundleId, eventId]
      const existingEvent = await store.get(eventKey)
      const current = await store.get(runKey)
      if (!current || current.collection !== 'runs') throw new Error(`Run not found: ${input.runId}`)
      if (existingEvent) return { run: toPublicEntry(current), event: toPublicEntry(existingEvent), replayed: true }
      const turn = input.resolveTurnId ? await store.get([input.bundleId, input.resolveTurnId]) : undefined
      if (input.resolveTurnId && (!turn || turn.collection !== 'pending-agent-turns')) {
        throw new Error(`Pending turn not found: ${input.resolveTurnId}`)
      }
      if (turn && (turn.data.runId !== input.runId || turn.data.expectedRevision !== input.expectedRevision)) {
        throw new Error(`Pending turn does not match run revision: ${turn.id}`)
      }
      if (turn?.data.status === 'resolved') throw new Error(`Resolved turn is missing its event: ${turn.id}`)
      if (turn && turn.data.status !== 'pending') throw new Error(`Pending turn is not resolvable: ${turn.id}`)
      const itemChanges: Array<{ mutation: NonNullable<typeof input.itemMutations>[number]; current?: StoredEntry }> = []
      for (const mutation of input.itemMutations ?? []) {
        const currentItem = await store.get([input.bundleId, mutation.id])
        const actual = currentItem?.version ?? null
        if (actual !== mutation.expectedVersion || (currentItem && currentItem.collection !== mutation.collection)) {
          throw Object.assign(new Error(`Item version conflict: ${mutation.id}`), { name: 'ItemVersionConflict' })
        }
        itemChanges.push({ mutation, current: currentItem })
      }
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
      await store.put(run)
      await store.add(event)
      if (turn) {
        await store.put({
          ...turn,
          version: turn.version + 1,
          updatedAt: input.now,
          data: {
            ...turn.data,
            status: 'resolved',
            resolutionDialogue: input.resolutionDialogue ?? '',
            resolutionEventId: eventId,
          },
        })
      }
      for (const { mutation, current: currentItem } of itemChanges) {
        const key: [string, string] = [input.bundleId, mutation.id]
        if (mutation.data === null) {
          await store.delete(key)
        } else {
          await store.put({
            bundleId: input.bundleId,
            id: mutation.id,
            collection: mutation.collection,
            status: 'published',
            version: (currentItem?.version ?? 0) + 1,
            data: structuredClone(mutation.data),
            authorId: null,
            createdAt: currentItem?.createdAt ?? input.now,
            updatedAt: input.now,
          })
        }
      }
      await transaction.done
      return { run: toPublicEntry(run), event: toPublicEntry(event), replayed: false }
    },
  }
}
