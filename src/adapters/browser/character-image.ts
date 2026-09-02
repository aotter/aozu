import type { CharacterAlphaMask, CharacterVisualSample } from '../../core/application/character-alignment.ts'
import { CHARACTER_RIG, type CharacterAssetInspection, type ResolvedCharacterLayer } from '../../core/domain/character.ts'

const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

export function characterPixelStats(pixels: Uint8ClampedArray, width: number, height: number) {
  let transparent = false
  let visiblePixelCount = 0
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] < 255) transparent = true
    if (pixels[index] > 0) {
      visiblePixelCount++
      const pixel = (index - 3) / 4
      const x = pixel % width
      const y = Math.floor(pixel / width)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return {
    transparent,
    visiblePixelCount,
    ...(visiblePixelCount ? { visibleBounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } } : {}),
  }
}

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
  const stats = characterPixelStats(pixels, canvas.width, canvas.height)
  return {
    width: canvas.width,
    height: canvas.height,
    hasTransparentPixels: stats.transparent,
    hasVisiblePixels: stats.visiblePixelCount > 0,
    genuineRgba: png && bytes[25] === 6,
    ...(stats.visibleBounds ? { visibleBounds: stats.visibleBounds } : {}),
    visiblePixelCount: stats.visiblePixelCount,
    size: blob.size,
    sha256: hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))),
  }
}

export async function readCharacterAlphaMask(blob: Blob): Promise<CharacterAlphaMask> {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas is unavailable')
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  const alpha = new Uint8Array(canvas.width * canvas.height)
  for (let source = 3, target = 0; source < pixels.length; source += 4, target++) alpha[target] = pixels[source]!
  return { width: canvas.width, height: canvas.height, alpha }
}

export async function readCharacterVisualSample(blob: Blob): Promise<CharacterVisualSample> {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = CHARACTER_RIG.canvas.width / 8
  canvas.height = CHARACTER_RIG.canvas.height / 8
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas is unavailable')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return { width: canvas.width, height: canvas.height, rgba: context.getImageData(0, 0, canvas.width, canvas.height).data }
}

export async function renderCharacterCompositeDataUrl(
  layers: ReadonlyArray<ResolvedCharacterLayer & { blob: Blob }>,
) {
  const canvas = document.createElement('canvas')
  canvas.width = CHARACTER_RIG.canvas.width
  canvas.height = CHARACTER_RIG.canvas.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')
  for (const { blob, transform } of layers) {
    const bitmap = await createImageBitmap(blob)
    context.save()
    context.setTransform(transform.scale, 0, 0, transform.scale, transform.x, transform.y)
    context.drawImage(bitmap, 0, 0)
    context.restore()
    bitmap.close()
  }
  return canvas.toDataURL('image/png')
}
