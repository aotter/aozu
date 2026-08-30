import assert from 'node:assert/strict'

import { loadCompanionStartup } from '../src/core/application/companion.ts'

let hydrated = false
const repository = {
  async hydrateActive() {
    hydrated = true
    return null
  },
}

const withoutWebmcp = await loadCompanionStartup({ isAvailable: () => false }, repository)
assert.deepEqual(withoutWebmcp, { status: 'start', webmcpAvailable: false })
assert.equal(hydrated, true)

const start = await loadCompanionStartup({ isAvailable: () => true }, repository)
assert.deepEqual(start, { status: 'start', webmcpAvailable: true })

const main = await loadCompanionStartup(
  { isAvailable: () => true },
  { hydrateActive: async () => ({ id: 'momo', name: 'Momo' }) },
)
assert.deepEqual(main, {
  status: 'main',
  companion: { id: 'momo', name: 'Momo' },
  webmcpAvailable: true,
})
