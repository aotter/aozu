import { MaxRectsPacker, Rectangle } from 'maxrects-packer'

import { CHARACTER_RIG, type CharacterAtlasSource, type CharacterTextureAtlas } from '../../core/domain/character.ts'
import { characterPixelStats } from './character-image.ts'

const MAX_ATLAS_SIZE = 4096
const PADDING = 2

const pngBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => canvas.toBlob(
  (blob) => blob ? resolve(blob) : reject(new Error('Could not encode character atlas')),
  'image/png',
))

type FrameSource = {
  id: string
  width: number
  height: number
  bounds: { x: number; y: number; width: number; height: number }
}

export function packCharacterAtlasFrames(sources: readonly FrameSource[]) {
  if (!sources.length || new Set(sources.map(({ id }) => id)).size !== sources.length) throw new Error('Character atlas frame IDs must be unique and non-empty')
  if (sources.some(({ width, height }) => width > MAX_ATLAS_SIZE || height > MAX_ATLAS_SIZE)) throw new Error(`Character atlas exceeds ${MAX_ATLAS_SIZE}×${MAX_ATLAS_SIZE}`)
  const rectangles = [...sources].sort((left, right) => left.id.localeCompare(right.id)).map((source) => {
    const rectangle = Object.assign(new Rectangle(source.width, source.height), { hash: source.id })
    rectangle.data = source
    return rectangle
  })
  const packer = new MaxRectsPacker<Rectangle>(MAX_ATLAS_SIZE, MAX_ATLAS_SIZE, PADDING, {
    smart: true,
    pot: false,
    square: false,
    allowRotation: false,
    border: PADDING,
  })
  packer.addArray(rectangles)
  if (packer.bins.length !== 1) throw new Error(`Character atlas exceeds ${MAX_ATLAS_SIZE}×${MAX_ATLAS_SIZE}`)
  const bin = packer.bins[0]!
  const frames: CharacterTextureAtlas['data']['frames'] = {}
  for (const rectangle of bin.rects) {
    const { id, bounds } = rectangle.data as FrameSource
    frames[id] = {
      frame: { x: rectangle.x, y: rectangle.y, w: rectangle.width, h: rectangle.height },
      rotated: false,
      trimmed: true,
      spriteSourceSize: { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height },
      sourceSize: { w: CHARACTER_RIG.canvas.width, h: CHARACTER_RIG.canvas.height },
    }
  }
  return { width: Math.max(1, bin.width), height: Math.max(1, bin.height), frames }
}

export async function compileCharacterTextureAtlas(sources: readonly CharacterAtlasSource[]): Promise<CharacterTextureAtlas | undefined> {
  if (!sources.length) return undefined
  const crops = new Map<string, HTMLCanvasElement>()
  const frameSources = await Promise.all(sources.map(async ({ id, blob, transform }) => {
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = CHARACTER_RIG.canvas.width
    canvas.height = CHARACTER_RIG.canvas.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Canvas is unavailable')
    context.setTransform(transform.scale, 0, 0, transform.scale, transform.x, transform.y)
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    const stats = characterPixelStats(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
    if (!stats.visibleBounds) throw new Error(`Character atlas frame is empty: ${id}`)
    const crop = document.createElement('canvas')
    crop.width = stats.visibleBounds.width
    crop.height = stats.visibleBounds.height
    const cropContext = crop.getContext('2d')
    if (!cropContext) throw new Error('Canvas is unavailable')
    cropContext.drawImage(canvas, stats.visibleBounds.x, stats.visibleBounds.y, crop.width, crop.height, 0, 0, crop.width, crop.height)
    crops.set(id, crop)
    return { id, width: crop.width, height: crop.height, bounds: stats.visibleBounds }
  }))
  const packed = packCharacterAtlasFrames(frameSources)
  const atlas = document.createElement('canvas')
  atlas.width = packed.width
  atlas.height = packed.height
  const context = atlas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')
  for (const [id, { frame }] of Object.entries(packed.frames)) {
    context.drawImage(crops.get(id)!, frame.x, frame.y)
  }
  for (const [id, { frame }] of Object.entries(packed.frames)) {
    const canvas = crops.get(id)!
    const expected = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    const actual = context.getImageData(frame.x, frame.y, frame.w, frame.h).data
    if (expected.some((byte, index) => byte !== actual[index])) throw new Error(`Character atlas pixel check failed: ${id}`)
  }
  return {
    image: await pngBlob(atlas),
    data: {
      frames: packed.frames,
      meta: {
        app: 'Companion', version: '1', image: 'character.atlas.png', format: 'RGBA8888',
        size: { w: atlas.width, h: atlas.height }, scale: '1',
      },
    },
  }
}
