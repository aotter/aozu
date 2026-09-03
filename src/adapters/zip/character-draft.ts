import { strToU8, unzipSync, zipSync } from 'fflate'

import { buildCharacterPack, validateCharacterAssetInspection } from '../../core/application/character-creation.ts'
import {
  CHARACTER_VARIANT_GROUPS,
  CHARACTER_VARIANT_LAYERS,
  CHARACTER_RIG,
  validateCharacterVariantTransform,
  type CharacterAssetInspection,
  type CharacterDraft,
  type CharacterDraftVariant,
  type CharacterTextureAtlas,
  type CharacterVariantGroup,
  type CharacterVariantLayer,
  type CharacterVariantTransform,
} from '../../core/domain/character.ts'
import { companionArchiveKind, parseZipJson } from './bundle.ts'

const json = (value: unknown) => strToU8(JSON.stringify(value, null, 2))
const assetId = (group: string, variantId: string, layer: CharacterVariantLayer) => `${group}-${variantId}-${layer}`
const idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/
const variantIdPattern = /^[a-z0-9][a-z0-9_-]{0,39}$/
const sha256Pattern = /^[0-9a-f]{64}$/

const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`)
  return value as Record<string, unknown>
}

const string = (value: unknown, label: string, maxLength: number) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw new Error(`Invalid ${label}`)
  return value
}

export async function readCharacterDraftZip(
  blob: Blob,
  inspect: (blob: Blob) => Promise<CharacterAssetInspection>,
): Promise<{ draft: CharacterDraft }> {
  const archive = new Uint8Array(await blob.arrayBuffer())
  if (companionArchiveKind(archive) !== 'character-draft') throw new Error('This ZIP is not a Companion authoring draft')
  const files = unzipSync(archive)
  for (const path of Object.keys(files)) if (path.endsWith('/')) delete files[path]
  const raw = object(parseZipJson(files['draft.json']!, 'Character Draft manifest'), 'Character Draft manifest')
  if (raw.archiveVersion !== 1) throw new Error('Unsupported Character Draft archive version')
  if (raw.schemaVersion !== 3 && raw.schemaVersion !== 4) throw new Error('Unsupported Character Draft schema version')
  const sourceId = string(raw.id, 'Character Draft ID', 100)
  const packId = string(raw.packId, 'Character Pack ID', 64)
  if (!idPattern.test(packId)) throw new Error('Invalid Character Pack ID')
  const name = string(raw.name, 'Companion name', 200)
  if (!Array.isArray(raw.variants)) throw new Error('Invalid Character Draft variants')
  const assetPaths = new Set(Object.keys(files).filter((path) => path.startsWith('assets/')))
  const keys = new Set<string>()
  const variants: CharacterDraftVariant[] = []
  for (const value of raw.variants) {
    const archived = object(value, 'Character Draft variant')
    if (!CHARACTER_VARIANT_GROUPS.includes(archived.group as CharacterVariantGroup)) throw new Error('Invalid Character Draft variant group')
    const group = archived.group as CharacterVariantGroup
    const id = string(archived.id, 'Character Draft variant ID', 40)
    const label = string(archived.label, 'Character Draft variant label', 80)
    const key = `${group}:${id}`
    if (!variantIdPattern.test(id) || keys.has(key)) throw new Error(`Duplicate or invalid Character Draft variant: ${key}`)
    keys.add(key)
    const archivedLayers = object(archived.layers, `Character Draft layers for ${key}`)
    const layers: CharacterDraftVariant['layers'] = {}
    for (const [layer, layerValue] of Object.entries(archivedLayers)) {
      if (!(CHARACTER_VARIANT_LAYERS[group] as readonly string[]).includes(layer)) throw new Error(`Invalid Character Draft layer: ${key}:${layer}`)
      const descriptor = object(layerValue, `Character Draft asset ${key}:${layer}`)
      const path = string(descriptor.path, `Character Draft asset path ${key}:${layer}`, 200)
      const expectedPath = `assets/${assetId(group, id, layer as CharacterVariantLayer)}.png`
      const bytes = files[path]
      if (path !== expectedPath || !bytes || !assetPaths.delete(path)) throw new Error(`Character Draft asset is missing or duplicated: ${expectedPath}`)
      const filename = string(descriptor.filename, `Character Draft asset filename ${key}:${layer}`, 200)
      if (descriptor.source !== 'user' && descriptor.source !== 'agent' && descriptor.source !== 'starter') throw new Error(`Invalid Character Draft asset source: ${key}:${layer}`)
      if (descriptor.canonicalSha256 !== undefined && (typeof descriptor.canonicalSha256 !== 'string' || !sha256Pattern.test(descriptor.canonicalSha256))) {
        throw new Error(`Invalid Character Draft canonical hash: ${key}:${layer}`)
      }
      const assetBlob = new Blob([bytes], { type: 'image/png' })
      const inspection = await inspect(assetBlob)
      validateCharacterAssetInspection(inspection)
      layers[layer as CharacterVariantLayer] = {
        blob: assetBlob,
        filename,
        source: descriptor.source,
        inspection,
        ...(descriptor.canonicalSha256 ? { canonicalSha256: descriptor.canonicalSha256 } : {}),
      }
    }
    const rawTransform = archived.transform === undefined ? undefined : object(archived.transform, `Character Draft transform ${key}`)
    const transform = rawTransform && { x: rawTransform.x, y: rawTransform.y, scale: rawTransform.scale } as CharacterVariantTransform
    if (transform) validateCharacterVariantTransform(transform)
    variants.push({ group, id, label, layers, ...(transform ? { transform } : {}) })
  }
  if (assetPaths.size) throw new Error(`Character Draft contains an unreferenced asset: ${[...assetPaths][0]}`)

  const selected = object(raw.selected, 'Character Draft selection')
  if (!Array.isArray(selected.props) || selected.props.some((id) => typeof id !== 'string') || new Set(selected.props).size !== selected.props.length) {
    throw new Error('Invalid Character Draft prop selection')
  }
  const hasVariant = (group: CharacterVariantGroup, id: unknown) => typeof id === 'string' && variants.some((variant) => variant.group === group && variant.id === id)
  if (selected.expression !== undefined && !hasVariant('expression', selected.expression)) throw new Error('Selected Character Draft expression is missing')
  if (selected.outfit !== undefined && !hasVariant('outfit', selected.outfit)) throw new Error('Selected Character Draft outfit is missing')
  if (selected.props.some((id) => !hasVariant('prop', id))) throw new Error('Selected Character Draft prop is missing')
  const headRegistration = raw.headRegistration === undefined ? undefined : object(raw.headRegistration, 'Character Draft head registration')
  if (headRegistration && !hasVariant('expression', headRegistration.variantId)) throw new Error('Registered Character Draft head is missing')

  return {
    draft: {
      id: sourceId,
      schemaVersion: 4,
      revision: typeof raw.revision === 'number' && Number.isSafeInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0,
      packId,
      rigProfile: { id: CHARACTER_RIG.id, version: CHARACTER_RIG.version },
      name,
      variants,
      ...(headRegistration ? { headRegistration: { variantId: headRegistration.variantId as string } } : {}),
      selected: {
        ...(selected.expression ? { expression: selected.expression as string } : {}),
        ...(selected.outfit ? { outfit: selected.outfit as string } : {}),
        props: [...selected.props] as string[],
      },
      updatedAt: Date.now(),
    },
  }
}

export async function exportCharacterDraftZip(
  draft: CharacterDraft,
  atlas?: CharacterTextureAtlas,
): Promise<Blob> {
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
    id: draft.id,
    schemaVersion: draft.schemaVersion,
    packId: draft.packId,
    name: draft.name,
    headRegistration: draft.headRegistration,
    selected: draft.selected,
    revision: draft.revision,
    updatedAt: draft.updatedAt,
    variants,
  })
  try {
    const pack = buildCharacterPack(draft)
    files['character-pack.json'] = json({
      ...pack,
      assets: pack.assets.map((asset) => ({ ...asset, path: `assets/${asset.id}.png`, ...(atlas ? { atlasFrame: asset.id } : {}) })),
      ...(atlas ? { atlas: { image: atlas.data.meta.image, data: 'character.atlas.json' } } : {}),
    })
  } catch {
    // A partially built Character is still a valid backup.
  }
  if (atlas) {
    files[atlas.data.meta.image] = new Uint8Array(await atlas.image.arrayBuffer())
    files['character.atlas.json'] = json(atlas.data)
  }
  files['README.md'] = strToU8('# Companion Character\n\nLossless local Character backup. A TexturePacker/Pixi-compatible atlas and `character-pack.json` are included when current layers can be compiled.\n')
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' })
}
