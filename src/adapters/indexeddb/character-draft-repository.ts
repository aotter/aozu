import type { CharacterDraftRepository } from '../../core/application/ports.ts'
import { CHARACTER_DRAFT_STORE, openCompanionDatabase } from './database.ts'

export function createIndexedDbCharacterDraftRepository(): CharacterDraftRepository {
  return {
    async get() {
      return (await (await openCompanionDatabase()).get(CHARACTER_DRAFT_STORE, 'current')) ?? null
    },
    async put(draft) {
      await (await openCompanionDatabase()).put(CHARACTER_DRAFT_STORE, draft)
    },
    async clear() {
      await (await openCompanionDatabase()).delete(CHARACTER_DRAFT_STORE, 'current')
    },
  }
}
