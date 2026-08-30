import assert from 'node:assert/strict'

import { loadCompanionStartup } from '../src/core/application/companion.ts'

const noBundle = { async getActive() { return null } }
const entriesFor = () => ({}) as never

const withoutWebmcp = await loadCompanionStartup({ isAvailable: () => false }, noBundle as never, entriesFor)
assert.deepEqual(withoutWebmcp, { status: 'start', webmcpAvailable: false })

const start = await loadCompanionStartup({ isAvailable: () => true }, noBundle as never, entriesFor)
assert.deepEqual(start, { status: 'start', webmcpAvailable: true })
