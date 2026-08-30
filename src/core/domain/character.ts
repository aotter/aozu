export const CHARACTER_RIG = {
  id: 'companion-fullbody',
  version: 1,
  canvas: { width: 512, height: 768 },
  slots: [
    { id: 'item-back', order: 10, alpha: 'required' },
    { id: 'character-skin', order: 30, alpha: 'required' },
    { id: 'item-front', order: 40, alpha: 'required' },
    { id: 'aura', order: 50, alpha: 'required' },
  ],
} as const

export interface AppearanceRef {
  packId: string
  packVersion: number
  appearanceId: string
}

export interface AssetRef {
  packId: string
  packVersion: number
  assetId: string
}

export interface CharacterPack {
  id: string
  version: number
  rigProfile: { id: string; version: number }
  creator: { name: string; url?: string; attribution?: string }
  license: { id: string; url: string; embedding: 'allowed' }
  assets: Array<{ id: string; blobId: string; mediaType: 'image/png'; size: number; sha256: string }>
  appearances: Array<{
    id: string
    layers: Array<{ asset: AssetRef; slot: string; order: number }>
  }>
  defaultComposition: AppearanceRef[]
}

export interface CharacterAssetInspection {
  width: number
  height: number
  hasTransparentPixels: boolean
  hasVisiblePixels: boolean
  genuineRgba: boolean
  size: number
  sha256: string
}

export interface ResolvedCharacterLayer {
  id: string
  blobId: string
  slot: string
  slotOrder: number
  layerOrder: number
}

const idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/
const https = (value: string) => new URL(value).protocol === 'https:'

export function validateCharacterPack(
  pack: CharacterPack,
  inspections: ReadonlyMap<string, CharacterAssetInspection>,
): ResolvedCharacterLayer[] {
  if (!idPattern.test(pack.id) || !Number.isSafeInteger(pack.version) || pack.version < 1) throw new Error('Invalid character pack identity')
  if (pack.rigProfile.id !== CHARACTER_RIG.id || pack.rigProfile.version !== CHARACTER_RIG.version) throw new Error('Unsupported character rig')
  if (!pack.creator.name || (pack.creator.url && !https(pack.creator.url))) throw new Error('Invalid character creator')
  if (!pack.license.id || !https(pack.license.url) || pack.license.embedding !== 'allowed') throw new Error('Character pack cannot be embedded')
  const assets = new Map(pack.assets.map((asset) => [asset.id, asset]))
  if (assets.size !== pack.assets.length || [...assets].some(([id]) => !idPattern.test(id))) throw new Error('Duplicate or invalid character asset ID')
  for (const asset of pack.assets) {
    const inspected = inspections.get(asset.blobId)
    if (
      asset.mediaType !== 'image/png' ||
      !asset.blobId ||
      !Number.isSafeInteger(asset.size) || asset.size < 1 ||
      !/^[0-9a-f]{64}$/.test(asset.sha256) ||
      !inspected ||
      inspected.width !== CHARACTER_RIG.canvas.width ||
      inspected.height !== CHARACTER_RIG.canvas.height ||
      !inspected.genuineRgba ||
      !inspected.hasTransparentPixels ||
      !inspected.hasVisiblePixels ||
      inspected.size !== asset.size ||
      inspected.sha256 !== asset.sha256
    ) throw new Error(`Invalid character asset: ${asset.id}`)
  }
  const appearances = new Map(pack.appearances.map((appearance) => [appearance.id, appearance]))
  if (
    appearances.size !== pack.appearances.length ||
    pack.appearances.some(({ id, layers }) => !idPattern.test(id) || !layers.length)
  ) throw new Error('Duplicate or invalid appearance ID')
  const slotOrders = new Map<string, number>(CHARACTER_RIG.slots.map((slot) => [slot.id, slot.order]))
  const layers: ResolvedCharacterLayer[] = []
  for (const reference of pack.defaultComposition) {
    if (reference.packId !== pack.id || reference.packVersion !== pack.version) throw new Error('Unqualified appearance reference')
    const appearance = appearances.get(reference.appearanceId)
    if (!appearance) throw new Error(`Appearance not found: ${reference.appearanceId}`)
    const localOrders = new Set<string>()
    for (const layer of appearance.layers) {
      if (layer.asset.packId !== pack.id || layer.asset.packVersion !== pack.version) throw new Error('Unqualified asset reference')
      const asset = assets.get(layer.asset.assetId)
      const slotOrder = slotOrders.get(layer.slot)
      const orderKey = `${layer.slot}:${layer.order}`
      if (!asset || slotOrder === undefined || !Number.isSafeInteger(layer.order) || localOrders.has(orderKey)) throw new Error(`Invalid appearance layer: ${appearance.id}`)
      localOrders.add(orderKey)
      layers.push({
        id: `${pack.id}@${pack.version}:${appearance.id}:${layer.asset.assetId}`,
        blobId: asset.blobId,
        slot: layer.slot,
        slotOrder,
        layerOrder: layer.order,
      })
    }
  }
  if (!layers.some(({ slot }) => slot === 'character-skin')) throw new Error('Character composition requires a skin')
  const finalOrders = new Set(layers.map(({ slot, layerOrder }) => `${slot}:${layerOrder}`))
  if (finalOrders.size !== layers.length) throw new Error('Composition layer order collision')
  return layers.sort((left, right) => left.slotOrder - right.slotOrder || left.layerOrder - right.layerOrder || left.id.localeCompare(right.id))
}
