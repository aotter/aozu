import type { SceneAssetInspection } from '../../core/domain/scene.ts'

const supported = new Set(['image/png', 'image/jpeg', 'image/webp'])
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
const ascii = (bytes: Uint8Array, offset: number, value: string) => [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0))

export const matchesSceneImageSignature = (mediaType: string, bytes: Uint8Array) => mediaType === 'image/png'
  ? bytes.length > 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
  : mediaType === 'image/jpeg'
    ? bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : mediaType === 'image/webp' && bytes.length > 12 && ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP')

export async function inspectSceneImage(blob: Blob): Promise<SceneAssetInspection> {
  if (!supported.has(blob.type)) throw new Error('Scene asset must be PNG, JPEG, or WebP')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (!matchesSceneImageSignature(blob.type, bytes)) throw new Error('Scene asset media type does not match its bytes')
  const bitmap = await createImageBitmap(blob)
  const inspection = {
    mediaType: blob.type,
    width: bitmap.width,
    height: bitmap.height,
    size: blob.size,
    sha256: hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))),
  }
  bitmap.close()
  return inspection
}
