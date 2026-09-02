import { strToU8, zipSync } from 'fflate'

import { buildCharacterPack } from '../../core/application/character-creation.ts'
import type { CharacterDraft, CharacterVariantLayer } from '../../core/domain/character.ts'

const json = (value: unknown) => strToU8(JSON.stringify(value, null, 2))
const assetId = (group: string, variantId: string, layer: CharacterVariantLayer) => `${group}-${variantId}-${layer}`

export async function exportCharacterDraftZip(draft: CharacterDraft): Promise<Blob> {
  const files: Record<string, Uint8Array> = {}
  const variants = []
  for (const { layers, ...variant } of draft.variants) {
    const archivedLayers: Record<string, unknown> = {}
    for (const [layer, asset] of Object.entries(layers)) {
      const id = assetId(variant.group, variant.id, layer as CharacterVariantLayer)
      const path = `assets/${id}.png`
      files[path] = new Uint8Array(await asset!.blob.arrayBuffer())
      archivedLayers[layer] = {
        path,
        filename: asset!.filename,
        source: asset!.source,
        inspection: asset!.inspection,
        canonicalSha256: asset!.canonicalSha256,
      }
    }
    variants.push({ ...variant, layers: archivedLayers })
  }

  files['draft.json'] = json({
    archiveVersion: 1,
    schemaVersion: draft.schemaVersion,
    packId: draft.packId,
    name: draft.name,
    headRegistration: draft.headRegistration,
    selected: draft.selected,
    updatedAt: draft.updatedAt,
    approvedAt: draft.approvedAt,
    variants,
  })
  try {
    const pack = buildCharacterPack(draft)
    files['character-pack.json'] = json({
      ...pack,
      assets: pack.assets.map((asset) => ({ ...asset, path: `assets/${asset.id}.png` })),
    })
  } catch {
    // An unfinished draft is still a valid backup; character-pack.json appears once it is installable.
  }
  files['README.md'] = strToU8('# Companion Character Draft\n\nLossless local draft backup. `character-pack.json` is included only when this draft is ready to install.\n')
  return new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' })
}
