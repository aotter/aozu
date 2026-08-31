type PersistenceManager = Pick<StorageManager, 'persist' | 'persisted'>

export async function requestPersistentStorage(storage?: PersistenceManager): Promise<boolean> {
  const manager = storage ?? (typeof navigator === 'undefined' ? undefined : navigator.storage)
  if (!manager) return false
  try {
    return await manager.persisted() || await manager.persist()
  } catch {
    return false
  }
}
