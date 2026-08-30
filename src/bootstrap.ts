import { createIndexedDbCompanionRepository } from './adapters/indexeddb/repository.ts'
import { createAgentCapability } from './adapters/webmcp/tools.ts'
import { loadCompanionStartup } from './core/application/companion.ts'

export function createApplication(document: Document) {
  const agent = createAgentCapability(document)
  const repository = createIndexedDbCompanionRepository()

  return {
    loadStartup: () => loadCompanionStartup(agent, repository),
  }
}
