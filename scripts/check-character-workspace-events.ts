import assert from 'node:assert/strict'

import { createCharacterWorkspaceEvents } from '../src/adapters/browser/character-workspace-events.ts'

const name = `aozu-character-workspace-test-${crypto.randomUUID()}`
const sender = createCharacterWorkspaceEvents(new BroadcastChannel(name))
const receiver = createCharacterWorkspaceEvents(new BroadcastChannel(name))
const received = new Promise((resolve) => receiver.subscribe(resolve))
sender.publish({ characterId: 'character-1', revision: 2 })
assert.deepEqual(await received, { characterId: 'character-1', revision: 2 })
sender.close()
receiver.close()

console.log('character workspace events: ok')
