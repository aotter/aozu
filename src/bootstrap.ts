import { runtimeDiagnostic, type Entry } from '@aotter/mantle-spec'
import { bootMantleRuntime, InvokeFailure, type MantleRuntime } from '@aotter/mantle-runtime'

import { createIndexedDbBundleRepository } from './adapters/indexeddb/bundle-repository.ts'
import { createIndexedDbAssetRepository } from './adapters/indexeddb/asset-repository.ts'
import { createIndexedDbCharacterDraftRepository } from './adapters/indexeddb/character-draft-repository.ts'
import { ExperienceSubmissionConflict, persistTriggeredExperienceCandidate } from './adapters/indexeddb/experience-candidate-repository.ts'
import { createIndexedDbEntryRepository, createIndexedDbMantleStorageAdapter } from './adapters/indexeddb/mantle-storage.ts'
import { createIndexedDbActionRepository } from './adapters/indexeddb/action-repository.ts'
import { createIndexedDbPendingTurnRepository } from './adapters/indexeddb/pending-turn-repository.ts'
import { bindMantleWebMcpTools, createAgentCapability } from './adapters/webmcp/tools.ts'
import { loadStarterCatalog } from './adapters/browser/starter-packages.ts'
import { queueAgentTurn, resolveAgentTurn } from './core/application/agent-turn.ts'
import { AUTHORING_NAMESPACE, assembleExperienceCandidate, ExperienceCandidateValidationError } from './core/application/authoring.ts'
import { approveCandidate as approveStagedCandidate } from './core/application/candidate.ts'
import { loadCompanionStartup } from './core/application/companion.ts'
import { loadStage, submitAction as submitPreparedAction, submitInteraction } from './core/application/stage.ts'
import {
  CHARACTER_RIG,
  type CharacterAssetTarget,
  type CharacterDraft,
  type CharacterVariantGroup,
  type CharacterVariantLayer,
} from './core/domain/character.ts'
import {
  CHARACTER_CREATION_GROUPS,
  REQUIRED_CHARACTER_TARGETS,
  createCharacterDraftFromStarter,
  createCharacterDraft,
  buildCharacterDraftResources,
  isCharacterDraftPopulated,
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
import {
  createBlankExperienceDraftData,
  createExperienceDraftData,
  sameExperienceSeed,
  type ExperienceDraft,
  type StarterCharacterSelection,
  type StarterStorySelection,
} from './core/domain/starter.ts'
import { PLAYBOOK_LIMITS as EXPERIENCE_LIMITS } from './core/domain/playbook.ts'
import { compileAuthoringBackbone, compileFixedBackbone, FIXED_BACKBONE_VERSION } from './core/mantle/backbone.ts'

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
  const loadDraftStory = async (draft: ExperienceDraft) => {
    if (!draft.story) return null
    const { story } = draft
    const packaged = (await loadStarters()).find(({ starter }) =>
      starter.id === story.starter.id && starter.version === story.starter.version,
    )
    if (!packaged) throw new Error(`Story package is unavailable: ${story.starter.id}@${story.starter.version}`)
    const direction = packaged.starter.directions.find(({ id }) => id === story.direction.id)
    if (
      packaged.manifestSha256 !== story.starter.manifestSha256 ||
      packaged.starter.name !== story.starter.name ||
      !direction ||
      direction.name !== story.direction.name ||
      direction.summary !== story.direction.summary ||
      direction.sceneCompositionId !== story.sceneCompositionId ||
      direction.sceneCompositionId !== story.direction.sceneCompositionId ||
      !sameExperienceSeed(direction.seed, story.seed) ||
      !sameExperienceSeed(direction.seed, story.direction.seed)
    ) throw new Error('Story package changed without a version change')
    return packaged
  }
  const authoringPlan = compileAuthoringBackbone()
  const playPlan = compileFixedBackbone()
  let authoringRuntime: Promise<MantleRuntime> | undefined

  const authoringFailure = (code: string, path: string, message: string, value?: unknown, conflict = false) => new InvokeFailure(runtimeDiagnostic({
    code: conflict ? 'CONFLICT' : 'INPUT_VALIDATION_FAILED',
    severity: 'error',
    path: `authoring/${code}/${path}`,
    value,
    expected: 'a valid revision-safe Experience candidate',
    message,
  }))

  const getAuthoringRuntime = () => authoringRuntime ??= bootMantleRuntime({
    plan: authoringPlan,
    storage: createIndexedDbMantleStorageAdapter(AUTHORING_NAMESPACE),
    handlers: {
      'companion.inspect-experience-contract': inspectExperienceContract,
      'companion.submit-experience-candidate': submitExperienceCandidate,
      'companion.inspect-character-contract': inspectCharacterContract,
      'companion.submit-character-asset-candidate': submitCharacterAssetCandidate,
    },
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
    return { bundleId: bundle.record.id, contractVersion: bundle.record.identity.contractVersion, ...bundle.record.metadata }
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
        ...(startup.stage.scene?.compositionId ? {
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
    async startCreation(characterChoice: StarterCharacterSelection, storyChoice: StarterStorySelection, replaceCharacterDraft = false) {
      const packages = await loadStarters()
      const findPackage = (choice: Exclude<StarterCharacterSelection | StarterStorySelection, null>) => {
        const loaded = packages.find(({ starter }) => starter.id === choice.starterId && starter.version === choice.starterVersion)
        if (!loaded) throw new Error(`Starter not found: ${choice.starterId}@${choice.starterVersion}`)
        return loaded
      }
      const currentCharacter = await characterDrafts.get()
      if (currentCharacter && isCharacterDraftPopulated(migrateCharacterDraft(currentCharacter)) && !replaceCharacterDraft) return null
      const character = characterChoice
        ? createCharacterDraftFromStarter(findPackage(characterChoice), characterChoice.stateId)
        : createCharacterDraft()
      const experience = storyChoice
        ? createExperienceDraftData(findPackage(storyChoice), storyChoice.directionId)
        : createBlankExperienceDraftData()
      const result = await (await getAuthoringRuntime()).invokeTrigger<Entry>({
        trigger: 'select-experience-draft',
        input: experience,
        ctx: { user: null, staff: null, env: {} },
      })
      if (!result.ok) throw new Error(result.diagnostic.message ?? 'Experience Draft could not be saved')
      await characterDrafts.put(character)
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
      const { bundleId, runId, contractVersion } = await active()
      return submitInteraction(createIndexedDbEntryRepository(bundleId), createIndexedDbActionRepository(), {
        bundleId, runId, contractVersion, actionId, expectedRevision, idempotencyKey,
      })
    },
    async submitText(text: string, expectedRevision: number, idempotencyKey: string = crypto.randomUUID()) {
      const { bundleId, runId, contractVersion } = await active()
      const entries = createIndexedDbEntryRepository(bundleId)
      const local = await submitInteraction(entries, createIndexedDbActionRepository(), {
        bundleId, runId, contractVersion, text, expectedRevision, idempotencyKey,
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
  async function inspectExperienceContract() {
      const draft = await openExperienceDraft()
      if (!draft) throw new Error('Choose a character and story starting point before asking the agent to author an experience')
      const story = await loadDraftStory(draft)
      const characterDraft = await openCharacterDraft()
      const character = buildCharacterDraftResources(characterDraft)
      return {
        status: 'ok',
        data: {
          contractVersion: 2,
          draft: { id: draft.id, revision: draft.revision, characterUpdatedAt: characterDraft.updatedAt },
          story: draft.story,
          seed: draft.story?.seed ?? null,
          selectedVisuals: {
            characterStateId: character.state.id,
            ...(draft.story ? { sceneCompositionId: draft.story.sceneCompositionId } : {}),
          },
          resources: {
            characterAppearances: character.pack.appearances.map(({ id }) => ({
              packId: character.pack.id,
              packVersion: character.pack.version,
              appearanceId: id,
            })),
            characterStates: [character.state],
            sceneCompositions: story?.starter.scenePack.compositions.map(({ id }) => ({
              packId: story.starter.scenePack.id,
              packVersion: story.starter.scenePack.version,
              compositionId: id,
            })) ?? [],
          },
          skeleton: story?.starter.skeleton ?? { requiredStageIds: [], requiredMetricIds: [], instructions: [] },
          vocabulary: {
            conditions: ['metric', 'flag', 'stage', 'capability', 'inventory', 'equipped', 'appearance', 'quantity', 'itemState', 'all', 'any', 'not'],
            effects: ['addMetric', 'setFlag', 'changeStage', 'grantItem', 'consumeItem', 'equipItem', 'unequipItem', 'setItemState', 'setAppearanceOverride'],
          },
          limits: EXPERIENCE_LIMITS,
        },
        nextActions: [{ tool: 'submit_experience_candidate', required: true, reason: 'Submit one complete declarative Playbook for this exact draft revision.' }],
      }
  }

  async function submitExperienceCandidate(rawInput: unknown) {
    const input = rawInput as { draftId: string; expectedRevision: number; expectedCharacterUpdatedAt: number; idempotencyKey: string; candidate: unknown }
    try {
      const entry = await createIndexedDbEntryRepository(AUTHORING_NAMESPACE).readById(input.draftId)
      if (!entry || entry.collection !== 'experience-drafts' || entry.status !== 'published') {
        throw new ExperienceSubmissionConflict('draft_not_found')
      }
      const draft = toExperienceDraft(entry)
      if (draft.lastSubmission?.idempotencyKey === input.idempotencyKey) {
        return {
          status: 'ok',
          data: { bundleId: draft.lastSubmission.bundleId, revision: draft.revision, replayed: true, awaitingUserReview: true },
          nextActions: [],
        }
      }
      const storedCharacter = await characterDrafts.get()
      if (!storedCharacter || storedCharacter.updatedAt !== input.expectedCharacterUpdatedAt) throw new ExperienceSubmissionConflict('character_draft_changed')
      const candidate = assembleExperienceCandidate(
        `bundle:${crypto.randomUUID()}`,
        draft,
        await loadDraftStory(draft),
        migrateCharacterDraft(storedCharacter),
        input.candidate,
      )
      const result = await persistTriggeredExperienceCandidate(
        input.draftId,
        input.expectedRevision,
        input.idempotencyKey,
        candidate,
      )
      if (!result.replayed) browser?.dispatchEvent(new browser.CustomEvent('experience-candidate-staged', { detail: candidate.preview }))
      return { status: 'ok', data: { ...result, awaitingUserReview: true }, nextActions: [] }
    } catch (error) {
      if (error instanceof ExperienceCandidateValidationError) {
        const diagnostic = error.diagnostics[0]!
        throw authoringFailure(diagnostic.code, diagnostic.path, diagnostic.message)
      }
      if (error instanceof ExperienceSubmissionConflict) {
        throw authoringFailure(error.code, 'experience-draft', error.message, error.currentRevision, true)
      }
      throw authoringFailure('invalid_authoring_state', 'experience-draft', error instanceof Error ? error.message : 'Authoring state is invalid')
    }
  }

  async function inspectCharacterContract() {
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
  }

  async function submitCharacterAssetCandidate(rawInput: unknown) {
      const input = rawInput as {
        group: CharacterVariantGroup
        variantId: string
        label: string
        layer: CharacterVariantLayer
        filename: string
        dataUrl: string
      }
      const target: CharacterAssetTarget = {
        group: input.group,
        variantId: input.variantId,
        label: input.label,
        layer: input.layer,
      }
      const { filename, dataUrl } = input
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
  }

  async function inspectCompanion(bundleId: string, runId: string, name: string) {
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
  }

  async function submitCompanionAction(bundleId: string, runId: string, contractVersion: 1 | 2, rawInput: unknown) {
      const input = rawInput as { actionId: string; expectedRevision: number; idempotencyKey: string }
      const result = await submitPreparedAction(createIndexedDbEntryRepository(bundleId), createIndexedDbActionRepository(), {
        bundleId, runId, contractVersion, ...input,
      })
      document.defaultView?.dispatchEvent(new Event('companion-updated'))
      return result
  }

  async function resolveCompanionTurn(bundleId: string, contractVersion: 1 | 2, rawInput: unknown) {
      const input = rawInput as { turnId: string; idempotencyKey: string; dialogue: string; effects: unknown }
      const stage = await resolveAgentTurn(createIndexedDbEntryRepository(bundleId), createIndexedDbActionRepository(), {
        bundleId, contractVersion, ...input,
      })
      document.defaultView?.dispatchEvent(new Event('companion-updated'))
      return { status: 'ok', data: { stage }, nextActions: [{ tool: 'inspect_companion', required: true }] }
  }

  let playRuntime: { key: string; value: Promise<MantleRuntime> } | undefined
  const invokeContext = { user: null, staff: null, env: {} }
  const incompatiblePlayResult = (actual: string | null) => ({
    ok: false as const,
    diagnostic: runtimeDiagnostic({
      code: 'INPUT_VALIDATION_FAILED',
      severity: 'error',
      path: 'webmcp/play/backboneVersion',
      value: actual,
      expected: FIXED_BACKBONE_VERSION,
      message: actual === null
        ? 'No active Companion is available for play tools'
        : `Active Companion backbone ${actual} is incompatible with WebMCP play tools; expected ${FIXED_BACKBONE_VERSION}`,
    }),
  })
  const invokePlayTrigger = async (trigger: string, input: unknown) => {
    const bundle = await bundles.getActive()
    if (!bundle?.record.metadata) return incompatiblePlayResult(null)
    if (bundle.record.identity.backboneVersion !== FIXED_BACKBONE_VERSION) {
      return incompatiblePlayResult(bundle.record.identity.backboneVersion)
    }
    const key = `${bundle.record.id}\0${bundle.record.semanticFingerprint}`
    if (playRuntime?.key !== key) {
      const { id: bundleId, identity, metadata } = bundle.record
      playRuntime = {
        key,
        value: bootMantleRuntime({
          plan: bundle.plan,
          storage: createIndexedDbMantleStorageAdapter(bundleId),
          handlers: {
            'companion.inspect-companion': () => inspectCompanion(bundleId, metadata.runId, metadata.name),
            'companion.submit-companion-action': (value) => submitCompanionAction(bundleId, metadata.runId, identity.contractVersion, value),
            'companion.resolve-companion-turn': (value) => resolveCompanionTurn(bundleId, identity.contractVersion, value),
          },
        }),
      }
    }
    return (await playRuntime.value).invokeTrigger({ trigger, input, ctx: invokeContext })
  }

  void Promise.all([
    bindMantleWebMcpTools(document, authoringPlan, async (trigger, input) =>
      (await getAuthoringRuntime()).invokeTrigger({ trigger, input, ctx: invokeContext })),
    bindMantleWebMcpTools(document, playPlan, invokePlayTrigger),
  ]).catch((error) => console.error('WebMCP registration failed', error))
  return application
}

export type Application = ReturnType<typeof createApplication>
