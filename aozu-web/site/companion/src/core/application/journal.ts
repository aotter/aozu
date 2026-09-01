import type { Entry } from '@aotter/mantle-spec'
import type { EntryReader, EntryRepository } from '@aotter/mantle-runtime'

const COLLECTION = 'journal-entries'
const MAX_CONTENT_LENGTH = 100_000

export interface JournalEntry {
  id: string
  companionId: string
  content: string
  createdAt: number
  updatedAt: number
}

const project = (entry: Entry, companionId: string): JournalEntry => ({
  id: entry.id,
  companionId,
  content: String(entry.data.content),
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
})

const requireCompanionId = (value: string) => {
  const id = value.trim()
  if (!id || id.length > 200) throw new Error('Invalid companion ID')
  return id
}

export async function appendJournalEntry(
  entries: EntryRepository,
  input: { companionId: string; content: string; id?: string; now?: number },
): Promise<JournalEntry> {
  const companionId = requireCompanionId(input.companionId)
  if (!input.content.trim() || input.content.length > MAX_CONTENT_LENGTH) throw new Error('Invalid journal content')
  const id = input.id ?? `journal:${crypto.randomUUID()}`
  if (!id.trim() || id.length > 200) throw new Error('Invalid journal entry ID')
  const now = input.now ?? Date.now()
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid journal timestamp')
  return project(await entries.create({
    id,
    collection: COLLECTION,
    status: 'published',
    data: { content: input.content },
    authorId: null,
    now,
  }), companionId)
}

export async function listJournalEntries(
  entries: EntryReader,
  companionId: string,
  limit = 50,
): Promise<JournalEntry[]> {
  const id = requireCompanionId(companionId)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid journal limit')
  // ponytail: local journals are small; add an indexed time query only when measured volume needs it.
  return (await entries.readPublished({ collection: COLLECTION }))
    .toSorted((left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id))
    .slice(0, limit)
    .map((entry) => project(entry, id))
}
