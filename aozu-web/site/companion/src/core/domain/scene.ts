export const SCENE_CANVAS = { width: 512, height: 768 } as const

export type ScenePlane = 'back' | 'front'

export interface SceneAsset {
  id: string
  blobId: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
  width: number
  height: number
  size: number
  sha256: string
}

export interface SceneComposition {
  id: string
  layers: Array<{ id: string; assetId: string; plane: ScenePlane; order: number }>
}

export interface SceneAssetInspection {
  mediaType: string
  width: number
  height: number
  size: number
  sha256: string
}

export interface ResolvedSceneLayer {
  id: string
  blobId: string
  plane: ScenePlane
  order: number
}

const idPattern = /^[a-z0-9][a-z0-9:_-]{0,99}$/
const mediaTypes = new Set<SceneAsset['mediaType']>(['image/png', 'image/jpeg', 'image/webp'])

export function validateSceneAsset(asset: SceneAsset, inspection: SceneAssetInspection) {
  if (
    !idPattern.test(asset.id) || !asset.blobId || !mediaTypes.has(asset.mediaType) ||
    inspection.mediaType !== asset.mediaType ||
    asset.width !== SCENE_CANVAS.width || asset.height !== SCENE_CANVAS.height ||
    !Number.isSafeInteger(asset.size) || asset.size < 1 || !/^[0-9a-f]{64}$/.test(asset.sha256) ||
    inspection.width !== asset.width || inspection.height !== asset.height ||
    inspection.size !== asset.size || inspection.sha256 !== asset.sha256
  ) throw new Error(`Invalid scene asset: ${asset.id}`)
}

export function resolveSceneComposition(
  composition: SceneComposition,
  assets: ReadonlyMap<string, SceneAsset>,
  inspections: ReadonlyMap<string, SceneAssetInspection>,
): ResolvedSceneLayer[] {
  if (
    !idPattern.test(composition.id) ||
    !Array.isArray(composition.layers) || !composition.layers.length || composition.layers.length > 32
  ) throw new Error(`Invalid scene composition: ${composition.id}`)

  const layerIds = new Set<string>()
  const orders = new Set<string>()
  const resolved = composition.layers.map((layer) => {
    const asset = assets.get(layer.assetId)
    const inspection = asset && inspections.get(asset.blobId)
    const orderKey = `${layer.plane}:${layer.order}`
    if (
      !idPattern.test(layer.id) || layerIds.has(layer.id) ||
      (layer.plane !== 'back' && layer.plane !== 'front') ||
      !Number.isSafeInteger(layer.order) || orders.has(orderKey) ||
      !asset || !inspection
    ) throw new Error(`Invalid scene layer: ${composition.id}/${layer.id}`)
    validateSceneAsset(asset, inspection)
    layerIds.add(layer.id)
    orders.add(orderKey)
    return { id: layer.id, blobId: asset.blobId, plane: layer.plane, order: layer.order }
  })

  return resolved.sort((left, right) => (left.plane === right.plane ? left.order - right.order || left.id.localeCompare(right.id) : left.plane === 'back' ? -1 : 1))
}
