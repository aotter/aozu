import assert from 'node:assert/strict'

import { assertEntryMutationAllowed } from '../src/core/domain/history.ts'

assert.doesNotThrow(() => assertEntryMutationAllowed('stages'))
assert.throws(() => assertEntryMutationAllowed('journal-entries'), /append-only/)
assert.throws(() => assertEntryMutationAllowed('progress-events'), /append-only/)
assert.throws(() => assertEntryMutationAllowed('pending-agent-turns'), /append-only/)
console.log('history: ok')
