import { createIndexedDbBundleRepository } from './adapters/indexeddb/bundle-repository.ts'
import { createIndexedDbAssetRepository } from './adapters/indexeddb/asset-repository.ts'
import { createIndexedDbCharacterDraftRepository } from './adapters/indexeddb/character-draft-repository.ts'
import { createIndexedDbEntryRepository } from './adapters/indexeddb/mantle-storage.ts'
import { createIndexedDbActionRepository } from './adapters/indexeddb/action-repository.ts'
import { createIndexedDbPendingTurnRepository } from './adapters/indexeddb/pending-turn-repository.ts'
import { createAgentCapability, registerCompanionTools } from './adapters/webmcp/tools.ts'
import { queueAgentTurn, resolveAgentTurn } from './core/application/agent-turn.ts'
import {
  assembleAuthoredCandidate,
  createDefaultCustomizationSeed,
  stageAuthoredCandidate,
  type AgentCustomization,
} from './core/application/authoring.ts'
import { approveCandidate as approveStagedCandidate } from './core/application/candidate.ts'
import { loadCompanionStartup } from './core/application/companion.ts'
import { loadStage, submitInteraction } from './core/application/stage.ts'
import { CHARACTER_RIG, type CharacterAssetTarget, type CharacterDraft } from './core/domain/character.ts'
import {
  CHARACTER_CREATION_GROUPS,
  REQUIRED_CHARACTER_TARGETS,
  createCharacterDraft,
  loadCharacterProjection,
  migrateCharacterDraft,
  saveCharacterDraftAsset,
  stageCharacterDraft,
} from './core/application/character-creation.ts'
import { inspectCharacterImage } from './adapters/browser/character-image.ts'
import { planItemEffects } from './core/application/items.ts'
import { exportPortableBundle, stagePortableBundle } from './adapters/zip/bundle.ts'

const readDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read character asset'))
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(blob)
})

