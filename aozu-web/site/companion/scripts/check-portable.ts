import assert from 'node:assert/strict'
import { strToU8, zipSync } from 'fflate'

import { preflightPortableZip } from '../src/adapters/zip/bundle.ts'

const required = { 'bundle.json': strToU8('{}'), 'integrity.json': strToU8('{}') }
assert.doesNotThrow(() => preflightPortableZip(zipSync(required)))
assert.throws(() => preflightPortableZip(zipSync({ ...required, '../escape': strToU8('no') })), /Unsafe ZIP entry/)
assert.throws(() => preflightPortableZip(zipSync({ ...required, 'surprise.txt': strToU8('no') })), /Unsafe ZIP entry/)
const multiDisk = zipSync(required)
new DataView(multiDisk.buffer, multiDisk.byteOffset).setUint16(multiDisk.byteLength - 18, 1, true)
assert.throws(() => preflightPortableZip(multiDisk), /Unsupported ZIP directory/)
console.log('portable: ok')
