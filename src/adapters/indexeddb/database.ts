const DATABASE_NAME = 'companion'
const DATABASE_VERSION = 2

export const META_STORE = 'meta'
export const ENTRY_STORE = 'entries'

export function openCompanionDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(META_STORE)) {
        request.result.createObjectStore(META_STORE)
      }
      if (!request.result.objectStoreNames.contains(ENTRY_STORE)) {
        const store = request.result.createObjectStore(ENTRY_STORE, { keyPath: ['bundleId', 'id'] })
        store.createIndex('bundleId', 'bundleId')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
