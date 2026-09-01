import assert from 'node:assert/strict'
import type { Entry } from '@aotter/mantle-spec'

import { appendJournalEntry, listJournalEntries } from '../src/core/application/journal.ts'

const stored: Entry[] = []
const entries = {
  async create(input: { id: string; collection: string; status: Entry['status']; data: Record<string, unknown>; now: number }) {
    if (stored.some(({ id }) => id === input.id)) throw new Error('duplicate')
    const entry: Entry = { ...input, version: 1, createdAt: input.now, updatedAt: input.now }
    stored.push(entry)
    return entry
  },
  async readPublished({ collection }: { collection?: string }) {
    return stored.filter((entry) => entry.status === 'published' && (!collection || entry.collection === collection))
  },
}

const markdown = '# First day\n\nMet beside the river.\n'
assert.deepEqual(await appendJournalEntry(entries as never, {
  companionId: 'companion:otter',
  id: 'journal:first',
  content: markdown,
  now: 1,
}), {
  id: 'journal:first',
  companionId: 'companion:otter',
  content: markdown,
  createdAt: 1,
  updatedAt: 1,
})
await appendJournalEntry(entries as never, { companionId: 'companion:otter', id: 'journal:second', content: '## Later', now: 2 })
assert.deepEqual((await listJournalEntries(entries as never, 'companion:otter', 1)).map(({ id }) => id), ['journal:second'])
assert.equal((await listJournalEntries(entries as never, 'companion:otter'))[1]?.content, markdown)
await assert.rejects(() => appendJournalEntry(entries as never, { companionId: 'companion:otter', content: '  ' }), /content/)
await assert.rejects(() => appendJournalEntry(entries as never, { companionId: 'companion:otter', id: 'journal:first', content: 'duplicate' }), /duplicate/)

console.log('journal: ok')