export function createApplication(document: Document) {
  const agent = createAgentCapability(document)
  const bundles = createIndexedDbBundleRepository()
  const drafts = createIndexedDbCharacterDraftRepository()

  const openCharacterDraft = async () => {
    const existing = await drafts.get()
    if (existing) {
      const draft = migrateCharacterDraft(existing)
      if (draft !== existing) await drafts.put(draft)
      return draft
    }
    const draft = createCharacterDraft()
    await drafts.put(draft)
    return draft
  }

  const active = async () => {
    const bundle = await bundles.getActive()
    if (!bundle?.record.metadata) throw new Error('No active Companion')
    return { bundleId: bundle.record.id, ...bundle.record.metadata }
  }
  const application = {
    async loadStartup() {
      const startup = await loadCompanionStartup(agent, bundles, createIndexedDbEntryRepository)
      if (startup.status !== 'main') return startup
      return {
        ...startup,
        character: await loadCharacterProjection(
          createIndexedDbEntryRepository(startup.bundleId),
          createIndexedDbAssetRepository,
          startup.bundleId,
          inspectCharacterImage,
        ),
      }
    },
    createPresetSeed: createDefaultCustomizationSeed,
    openCharacterDraft,
    async updateCharacterDraft(draft: CharacterDraft) {
      const next = { ...draft, updatedAt: Date.now() }
      await drafts.put(next)
      return next
    },
    async saveCharacterAsset(draft: CharacterDraft, target: CharacterAssetTarget, blob: Blob, filename: string, source: 'user' | 'agent' = 'user') {
      return saveCharacterDraftAsset(drafts, inspectCharacterImage, draft, target, blob, filename, source)
    },
    prepareCharacter: (draft: CharacterDraft) => stageCharacterDraft(
      bundles,
      createIndexedDbEntryRepository,
      createIndexedDbAssetRepository,
      inspectCharacterImage,
      draft,
    ),
    clearCharacterDraft: () => drafts.clear(),
    async preparePreset(customization: AgentCustomization) {
      const candidate = assembleAuthoredCandidate(`bundle:${crypto.randomUUID()}`, customization)
      return stageAuthoredCandidate(bundles, createIndexedDbEntryRepository, candidate)
    },
    async approveCandidate(bundleId: string, approved: true) {
      return approveStagedCandidate(bundles, bundleId, approved)
    },
    async activateCompanion(bundleId: string) {
      return bundles.activate(bundleId, true)
    },
    async deleteCompanion(bundleId: string) {
      await bundles.deleteSaved(bundleId)
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
    exportData: exportPortableBundle,
    prepareImport: stagePortableBundle,
  }
  registerCompanionTools(document, {
    async inspectCharacter() {
      const draft = await openCharacterDraft()
      const canonical = draft.variants.find(({ group, id }) => group === 'body' && id === 'base')?.layers.body
      return {
        status: 'ok',
        data: {
          rig: CHARACTER_RIG,
          creationGroups: CHARACTER_CREATION_GROUPS,
          variants: draft.variants.map((variant) => ({
            group: variant.group,
            id: variant.id,
            label: variant.label,
            layers: CHARACTER_CREATION_GROUPS.find(({ group }) => group === variant.group)!.layers.map((layer) => ({ layer, filled: Boolean(variant.layers[layer]) })),
          })),
          draft: { name: draft.name, selected: draft.selected },
          canonicalReference: canonical ? {
            filename: canonical.filename,
            sha256: canonical.inspection.sha256,
            dataUrl: await readDataUrl(canonical.blob),
          } : null,
          productionBrief: [
            'The first body/base/body candidate becomes the canonical character. Generate every later variant from that canonical reference, never from another generated variant.',
            'Before importing, preprocess generated assets outside the website: remove the background, resize onto the exact 512×768 canvas without changing alignment, and verify genuine alpha transparency.',
            'Submit only final RGBA PNG layers. The website validates but never repairs candidate images.',
            'Expression layers replace the whole aligned head, including the same fixed hairstyle and facial hair. Hair and facial hair are not customizable slots.',
            'Expressions are variants of one whole-head slot. The canonical set is neutral, happy, sad, angry, surprised, and sleepy; additional expression variants are allowed.',
            'Outfits are full-body variants. Props are independent, multi-select, full-canvas overlays and may contain front and back layers. A prop may be positioned anywhere, including on the head or in a hand.',
          ],
        },
        nextActions: REQUIRED_CHARACTER_TARGETS
          .filter((target) => !draft.variants.find(({ group, id }) => group === target.group && id === target.variantId)?.layers[target.layer])
          .map((target) => ({ tool: 'submit_character_asset_candidate', required: true, reason: `Fill ${target.group}/${target.variantId}/${target.layer}.` })),
      }
    },
    async submitCharacterAsset({ target, filename, dataUrl }: { target: CharacterAssetTarget; filename: string; dataUrl: string }) {
      const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
      if (!match || dataUrl.length > 7_100_000) throw new Error('Expected a PNG data URL under 5 MiB')
      const binary = atob(match[1])
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
      const current = await openCharacterDraft()
      const canonical = current.variants.find(({ group, id }) => group === 'body' && id === 'base')?.layers.body
      if (!(target.group === 'body' && target.variantId === 'base' && target.layer === 'body') && !canonical) throw new Error('Submit body/base/body before derived character assets')
      const draft = await application.saveCharacterAsset(current, target, new Blob([bytes], { type: 'image/png' }), filename, 'agent')
      document.defaultView?.dispatchEvent(new Event('character-draft-updated'))
      return {
        status: 'ok',
        data: { target, filename, byteLength: bytes.byteLength },
        nextActions: REQUIRED_CHARACTER_TARGETS
          .filter((required) => !draft.variants.find(({ group, id }) => group === required.group && id === required.variantId)?.layers[required.layer])
          .map((required) => ({ tool: 'submit_character_asset_candidate', required: true, reason: `Fill ${required.group}/${required.variantId}/${required.layer}.` })),
      }
    },
    async inspect() {
      const { bundleId, runId, name } = await active()
      const entries = createIndexedDbEntryRepository(bundleId)
      const pending = (await entries.readPublished({ collection: 'pending-agent-turns' }))
        .filter(({ data }) => data.status === 'pending')
        .map(({ id, data }) => ({ id, ...data }))
      return {
        status: 'ok',
        data: {
          name,
          stage: await loadStage(entries, runId),
          loadout: (await planItemEffects(entries, runId, [])).projection,
          pendingTurns: pending,
        },
      }
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

export type Application = ReturnType<typeof createApplication>
