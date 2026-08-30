import type { CharacterAssetInspection } from '../../core/domain/character.ts'

const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

export async function inspectCharacterImage(blob: Blob): Promise<CharacterAssetInspection> {
  if (blob.type !== 'image/png') throw new Error('Character asset must be PNG')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const png = bytes.length > 25 && bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index])
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas is unavailable')
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  let transparent = false
  let visible = false
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] < 255) transparent = true
    if (pixels[index] > 0) visible = true
    if (transparent && visible) break
  }
  return {
    width: canvas.width,
    height: canvas.height,
    hasTransparentPixels: transparent,
    hasVisiblePixels: visible,
    genuineRgba: png && bytes[25] === 6,
    size: blob.size,
    sha256: hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))),
  }
}
