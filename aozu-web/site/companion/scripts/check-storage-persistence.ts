import assert from 'node:assert/strict'

import { requestPersistentStorage } from '../src/adapters/browser/storage-persistence.ts'

let requests = 0
assert.equal(await requestPersistentStorage({
  persisted: async () => true,
  persist: async () => { requests++; return true },
}), true)
assert.equal(requests, 0)
assert.equal(await requestPersistentStorage({
  persisted: async () => false,
  persist: async () => { requests++; return true },
}), true)
assert.equal(requests, 1)
assert.equal(await requestPersistentStorage({
  persisted: async () => { throw new Error('blocked') },
  persist: async () => true,
}), false)

console.log('storage persistence: ok')
