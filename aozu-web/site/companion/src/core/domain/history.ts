const retainedHistoryCollections = new Set(['journal-entries', 'progress-events', 'pending-agent-turns'])

export function assertEntryMutationAllowed(collection: string) {
  if (retainedHistoryCollections.has(collection)) {
    throw new Error(`History is append-only: ${collection}`)
  }
}
