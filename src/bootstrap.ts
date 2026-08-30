import { createIndexedDbBundleRepository } from './adapters/indexeddb/bundle-repository.ts'
import { createIndexedDbEntryRepository } from './adapters/indexeddb/mantle-storage.ts'
import { createIndexedDbActionRepository } from './adapters/indexeddb/action-repository.ts'
import { createIndexedDbPendingTurnRepository } from './adapters/indexeddb/pending-turn-repository.ts'
import { createAgentCapability, registerCompanionTools } from './adapters/webmcp/tools.ts'
import { queueAgentTurn, resolveAgentTurn } from './core/application/agent-turn.ts'
import { assembleAuthoredCandidate, DEFAULT_CUSTOMIZATION, installAuthoredCandidate } from './core/application/authoring.ts'
import { loadCompanionStartup } from './core/application/companion.ts'
import { loadStage, submitInteraction } from './core/application/stage.ts'

export function createApplication(document: Document) {
  const agent = createAgentCapability(document)
  const bundles = createIndexedDbBundleRepository()

  const active = async () => {
    const bundle = await bundles.getActive()
    if (!bundle?.record.metadata) throw new Error('No active Companion')
    return { bundleId: bundle.record.id, ...bundle.record.metadata }
  }
  const application = {
    loadStartup: () => loadCompanionStartup(agent, bundles, createIndexedDbEntryRepository),
    async createPreset() {
      const candidate = assembleAuthoredCandidate(`bundle:${crypto.randomUUID()}`, DEFAULT_CUSTOMIZATION)
      return installAuthoredCandidate(bundles, createIndexedDbEntryRepository, candidate, true)
    },
    async submitAction(actionId: string, expectedRevision: number, idempotencyKey: string = crypto.randomUUID()) {
      const { bundleId, runId } = await active()
      return submitInteraction(createIndexedDbEntryRepository(bundleId), createIndexedDbActionRepository(), {
        bundleId, runId, actionId, expectedRevision, idempotencyKey,
      })
    },
    async submitText(text: string, expectedRevision: number, idempotencyKey: string = crypto.randomUUID()) {
      const { bundleId, runId } = await active()
      const entries = createIndexedDbEntryRepository(bundleId)
      const local = await submitInteraction(entries, createIndexedDbActionRepository(), {
        bundleId, runId, text, expectedRevision, idempotencyKey,
      })
      if (local.path !== 'cold') return local
      const turn = await queueAgentTurn(entries, createIndexedDbPendingTurnRepository(), {
        bundleId, runId, userText: text, expectedRevision, idempotencyKey,
      })
      return { path: 'cold' as const, turn }
    },
  }
  registerCompanionTools(document, {
    async inspect() {
      const { bundleId, runId, name } = await active()
      const entries = createIndexedDbEntryRepository(bundleId)
      const pending = (await entries.readPublished({ collection: 'pending-agent-turns' }))
        .filter(({ data }) => data.status === 'pending')
        .map(({ id, data }) => ({ id, ...data }))
      return { status: 'ok', data: { name, stage: await loadStage(entries, runId), pendingTurns: pending } }
    },
    async submit({ actionId, expectedRevision, idempotencyKey }) {
      const result = await application.submitAction(actionId, expectedRevision, idempotencyKey)
      document.defaultView?.dispatchEvent(new Event('companion-updated'))
      return result
    },
    async resolve(input) {
      const { bundleId } = await active()
      const stage = await resolveAgentTurn(createIndexedDbEntryRepository(bundleId), createIndexedDbActionRepository(), {
        bundleId, ...input,
      })
      document.defaultView?.dispatchEvent(new Event('companion-updated'))
      return { status: 'ok', data: { stage }, nextActions: [{ tool: 'inspect_companion', required: true }] }
    },
  })
  return application
}
