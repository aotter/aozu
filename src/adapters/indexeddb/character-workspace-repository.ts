import type { Entry } from '@aotter/mantle-spec'
import type { MantleRuntime } from '@aotter/mantle-runtime'

import type { AssetRepositoryFactory, CharacterDraftRepository } from '../../core/application/ports.ts'
import type {
  CharacterDraft,
  CharacterDraftAsset,
  CharacterVariantLayer,
  CharacterWorkspaceData,
} from '../../core/domain/character.ts'

export const CHARACTER_WORKSPACE_COLLECTION = 'character-workspaces'
const assetScope = (packId: string) => `character:${packId}`
const context = { user: null, staff: null, env: {} }

const dataFrom = (draft: CharacterDraft): CharacterWorkspaceData => ({
  schemaVersion: draft.schemaVersion,
  revision: draft.revision,
  packId: draft.packId,
  rigProfile: structuredClone(draft.rigProfile),
  name: draft.name,
  variants: draft.variants.map(({ layers, ...variant }) => ({
    ...structuredClone(variant),
    layers: Object.fromEntries(Object.entries(layers).map(([layer, asset]) => [layer, asset && {
      filename: asset.filename,
      source: asset.source,
      inspection: structuredClone(asset.inspection),
      ...(asset.canonicalSha256 ? { canonicalSha256: asset.canonicalSha256 } : {}),
      blobId: asset.inspection.sha256,
    }])),
  })),
  ...(draft.headRegistration ? { headRegistration: structuredClone(draft.headRegistration) } : {}),
  selected: structuredClone(draft.selected),
})

export function createCharacterWorkspaceRepository(
  runtime: () => Promise<MantleRuntime>,
  assets: AssetRepositoryFactory,
): CharacterDraftRepository {
  const persistAssets = async (draft: CharacterDraft) => {
    const repository = assets(assetScope(draft.packId))
    const unique = new Map(draft.variants.flatMap(({ layers }) => Object.values(layers).filter(Boolean).map((asset) => [asset.inspection.sha256, asset.blob])))
    await Promise.all([...unique].map(async ([id, blob]) => {
      if (!await repository.get(id)) await repository.put(id, blob)
    }))
  }
  const hydrate = async (entry: Entry): Promise<CharacterDraft> => {
    const data = structuredClone(entry.data) as unknown as CharacterWorkspaceData
    const repository = assets(assetScope(data.packId))
    const variants = await Promise.all(data.variants.map(async ({ layers, ...variant }) => ({
      ...variant,
      layers: Object.fromEntries(await Promise.all(Object.entries(layers).map(async ([layer, asset]) => {
        if (!asset) return [layer, asset]
        const blob = await repository.get(asset.blobId)
        if (!blob) throw new Error(`Character asset is missing: ${data.packId}/${asset.blobId}`)
        const { blobId: _blobId, ...descriptor } = asset
        return [layer, { ...descriptor, blob } satisfies CharacterDraftAsset]
      }))) as Partial<Record<CharacterVariantLayer, CharacterDraftAsset>>,
    })))
    return { ...data, id: entry.id, updatedAt: entry.updatedAt, variants }
  }
  const entries = async () => (await runtime()).entries

  return {
    async list() {
      const rows = await (await entries()).readPublished({ collection: CHARACTER_WORKSPACE_COLLECTION })
      return Promise.all(rows.map(hydrate))
    },
    async get(id) {
      const entry = await (await entries()).readById(id)
      return entry?.collection === CHARACTER_WORKSPACE_COLLECTION && entry.status === 'published' ? hydrate(entry) : null
    },
    async create(draft) {
      await persistAssets(draft)
      const result = await (await runtime()).invokeProcedure<Entry>({
        procedure: 'create-character-workspace',
        input: dataFrom(draft),
        ctx: context,
      })
      if (!result.ok) throw new Error(result.diagnostic.message ?? 'Character could not be created')
      return hydrate(result.data)
    },
    async put(draft) {
      const current = await (await entries()).readById(draft.id)
      if (!current || current.collection !== CHARACTER_WORKSPACE_COLLECTION) throw new Error('Character not found')
      if (draft.revision !== Number(current.data.revision) + 1) throw new Error('Character changed; reload and try again')
      await persistAssets(draft)
      const result = await (await runtime()).invokeProcedure<Entry>({
        procedure: 'update-character-workspace',
        input: { id: draft.id, expectedVersion: current.version, ...dataFrom(draft) },
        ctx: context,
      })
      if (!result.ok) throw new Error(result.diagnostic.message ?? 'Character could not be saved')
      return hydrate(result.data)
    },
    async delete(id) {
      const current = await (await entries()).readById(id)
      if (!current || current.collection !== CHARACTER_WORKSPACE_COLLECTION) return
      const result = await (await runtime()).invokeProcedure({
        procedure: 'delete-character-workspace', input: { id }, ctx: context,
      })
      if (!result.ok) throw new Error(result.diagnostic.message ?? 'Character could not be deleted')
      await assets(assetScope(String(current.data.packId))).deleteAll?.()
    },
  }
}
