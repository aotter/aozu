import type { CharacterPackLibraryRecord } from '../../core/application/ports.ts'
import {
  ASSET_STORE,
  ENTRY_STORE,
  openCompanionDatabase,
  type StoredAsset,
  type StoredEntry,
} from './database.ts'

export const CHARACTER_PACK_LIBRARY_NAMESPACE = 'character-pack-library'
const keyFor = (pack: CharacterPackLibraryRecord['pack']) => `${pack.id}@${pack.version}`
const assetKey = (packKey: string, id: string) => `${packKey}:${id}`

export function createIndexedDbCharacterPackLibraryRepository() {
  return {
    async install(record: CharacterPackLibraryRecord, now = Date.now()): Promise<void> {
      const database = await openCompanionDatabase()
      const transaction = database.transaction([ENTRY_STORE, ASSET_STORE], 'readwrite')
      const entries = transaction.objectStore(ENTRY_STORE)
      const assets = transaction.objectStore(ASSET_STORE)
      const packKey = keyFor(record.pack)
      if (await entries.get([CHARACTER_PACK_LIBRARY_NAMESPACE, packKey])) {
        await transaction.done
        throw new Error(`Character Pack already installed: ${packKey}`)
      }
      const entry: StoredEntry = {
        bundleId: CHARACTER_PACK_LIBRARY_NAMESPACE,
        id: packKey,
        collection: 'character-packs',
        status: 'published',
        version: 1,
        data: {
          name: record.name,
          pack: structuredClone(record.pack),
          composition: structuredClone(record.composition),
        },
        authorId: null,
        createdAt: now,
        updatedAt: now,
      }
      await entries.add(entry)
      for (const asset of record.assets) {
        const stored: StoredAsset = {
          bundleId: CHARACTER_PACK_LIBRARY_NAMESPACE,
          id: assetKey(packKey, asset.id),
          blob: asset.blob,
        }
        await assets.add(stored)
      }
      const [storedEntry, storedAssets] = await Promise.all([
        entries.get([CHARACTER_PACK_LIBRARY_NAMESPACE, packKey]),
        assets.index('bundleId').getAll(CHARACTER_PACK_LIBRARY_NAMESPACE),
      ])
      if (!storedEntry || record.assets.some(({ id }) => !storedAssets.some((asset) => asset.id === assetKey(packKey, id)))) {
        transaction.abort()
        await transaction.done.catch(() => undefined)
        throw new Error(`Character Pack read-back failed: ${packKey}`)
      }
      await transaction.done
    },

    async list(): Promise<CharacterPackLibraryRecord[]> {
      const database = await openCompanionDatabase()
      const [entries, assets] = await Promise.all([
        database.getAllFromIndex(ENTRY_STORE, 'bundleId', CHARACTER_PACK_LIBRARY_NAMESPACE),
        database.getAllFromIndex(ASSET_STORE, 'bundleId', CHARACTER_PACK_LIBRARY_NAMESPACE),
      ])
      return entries
        .filter(({ collection, status }) => collection === 'character-packs' && status === 'published')
        .map(({ id, data }) => {
          const pack = data.pack as CharacterPackLibraryRecord['pack']
          return {
            name: String(data.name),
            pack,
            composition: structuredClone(data.composition) as CharacterPackLibraryRecord['composition'],
            assets: pack.assets.map(({ blobId }) => {
              const blob = assets.find((asset) => asset.id === assetKey(id, blobId))?.blob
              if (!blob) throw new Error(`Installed Character Pack asset is missing: ${id}/${blobId}`)
              return { id: blobId, blob }
            }),
          }
        })
        .sort((left, right) => left.name.localeCompare(right.name) || keyFor(left.pack).localeCompare(keyFor(right.pack)))
    },
  }
}
