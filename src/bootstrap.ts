import { runtimeDiagnostic, type Entry } from '@aotter/mantle-spec'
import { bootMantleRuntime, InvokeFailure, type MantleRuntime } from '@aotter/mantle-runtime'

import { createIndexedDbBundleRepository } from './adapters/indexeddb/bundle-repository.ts'
import { createIndexedDbAssetRepository } from './adapters/indexeddb/asset-repository.ts'
import { createIndexedDbCharacterDraftRepository } from './adapters/indexeddb/character-draft-repository.ts'
import { ExperienceSubmissionConflict, persistTriggeredExperienceCandidate } from './adapters/indexeddb/experience-candidate-repository.ts'
import { createIndexedDbEntryRepository, createIndexedDbMantleStorageAdapter } from './adapters/indexeddb/mantle-storage.ts'
import { createIndexedDbActionRepository } from './adapters/indexeddb/action-repository.ts'
import { createIndexedDbPendingTurnRepository } from './adapters/indexeddb/pending-turn-repository.ts'
import { createAgentCapability, registerCompanionTools } from './adapters/webmcp/tools.ts'
import { loadStarterCatalog } from './adapters/browser/starter-packages.ts'
import { queueAgentTurn, resolveAgentTurn } from './core/application/agent-turn.ts'
import { AUTHORING_NAMESPACE, assembleExperienceCandidate, ExperienceCandidateValidationError } from './core/application/authoring.ts'
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
  reviewCharacterDraft,
} from './core/application/character-creation.ts'
import { inspectCharacterImage } from './adapters/browser/character-image.ts'
import { inspectSceneImage } from './adapters/browser/scene-image.ts'
import { requestPersistentStorage } from './adapters/browser/storage-persistence.ts'
import { planItemEffects } from './core/application/items.ts'
import { loadSceneProjection } from './core/application/scene.ts'
import { exportPortableBundle, stagePortableBundle } from './adapters/zip/bundle.ts'
import { createExperienceDraftData, EXPERIENCE_LIMITS, validateLoadedStarterPackage, type ExperienceDraft } from './core/domain/starter.ts'
import { compileFixedBackbone, FIXED_BACKBONE_VERSION } from './core/mantle/backbone.ts'

const readDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read character asset'))
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(blob)
})

const toExperienceDraft = (entry: Entry): ExperienceDraft => ({
  id: entry.id,
  ...(structuredClone(entry.data) as unknown as Omit<ExperienceDraft, 'id' | 'createdAt' | 'updatedAt'>),
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
})

