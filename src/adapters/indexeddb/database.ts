const DATABASE_NAME = 'companion'
const DATABASE_VERSION = 4

export const META_STORE = 'meta'
export const ENTRY_STORE = 'entries'
export const BUNDLE_STORE = 'bundles'
export const ASSET_STORE = 'assets'

export const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

export const transactionDone = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = transaction.onerror = () => reject(transaction.error)
  })

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
      if (!request.result.objectStoreNames.contains(BUNDLE_STORE)) {
        request.result.createObjectStore(BUNDLE_STORE, { keyPath: 'id' })
      }
      if (!request.result.objectStoreNames.contains(ASSET_STORE)) {
        const store = request.result.createObjectStore(ASSET_STORE, { keyPath: ['bundleId', 'id'] })
        store.createIndex('bundleId', 'bundleId')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
