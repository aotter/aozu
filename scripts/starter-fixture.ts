import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { parseStarterPackage, validateLoadedStarterPackage } from '../src/core/domain/starter.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')
const starterRoot = path.join(projectRoot, 'public/starters/focus-studio')

const sha256 = async (blob: Blob) => Array.from(
  new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())),
  (byte) => byte.toString(16).padStart(2, '0'),
).join('')

export const inspectCharacterFixture = async (blob: Blob) => ({
  width: 512,
  height: 768,
  hasTransparentPixels: true,
  hasVisiblePixels: true,
  genuineRgba: true,
  size: blob.size,
  sha256: await sha256(blob),
})

export const inspectSceneFixture = async (blob: Blob) => ({
  mediaType: blob.type,
  width: 512,
  height: 768,
  size: blob.size,
  sha256: await sha256(blob),
})

export async function loadFocusStudioFixture() {
  const starter = parseStarterPackage(JSON.parse(await readFile(path.join(starterRoot, 'starter.json'), 'utf8')))
  const assets = await Promise.all(starter.assetFiles.map(async (file) => ({
    id: file.blobId,
    blob: new Blob([await readFile(path.join(starterRoot, file.path))], { type: file.mediaType }),
  })))
  return validateLoadedStarterPackage({ starter, assets }, inspectCharacterFixture, inspectSceneFixture, '4')
}

export const publicFile = (pathname: string) => path.join(projectRoot, 'public', pathname.replace(/^\//, ''))
