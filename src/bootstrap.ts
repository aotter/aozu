import { createIndexedDbBundleRepository } from './adapters/indexeddb/bundle-repository.ts'
import { createIndexedDbEntryRepository } from './adapters/indexeddb/mantle-storage.ts'
import { createAgentCapability } from './adapters/webmcp/tools.ts'
import { assembleAuthoredCandidate, DEFAULT_CUSTOMIZATION, installAuthoredCandidate } from './core/application/authoring.ts'
import { loadCompanionStartup } from './core/application/companion.ts'

export function createApplication(document: Document) {
  const agent = createAgentCapability(document)
  const bundles = createIndexedDbBundleRepository()

  return {
    loadStartup: () => loadCompanionStartup(agent, bundles, createIndexedDbEntryRepository),
    async createPreset() {
      const candidate = assembleAuthoredCandidate(`bundle:${crypto.randomUUID()}`, DEFAULT_CUSTOMIZATION)
      return installAuthoredCandidate(bundles, createIndexedDbEntryRepository, candidate, true)
    },
  }
}
