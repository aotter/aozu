import assert from 'node:assert/strict'

import { ADVENTURE_SCORE_KEY, parseAdventureScores, recordAdventureScore } from '../adventure.ts'

assert.deepEqual(parseAdventureScores(null), { room: 0, forest: 0 })
assert.deepEqual(parseAdventureScores('{"room":18,"forest":9}'), { room: 18, forest: 9 })
assert.deepEqual(parseAdventureScores('broken'), { room: 0, forest: 0 })

let value: string | null = '{"room":20,"forest":5}'
const storage = {
  getItem(key: string) { return key === ADVENTURE_SCORE_KEY ? value : null },
  setItem(key: string, next: string) { if (key === ADVENTURE_SCORE_KEY) value = next },
}
assert.deepEqual(recordAdventureScore(storage, 'room', 10), { room: 20, forest: 5 })
assert.deepEqual(recordAdventureScore(storage, 'forest', 42.8), { room: 20, forest: 42 })
console.log('adventure: ok')
