import type { EntryReader } from '@aotter/mantle-runtime'

import type { SceneAsset, SceneAssetInspection, SceneComposition, ResolvedSceneLayer } from '../domain/scene.ts'
import { resolveSceneComposition } from '../domain/scene.ts'
import type { AssetRepositoryFactory } from './ports.ts'

export async function loadSceneProjection(
  entries: EntryReader,
  assetsFor: AssetRepositoryFactory,
  bundleId: string,
  compositionId: string,
  inspect: (blob: Blob) => Promise<SceneAssetInspection>,
): Promise<Array<ResolvedSceneLayer & { blob: Blob }>> {
  const compositionEntry = await entries.readById(compositionId)
  if (!compositionEntry || compositionEntry.collection !== 'scene-compositions') throw new Error(`Scene composition not found: ${compositionId}`)
  const composition = { id: compositionEntry.id, ...compositionEntry.data } as unknown as SceneComposition
  const repository = assetsFor(bundleId)
  const assets = new Map<string, SceneAsset>()
  const blobs = new Map<string, Blob>()
  const inspections = new Map<string, SceneAssetInspection>()

  for (const layer of composition.layers ?? []) {
    if (assets.has(layer.assetId)) continue
    const entry = await entries.readById(layer.assetId)
    if (!entry || entry.collection !== 'scene-assets') throw new Error(`Scene asset not found: ${layer.assetId}`)
    const asset = { id: entry.id, ...entry.data } as unknown as SceneAsset
    const blob = await repository.get(asset.blobId)
    if (!blob) throw new Error(`Scene asset blob is missing: ${asset.blobId}`)
    assets.set(asset.id, asset)
    blobs.set(asset.blobId, blob)
    inspections.set(asset.blobId, await inspect(blob))
  }

  return resolveSceneComposition(composition, assets, inspections)
    .map((layer) => ({ ...layer, blob: blobs.get(layer.blobId)! }))
}
