import type { CharacterDraftRepository } from '../../core/application/ports.ts'
import { CHARACTER_DRAFT_STORE, openCompanionDatabase } from './database.ts'

export function createIndexedDbCharacterDraftRepository(): CharacterDraftRepository {
  return {
    async list() {
      return (await openCompanionDatabase()).getAll(CHARACTER_DRAFT_STORE)
    },
    async get(id) {
      return (await (await openCompanionDatabase()).get(CHARACTER_DRAFT_STORE, id)) ?? null
    },
    async create(draft) {
      await (await openCompanionDatabase()).add(CHARACTER_DRAFT_STORE, draft)
      return draft
    },
    async put(draft) {
      await (await openCompanionDatabase()).put(CHARACTER_DRAFT_STORE, draft)
      return draft
    },
    async delete(id) {
      await (await openCompanionDatabase()).delete(CHARACTER_DRAFT_STORE, id)
    },
  }
}