export function createApplication(document: Document) {
  const agent = createAgentCapability(document)
  const bundles = createIndexedDbBundleRepository()
  const characterDrafts = createIndexedDbCharacterDraftRepository()
  const browser = document.defaultView
  let starterPackages: ReturnType<typeof loadStarterCatalog> | undefined
  const loadStarters = () => starterPackages ??= loadStarterCatalog(
    browser?.fetch.bind(browser) ?? fetch,
    inspectCharacterImage,
    inspectSceneImage,
    FIXED_BACKBONE_VERSION,
  )
  const sameSeed = (left: ExperienceDraft['seed'], right: ExperienceDraft['seed']) =>
    left.kind === right.kind &&
    left.directionId === right.directionId &&
    left.completionMode === right.completionMode &&
    left.brief === right.brief &&
    left.loopIds.length === right.loopIds.length &&
    left.loopIds.every((id, index) => id === right.loopIds[index])
  const loadDraftStarter = async (draft: ExperienceDraft) => {
    const packaged = (await loadStarters()).find(({ starter }) =>
      starter.id === draft.starter.id && starter.version === draft.starter.version,
    )
    if (!packaged) throw new Error(`Starter package is unavailable: ${draft.starter.id}@${draft.starter.version}`)
    const direction = packaged.starter.directions.find(({ id }) => id === draft.direction.id)
    if (
      packaged.manifestSha256 !== draft.starter.manifestSha256 ||
      packaged.starter.name !== draft.starter.name ||
      !direction ||
      direction.name !== draft.direction.name ||
      direction.summary !== draft.direction.summary ||
      direction.characterStateId !== draft.characterStateId ||
      direction.characterStateId !== draft.direction.characterStateId ||
      direction.sceneCompositionId !== draft.sceneCompositionId ||
      direction.sceneCompositionId !== draft.direction.sceneCompositionId ||
      !sameSeed(direction.seed, draft.seed) ||
      !sameSeed(direction.seed, draft.direction.seed)
    ) throw new Error('Starter package changed without a version change')
    return packaged
  }
  let authoringRuntime: Promise<MantleRuntime> | undefined
  let boundAuthoringRuntime: MantleRuntime | undefined

  const authoringFailure = (code: string, path: string, message: string, value?: unknown, conflict = false) => new InvokeFailure(runtimeDiagnostic({
    code: conflict ? 'CONFLICT' : 'INPUT_VALIDATION_FAILED',
    severity: 'error',
    path: `authoring/${code}/${path}`,
    value,
    expected: 'a valid revision-safe Experience candidate',
    message,
  }))

  const getAuthoringRuntime = () => authoringRuntime ??= bootMantleRuntime({
    plan: compileFixedBackbone(),
    storage: createIndexedDbMantleStorageAdapter(AUTHORING_NAMESPACE),
    handlers: {
      'companion.submit-action': () => {
        throw authoringFailure('unavailable', 'handler/companion.submit-action', 'Runtime actions require an active Companion namespace')
      },
      'companion.submit-experience-candidate': async (rawInput: unknown) => {
        const input = rawInput as { draftId: string; expectedRevision: number; idempotencyKey: string; candidateJson: string }
        try {
          const entry = await boundAuthoringRuntime?.entries.readById(input.draftId)
          if (!entry || entry.collection !== 'experience-drafts' || entry.status !== 'published') {
            throw new ExperienceSubmissionConflict('draft_not_found')
          }
          const draft = toExperienceDraft(entry)
          if (draft.lastSubmission?.idempotencyKey === input.idempotencyKey) {
            return { bundleId: draft.lastSubmission.bundleId, revision: draft.revision, replayed: true }
          }
          const packaged = await loadDraftStarter(draft)
          const resources = await validateLoadedStarterPackage(
            { starter: structuredClone(packaged.starter), assets: structuredClone(packaged.assets) },
            inspectCharacterImage,
            inspectSceneImage,
            FIXED_BACKBONE_VERSION,
          )
          let candidateInput: unknown
          try {
            candidateInput = JSON.parse(input.candidateJson)
          } catch {
            throw new ExperienceCandidateValidationError({ code: 'invalid_json', path: 'candidate', message: 'Candidate must be valid JSON' })
          }
          const candidate = assembleExperienceCandidate(`bundle:${crypto.randomUUID()}`, draft, resources, candidateInput)
          const result = await persistTriggeredExperienceCandidate(
            input.draftId,
            input.expectedRevision,
            input.idempotencyKey,
            candidate,
          )
          if (!result.replayed) browser?.dispatchEvent(new browser.CustomEvent('experience-candidate-staged', { detail: candidate.preview }))
          return result
        } catch (error) {
          if (error instanceof ExperienceCandidateValidationError) {
            const diagnostic = error.diagnostics[0]!
            throw authoringFailure(diagnostic.code, diagnostic.path, diagnostic.message)
          }
          if (error instanceof ExperienceSubmissionConflict) {
            throw authoringFailure(error.code, 'experience-draft', error.message, error.currentRevision, true)
          }
          throw authoringFailure('invalid_starter', 'experience-draft.starter', error instanceof Error ? error.message : 'Starter validation failed')
        }
      },
    },
  }).then((runtime) => {
    boundAuthoringRuntime = runtime
    return runtime
  })

  const openExperienceDraft = async () => {
    const entries = await (await getAuthoringRuntime()).entries.readPublished({ collection: 'experience-drafts' })
    const current = [...entries]
      .sort((left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id))[0]
    return current ? toExperienceDraft(current) : null
  }

  const openCharacterDraft = async () => {
    const existing = await characterDrafts.get()
    if (existing) {
      const draft = migrateCharacterDraft(existing)
      if (draft !== existing) await characterDrafts.put(draft)
      return draft
    }
    const draft = createCharacterDraft()
    await characterDrafts.put(draft)
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
      if (startup.savedCompanions.length) void requestPersistentStorage(document.defaultView?.navigator.storage)
      if (startup.status !== 'main') return startup
      const entries = createIndexedDbEntryRepository(startup.bundleId)
      return {
        ...startup,
        character: await loadCharacterProjection(
          entries,
          createIndexedDbAssetRepository,
          startup.bundleId,
          inspectCharacterImage,
          startup.stage.scene?.characterStateId,
        ),
        ...(startup.stage.scene ? {
          scene: await loadSceneProjection(
            entries,
            createIndexedDbAssetRepository,
            startup.bundleId,
            startup.stage.scene.compositionId,
            inspectSceneImage,
          ),
        } : {}),
      }
    },
    listStarters: loadStarters,
    openExperienceDraft,
    async selectStarter(starterId: string, starterVersion: number, directionId: string) {
      const loaded = (await loadStarters()).find(({ starter }) => starter.id === starterId && starter.version === starterVersion)
      if (!loaded) throw new Error(`Starter not found: ${starterId}@${starterVersion}`)
      const result = await (await getAuthoringRuntime()).invokeTrigger<Entry>({
        trigger: 'select-experience-draft',
        input: createExperienceDraftData(loaded, directionId),
        ctx: { user: null, staff: null, env: {} },
      })
      if (!result.ok) throw new Error(result.diagnostic.message ?? 'Experience Draft could not be saved')
      await requestPersistentStorage(browser?.navigator.storage)
      return toExperienceDraft(result.data)
    },
    openCharacterDraft,
    async updateCharacterDraft(draft: CharacterDraft) {
      const next = { ...draft, approvedAt: undefined, updatedAt: Date.now() }
      await characterDrafts.put(next)
      return next
    },
    async saveCharacterAsset(draft: CharacterDraft, target: CharacterAssetTarget, blob: Blob, filename: string, source: 'user' | 'agent' = 'user') {
      return saveCharacterDraftAsset(characterDrafts, inspectCharacterImage, draft, target, blob, filename, source)
    },
    prepareCharacter: (draft: CharacterDraft) => reviewCharacterDraft(inspectCharacterImage, draft),
    async approveCharacterDraft() {
      const draft = await characterDrafts.get()
      if (!draft) throw new Error('Character draft not found')
      await reviewCharacterDraft(inspectCharacterImage, draft)
      const approved = { ...draft, approvedAt: Date.now(), updatedAt: Date.now() }
      await characterDrafts.put(approved)
      return approved
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
      const stage = await loadStage(entries, runId)
      if (stage.status !== 'active' || !stage.agentFallback) return local
      const turn = await queueAgentTurn(entries, createIndexedDbPendingTurnRepository(), {
        bundleId, runId, userText: text, expectedRevision, idempotencyKey,
      })
      return { path: 'cold' as const, turn }
    },
    exportData: exportPortableBundle,
    prepareImport: stagePortableBundle,
  }
  registerCompanionTools(document, {
    async inspectExperience() {
      const draft = await openExperienceDraft()
      if (!draft) throw new Error('Select a Starter and Direction before asking the agent to author an experience')
      const packaged = await loadDraftStarter(draft)
      return {
        status: 'ok',
        data: {
          contractVersion: 1,
          draft: { id: draft.id, revision: draft.revision },
          starter: draft.starter,
          direction: draft.direction,
          seed: draft.seed,
          selectedVisuals: {
            characterStateId: draft.characterStateId,
            sceneCompositionId: draft.sceneCompositionId,
          },
          resources: {
            characterAppearances: packaged.starter.characterPack.appearances.map(({ id }) => ({
              packId: packaged.starter.characterPack.id,
              packVersion: packaged.starter.characterPack.version,
              appearanceId: id,
            })),
            characterStates: packaged.starter.characterStates,
            sceneCompositions: packaged.starter.scenePack.compositions.map(({ id }) => ({
              packId: packaged.starter.scenePack.id,
              packVersion: packaged.starter.scenePack.version,
              compositionId: id,
            })),
          },
          skeleton: packaged.starter.skeleton,
          vocabulary: {
            conditions: ['metric', 'flag', 'stage', 'capability', 'inventory', 'equipped', 'appearance', 'quantity', 'itemState', 'all', 'any', 'not'],
            effects: ['addMetric', 'setFlag', 'changeStage', 'grantItem', 'consumeItem', 'equipItem', 'unequipItem', 'setItemState', 'setAppearanceOverride'],
          },
          limits: EXPERIENCE_LIMITS,
        },
        nextActions: [{ tool: 'submit_experience_candidate', required: true, reason: 'Submit one complete declarative Playbook for this exact draft revision.' }],
      }
    },
    async submitExperience(input) {
      const result = await (await getAuthoringRuntime()).invokeTrigger<{
        bundleId: string
        revision: number
        replayed: boolean
      }>({
        trigger: 'submit-experience-candidate',
        input: {
          draftId: input.draftId,
          expectedRevision: input.expectedRevision,
          idempotencyKey: input.idempotencyKey,
          candidateJson: JSON.stringify(input.candidate),
        },
        ctx: { user: null, staff: null, env: {} },
      })
      return result.ok
        ? {
            status: 'ok',
            data: { ...result.data, awaitingUserReview: true },
            nextActions: [],
          }
        : {
            status: 'error',
            diagnostics: [{
              code: result.diagnostic.code,
              path: result.diagnostic.path,
              message: result.diagnostic.message ?? 'Experience candidate was rejected',
            }],
          }
    },
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
