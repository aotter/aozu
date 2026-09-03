import { CHARACTER_DRAFT_STORE, openCompanionDatabase } from './database.ts'

/** Pre-Mantle Character store; only read for one-time migration into Character workspaces. */
export function createIndexedDbCharacterDraftRepository() {
  return {
    async list() {
      return (await openCompanionDatabase()).getAll(CHARACTER_DRAFT_STORE)
    },
    async delete(id: string) {
      await (await openCompanionDatabase()).delete(CHARACTER_DRAFT_STORE, id)
    },
  }
}
