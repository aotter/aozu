import { runtimeDiagnostic, type Entry } from '@aotter/mantle-spec'
import { bootMantleRuntime, InvokeFailure, type MantleRuntime } from '@aotter/mantle-runtime'

import { createIndexedDbBundleRepository } from './adapters/indexeddb/bundle-repository.ts'
import { createIndexedDbAssetRepository } from './adapters/indexeddb/asset-repository.ts'
import { createIndexedDbCharacterDraftRepository } from './adapters/indexeddb/character-draft-repository.ts'
import { createIndexedDbCharacterPackLibraryRepository } from './adapters/indexeddb/character-pack-library-repository.ts'
import { ExperienceSubmissionConflict, persistTriggeredExperienceCandidate } from './adapters/indexeddb/experience-candidate-repository.ts'
import { createIndexedDbEntryRepository, createIndexedDbMantleStorageAdapter } from './adapters/indexeddb/mantle-storage.ts'
import { createIndexedDbActionRepository } from './adapters/indexeddb/action-repository.ts'
import { createIndexedDbPendingTurnRepository } from './adapters/indexeddb/pending-turn-repository.ts'
import { bindMantleWebMcpTools, createAgentCapability } from './adapters/webmcp/tools.ts'
import { loadStarterCatalog } from './adapters/browser/starter-packages.ts'
import { queueAgentTurn, resolveAgentTurn } from './core/application/agent-turn.ts'
import { AUTHORING_NAMESPACE, assembleExperienceCandidate, createLocalExperienceCandidateInput, ExperienceCandidateValidationError, selectExperienceCharacter } from './core/application/authoring.ts'
import { approveCandidate as approveStagedCandidate, loadPendingCandidatePreview } from './core/application/candidate.ts'
import { loadCompanionStartup } from './core/application/companion.ts'
import { loadStage, submitAction as submitPreparedAction, submitInteraction } from './core/application/stage.ts'
import {
  CHARACTER_RIG,
  type CharacterAssetTarget,
  type CharacterDraft,
  type CharacterVariantGroup,
  type CharacterVariantLayer,
  type CharacterVariantTransform,
} from './core/domain/character.ts'
import {
  CHARACTER_CREATION_GROUPS,
  REQUIRED_CHARACTER_TARGETS,
  createCharacterDraftFromStarter,
  createCharacterDraft,
  buildCharacterDraftResources,
  installCharacterDraft,
  listInstalledCharacterPacks,
  loadInstalledCharacterPackResources,
  loadCharacterProjection,
  migrateCharacterDraft,
  hasCurrentCharacterLayer,
  isCharacterDraftAssetCurrent,
  characterAssetPlacement,
  characterHeadRegistration,
  characterRegistrationFrame,
  resolveCharacterDraftAtlasSources,
  resolveCharacterDraftReferenceLayers,
  setCharacterVariantTransform,
  transformCharacterBounds,
  validateCharacterAssetInspection,
  saveCharacterDraftAsset,
  reviewCharacterDraft,
} from './core/application/character-creation.ts'
import { highConfidenceCharacterAutoFit, measureCharacterMaskAlignment, suggestCharacterVisualRegistration } from './core/application/character-alignment.ts'
import { inspectCharacterImage, readCharacterAlphaMask, readCharacterVisualSample, renderCharacterCompositeDataUrl } from './adapters/browser/character-image.ts'
import { compileCharacterTextureAtlas } from './adapters/browser/character-atlas.ts'
import { inspectSceneImage } from './adapters/browser/scene-image.ts'
import { requestPersistentStorage } from './adapters/browser/storage-persistence.ts'
import { planItemEffects } from './core/application/items.ts'
import { loadSceneProjection, resolveStarterSceneLayers } from './core/application/scene.ts'
import { exportPortableBundle, stagePortableBundle } from './adapters/zip/bundle.ts'
import { exportCharacterDraftZip } from './adapters/zip/character-draft.ts'
import {
  createBlankExperienceDraftData,
  createExperienceDraftData,
  sameExperienceSeed,
  type ExperienceDraft,
  type StarterCharacterSelection,
  type StarterStorySelection,
} from './core/domain/starter.ts'
import { PLAYBOOK_LIMITS as EXPERIENCE_LIMITS } from './core/domain/playbook.ts'
import { activeDraftId, workspaceNavigation, workspacePath, workspacePhase, type WorkspaceDestination } from './core/application/workspace.ts'
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
  character: (entry.data.character as ExperienceDraft['character']) ?? null,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
})

export function createApplication(document: Document) {
  const agent = createAgentCapability(document)
  const bundles = createIndexedDbBundleRepository()
  const characterDrafts = createIndexedDbCharacterDraftRepository()
  const characterPacks = createIndexedDbCharacterPackLibraryRepository()
  const browser = document.defaultView
  let runtimeAtlas: { key: string; value: ReturnType<typeof compileCharacterTextureAtlas> } | undefined
  const compileRuntimeAtlas = (bundleId: string, layers: NonNullable<Awaited<ReturnType<typeof loadCharacterProjection>>>) => {
    const key = `${bundleId}:${layers.map(({ id, transform }) => `${id}:${transform.x}:${transform.y}:${transform.scale}`).join('|')}`
    if (runtimeAtlas?.key !== key) runtimeAtlas = { key, value: compileCharacterTextureAtlas(layers) }
    return runtimeAtlas.value
  }
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
      'companion.inspect-workspace': inspectWorkspace,
      'companion.navigate-companion': navigateCompanion,
      'companion.create-local-companion': createLocalCompanion,
      'companion.inspect-experience-contract': inspectExperienceContract,
      'companion.submit-experience-candidate': submitExperienceCandidate,
      'companion.inspect-character-contract': inspectCharacterContract,
      'companion.submit-character-asset-candidate': submitCharacterAssetCandidate,
      'companion.set-character-variant-transform': setCharacterTransform,
    },
  })

  const listExperienceDrafts = async () => {
    const entries = await (await getAuthoringRuntime()).entries.readPublished({ collection: 'experience-drafts' })
    return entries.map(toExperienceDraft).sort((left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id))
  }

  const openExperienceDraft = async (draftId: string) => {
    const entry = await (await getAuthoringRuntime()).entries.readById(draftId)
    return entry?.collection === 'experience-drafts' && entry.status === 'published' ? toExperienceDraft(entry) : null
  }

  const migrateLegacyCharacterDraft = async (experiences: ExperienceDraft[]) => {
    const legacy = await characterDrafts.get('current')
    if (!legacy || experiences.some(({ id }) => id === 'current')) return
    const existingIds = new Set((await characterDrafts.list()).map(({ id }) => id))
    const target = experiences.find(({ id }) => !existingIds.has(id))
    if (!target) return
    await characterDrafts.put({ ...migrateCharacterDraft(legacy), id: target.id })
    await characterDrafts.delete('current')
  }

  const listAuthoringDrafts = async () => {
    const experiences = await listExperienceDrafts()
    await migrateLegacyCharacterDraft(experiences)
    const characters = (await characterDrafts.list()).map(migrateCharacterDraft)
    const ids = new Set([...experiences.map(({ id }) => id), ...characters.map(({ id }) => id)])
    return [...ids].map((id) => ({
      id,
      experience: experiences.find((draft) => draft.id === id) ?? null,
      character: characters.find((draft) => draft.id === id) ?? null,
    })).sort((left, right) => Math.max(right.character?.updatedAt ?? 0, right.experience?.updatedAt ?? 0) - Math.max(left.character?.updatedAt ?? 0, left.experience?.updatedAt ?? 0))
  }

  const openCharacterDraft = async (draftId: string) => {
    const existing = await characterDrafts.get(draftId)
    if (!existing) throw new Error('Character Draft not found')
    let draft = migrateCharacterDraft(existing)
    let refreshed = false
    const variants = await Promise.all(draft.variants.map(async (variant) => ({
      ...variant,
      layers: Object.fromEntries(await Promise.all(Object.entries(variant.layers).map(async ([layer, asset]) => {
        if (!asset || asset.inspection.visibleBounds) return [layer, asset]
        refreshed = true
        return [layer, { ...asset, inspection: await inspectCharacterImage(asset.blob) }]
      }))),
    })))
    if (refreshed) draft = { ...draft, variants }
    if (draft !== existing) await characterDrafts.put(draft)
    return draft
  }

  const deleteAuthoringDraft = async (draftId: string) => {
    const pending = await bundles.getPendingReview()
    if (pending?.draftId === draftId) await bundles.discardPendingReview(pending.bundle.record.id)
    const entry = await createIndexedDbEntryRepository(AUTHORING_NAMESPACE).readById(draftId)
    if (entry?.collection === 'experience-drafts') await createIndexedDbEntryRepository(AUTHORING_NAMESPACE).delete({
      id: draftId,
      collection: 'experience-drafts',
      expectedVersion: entry.version,
      expectedStatus: entry.status,
    })
    await characterDrafts.delete(draftId)
  }

  const selectCharacterPack = async (draftId: string, expectedRevision: number, packId: string, packVersion: number) => {
    const installed = await loadInstalledCharacterPackResources(characterPacks, inspectCharacterImage, { packId, packVersion })
    const updated = await selectExperienceCharacter(createIndexedDbEntryRepository(AUTHORING_NAMESPACE), {
      draftId,
      expectedRevision,
      packId: installed.pack.id,
      packVersion: installed.pack.version,
      composition: installed.state.composition,
    })
    return toExperienceDraft(updated)
  }

  const resolveLocalCreation = async (draftId: string) => {
    const draft = await openExperienceDraft(draftId)
    if (!draft?.character) throw new Error('Select and approve a Character before creating a Companion')
    const [story, character] = await Promise.all([
      loadDraftStory(draft),
      loadInstalledCharacterPackResources(characterPacks, inspectCharacterImage, draft.character),
    ])
    return {
      draft,
      story,
      character,
      candidate: createLocalExperienceCandidateInput(draft, story, { name: character.name, stateId: character.state.id }),
    }
  }

  const active = async () => {
    const bundle = await bundles.getActive()
    if (!bundle?.record.metadata) throw new Error('No active Companion')
    return { bundleId: bundle.record.id, contractVersion: bundle.record.identity.contractVersion, ...bundle.record.metadata }
  }
  const application = {
    async loadStartup() {
      const [startup, pendingReview, drafts] = await Promise.all([
        loadCompanionStartup(agent, bundles, createIndexedDbEntryRepository),
        loadPendingCandidatePreview(
          bundles,
          createIndexedDbEntryRepository,
          createIndexedDbAssetRepository,
          inspectCharacterImage,
          inspectSceneImage,
        ),
        listAuthoringDrafts(),
      ])
      const authoringDrafts = drafts.map(({ id, character, experience }) => ({
        id,
        name: character && (character.nameConfirmed ?? character.name !== 'My Companion') ? character.name : experience?.story?.direction.name ?? 'Untitled Companion',
        status: character?.approvedAt && experience?.character ? 'experience' as const : 'character' as const,
        destination: workspacePath(character?.approvedAt && experience?.character ? 'create' : 'character-expressions', id),
      }))
      if (startup.savedCompanions.length) void requestPersistentStorage(document.defaultView?.navigator.storage)
      if (startup.status !== 'main') return { ...startup, pendingReview, authoringDrafts }
      const entries = createIndexedDbEntryRepository(startup.bundleId)
      const character = await loadCharacterProjection(
        entries,
        createIndexedDbAssetRepository,
        startup.bundleId,
        inspectCharacterImage,
        startup.stage.scene?.characterStateId,
      )
      return {
        ...startup,
        pendingReview,
        authoringDrafts,
        character,
        characterAtlas: character ? await compileRuntimeAtlas(startup.bundleId, character) : undefined,
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
    async startCreation(characterChoice: StarterCharacterSelection, storyChoice: StarterStorySelection) {
      const packages = await loadStarters()
      const findPackage = (choice: Exclude<StarterCharacterSelection | StarterStorySelection, null>) => {
        const loaded = packages.find(({ starter }) => starter.id === choice.starterId && starter.version === choice.starterVersion)
        if (!loaded) throw new Error(`Starter not found: ${choice.starterId}@${choice.starterVersion}`)
        return loaded
      }
      const experience = storyChoice
        ? createExperienceDraftData(findPackage(storyChoice), storyChoice.directionId)
        : createBlankExperienceDraftData()
      const result = await (await getAuthoringRuntime()).invokeTrigger<Entry>({
        trigger: 'select-experience-draft',
        input: experience,
        ctx: { user: null, staff: null, env: {} },
      })
      if (!result.ok) throw new Error(result.diagnostic.message ?? 'Experience Draft could not be saved')
      const savedExperience = toExperienceDraft(result.data)
      const character = characterChoice
        ? createCharacterDraftFromStarter(findPackage(characterChoice), characterChoice.stateId, savedExperience.id)
        : createCharacterDraft(undefined, savedExperience.id)
      await characterDrafts.put(character)
      await requestPersistentStorage(browser?.navigator.storage)
      return savedExperience
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
    async setCharacterVariantTransform(draft: CharacterDraft, group: CharacterVariantGroup, variantId: string, transform: CharacterVariantTransform) {
      return setCharacterVariantTransform(characterDrafts, draft.id, group, variantId, draft.updatedAt, transform)
    },
    async autoFitCharacterVariant(draft: CharacterDraft, group: CharacterVariantGroup, variantId: string) {
      const variant = draft.variants.find((candidate) => candidate.group === group && candidate.id === variantId)
      const layer = variant && CHARACTER_CREATION_GROUPS.find((candidate) => candidate.group === group)?.layers.find((candidate) => variant.layers[candidate])
      if (!variant || !layer) throw new Error('Character variant is empty or missing')
      const target = await characterTarget(draft, { group, variantId, layer })
      const visualTransform = target?.alignment.visualFit?.suggestedTransform
      if (visualTransform) return setCharacterVariantTransform(characterDrafts, draft.id, group, variantId, draft.updatedAt, visualTransform)
      if (target?.alignment.registration?.role === 'head-anchor' && target.alignment.visualFit) return draft
      if (target?.alignment.measurement?.status === 'aligned') return draft
      const transform = highConfidenceCharacterAutoFit(target?.alignment.measurement)
      if (!transform) throw new Error('No high-confidence auto-fit is available; use the visual alignment controls.')
      return setCharacterVariantTransform(characterDrafts, draft.id, group, variantId, draft.updatedAt, transform)
    },
    prepareCharacter: (draft: CharacterDraft) => reviewCharacterDraft(inspectCharacterImage, draft),
    compileCharacterAtlas: (draft: CharacterDraft) => compileCharacterTextureAtlas(resolveCharacterDraftAtlasSources(draft)),
    listCharacterPacks: () => listInstalledCharacterPacks(characterPacks, inspectCharacterImage),
    async inspectCreation(draftId: string) {
      const { draft, story, character, candidate } = await resolveLocalCreation(draftId)
      const characterDraft = await openCharacterDraft(draftId)
      return {
        character: character.name,
        characterLayers: character.layers,
        sceneLayers: draft.story && story ? resolveStarterSceneLayers(story, draft.story.direction.id) : [],
        profile: characterDraft.profile ?? { age: '', personality: '', backstory: '', setting: '' },
        story: draft.story?.direction.name,
        stages: candidate.stages.length,
        actions: candidate.stages.reduce((count, stage) => count + stage.actions.length, 0),
        metrics: Object.keys(candidate.metrics).length,
        rules: candidate.rules.length,
      }
    },
    async updateCreationProfile(draftId: string, profile: NonNullable<CharacterDraft['profile']>) {
      const draft = await openCharacterDraft(draftId)
      const next = { ...draft, profile: structuredClone(profile), updatedAt: Math.max(Date.now(), draft.updatedAt + 1) }
      await characterDrafts.put(next)
      return next.profile
    },
    selectCharacterPack,
    async approveCharacterDraft(draftId: string, selectForAuthoring = false) {
      let draft = await characterDrafts.get(draftId)
      if (!draft) throw new Error('Character draft not found')
      const pack = buildCharacterDraftResources(draft).pack
      const existing = (await characterPacks.list()).find(({ pack: saved }) => saved.id === pack.id && saved.version === pack.version)
      if (existing && (existing.name !== draft.name.trim() || JSON.stringify(existing.pack) !== JSON.stringify(pack))) {
        draft = { ...draft, packId: `character-${crypto.randomUUID()}` }
        await characterDrafts.put(draft)
      }
      let installed: { id: string; version: number }
      if (existing && existing.pack.id === draft.packId) {
        await loadInstalledCharacterPackResources(characterPacks, inspectCharacterImage, { packId: existing.pack.id, packVersion: existing.pack.version })
        installed = { id: existing.pack.id, version: existing.pack.version }
      } else installed = await installCharacterDraft(characterPacks, inspectCharacterImage, draft)
      if (selectForAuthoring) {
        const experience = await openExperienceDraft(draftId)
        if (!experience) throw new Error('Experience Draft not found')
        await selectCharacterPack(experience.id, experience.revision, installed.id, installed.version)
      }
      const approved = { ...draft, approvedAt: Date.now(), updatedAt: Date.now() }
      await characterDrafts.put(approved)
      return approved
    },
    async approveCandidate(bundleId: string, approved: true) {
      return approveStagedCandidate(bundles, bundleId, approved)
    },
    async discardPendingReview(bundleId: string) {
      await bundles.discardPendingReview(bundleId)
    },
    async activateCompanion(bundleId: string) {
      return bundles.activate(bundleId, true)
    },
    async createCompanion(draftId: string) {
      const result = await (await getAuthoringRuntime()).invokeTrigger({
        trigger: 'create-local-companion', input: { draftId }, ctx: { user: null, staff: null, env: {} },
      })
      if (!result.ok) throw new Error(result.diagnostic.message ?? 'Companion could not be created')
      await deleteAuthoringDraft(draftId)
    },
    async deleteCompanion(bundleId: string) {
      await bundles.deleteSaved(bundleId)
    },
    deleteAuthoringDraft,
    async exportCharacterDraft(draftId: string) {
      const draft = await characterDrafts.get(draftId)
      if (!draft) throw new Error('Character draft not found')
      const current = migrateCharacterDraft(draft)
      return exportCharacterDraftZip(
        current,
        await openExperienceDraft(draftId),
        await compileCharacterTextureAtlas(resolveCharacterDraftAtlasSources(current)),
      )
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
  async function createLocalCompanion(rawInput: unknown) {
    const { draftId } = rawInput as { draftId: string }
    const { draft, candidate } = await resolveLocalCreation(draftId)
    const submission = await persistExperienceCandidate({
      draftId: draft.id,
      expectedRevision: draft.revision,
      expectedCharacterUpdatedAt: 0,
      idempotencyKey: crypto.randomUUID(),
      candidate,
    }, false)
    await bundles.activate(submission.data.bundleId, true)
    return { ...submission, data: { ...submission.data, awaitingUserReview: false } }
  }
  async function inspectExperienceContract(rawInput: unknown) {
      const { draftId } = rawInput as { draftId: string }
      const draft = await openExperienceDraft(draftId)
      if (!draft) throw new Error('Choose a character and story starting point before asking the agent to author an experience')
      const story = await loadDraftStory(draft)
      const storedCharacterDraft = await openCharacterDraft(draftId)
      const characterDraft = draft.character ? null : storedCharacterDraft
      const character = draft.character
        ? await loadInstalledCharacterPackResources(characterPacks, inspectCharacterImage, draft.character)
        : buildCharacterDraftResources(characterDraft!)
      return {
        status: 'ok',
        data: {
          contractVersion: 2,
          draft: { id: draft.id, revision: draft.revision, characterUpdatedAt: characterDraft?.updatedAt ?? 0 },
          story: draft.story,
          characterProfile: storedCharacterDraft.profile ?? null,
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
            characterPack: character.pack,
            characterAssets: await Promise.all(character.assets.map(async ({ id, blob }) => ({
              id,
              dataUrl: await readDataUrl(blob),
            }))),
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

  const submitExperienceCandidate = (rawInput: unknown) => persistExperienceCandidate(rawInput, true)

  async function persistExperienceCandidate(rawInput: unknown, notify: boolean) {
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
      const storedCharacter = draft.character ? null : await characterDrafts.get(input.draftId)
      if (!draft.character && (!storedCharacter || storedCharacter.updatedAt !== input.expectedCharacterUpdatedAt)) throw new ExperienceSubmissionConflict('character_draft_changed')
      const character = draft.character
        ? await loadInstalledCharacterPackResources(characterPacks, inspectCharacterImage, draft.character)
        : buildCharacterDraftResources(migrateCharacterDraft(storedCharacter!))
      const candidate = assembleExperienceCandidate(
        `bundle:${crypto.randomUUID()}`,
        draft,
        await loadDraftStory(draft),
        character,
        input.candidate,
      )
      const result = await persistTriggeredExperienceCandidate(
        input.draftId,
        input.expectedRevision,
        input.idempotencyKey,
        candidate,
      )
      if (notify && !result.replayed) browser?.dispatchEvent(new browser.CustomEvent('experience-candidate-staged', { detail: candidate.preview }))
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

  const characterNextActions = (draft: CharacterDraft) => {
    const missing = REQUIRED_CHARACTER_TARGETS.filter((target) => !hasCurrentCharacterLayer(draft, target.group, target.variantId, target.layer))
    return missing.length ? missing.map((target) => ({
      tool: 'submit_character_asset_candidate',
      required: true,
      reason: `Fill ${target.group}/${target.variantId}/${target.layer} for the current canonical body.`,
      input: { draftId: draft.id, ...target, expectedUpdatedAt: draft.updatedAt },
    })) : [{
      tool: 'navigate_companion',
      required: true,
      reason: 'Ask the user to review and approve the complete Character Draft.',
      input: { destination: 'character-review', draftId: draft.id },
    }]
  }

  async function inspectWorkspace() {
    const route = browser?.location.pathname ?? '/'
    const routeDraftId = activeDraftId(route)
    const [startup, drafts] = await Promise.all([
      application.loadStartup(),
      listAuthoringDrafts(),
    ])
    const activeDraft = drafts.find(({ id }) => id === routeDraftId) ?? null
    const experience = activeDraft?.experience ?? null
    const character = activeDraft?.character ?? null
    const missingCharacterTargets = character ? REQUIRED_CHARACTER_TARGETS
      .filter((target) => !hasCurrentCharacterLayer(character, target.group, target.variantId, target.layer)) : REQUIRED_CHARACTER_TARGETS
    const characterReady = Boolean(character && !missingCharacterTargets.length)
    const pendingReview = startup.pendingReview
    const activePendingReview = pendingReview?.source === 'import'
      ? (routeDraftId ? null : pendingReview)
      : pendingReview?.draftId === routeDraftId ? pendingReview : null
    const phase = workspacePhase(route)
    const navigation = workspaceNavigation({
      characterReady,
      experienceReady: Boolean(experience?.character),
      pendingReview: Boolean(activePendingReview),
      activeCompanion: startup.status === 'main',
    }).map(({ id }) => ({ id, path: workspacePath(id, routeDraftId) }))
    const nextActions = activePendingReview ? [{
      tool: 'navigate_companion', required: true, reason: 'A candidate is waiting for explicit user review.', input: { destination: 'experience-review', ...(routeDraftId ? { draftId: routeDraftId } : {}) },
    }] : phase === 'character' && character ? characterNextActions(character) : startup.status === 'main' ? [{
      tool: 'inspect_companion', required: true, reason: 'Inspect the active Companion before interaction.',
    }] : routeDraftId && missingCharacterTargets.length ? [{
      tool: 'inspect_character_contract', required: true, reason: 'Inspect the current Character target and canonical reference before generating art.', input: { draftId: character?.id, ...missingCharacterTargets[0] },
    }] : experience?.character ? [{
      tool: 'navigate_companion', required: true, reason: 'Review the resolved Character and Playbook, then create the Companion.', input: { destination: 'create', draftId: experience.id },
    }] : [{
      tool: 'navigate_companion', required: true, reason: 'Choose a Character and Story starting point.', input: { destination: 'starter' },
    }]
    return {
      status: 'ok',
      data: {
        route,
        phase,
        activeDraftId: routeDraftId,
        drafts: drafts.map(({ id, character: draftCharacter, experience: draftExperience }) => ({
          id,
          name: draftCharacter?.name ?? draftExperience?.story?.direction.name ?? 'Untitled Companion',
          updatedAt: Math.max(draftCharacter?.updatedAt ?? 0, draftExperience?.updatedAt ?? 0),
          characterReady: Boolean(draftCharacter?.approvedAt),
          experienceReady: Boolean(draftExperience?.character),
        })),
        characterDraft: character ? {
          id: character.id,
          name: character.name,
          updatedAt: character.updatedAt,
          approved: Boolean(character.approvedAt),
          selected: character.selected,
          missingTargets: missingCharacterTargets,
        } : null,
        experienceDraft: experience ? {
          id: experience.id,
          revision: experience.revision,
          characterSelected: Boolean(experience.character),
          story: experience.story?.direction.name ?? null,
        } : null,
        pendingReview: activePendingReview ? { source: activePendingReview.source, name: activePendingReview.name } : null,
        activeCompanion: startup.status === 'main' ? { id: startup.bundleId, name: startup.companion.name, stageId: startup.stage.stageId } : null,
        savedCompanions: startup.savedCompanions,
        navigation,
      },
      nextActions,
    }
  }

  async function navigateCompanion(rawInput: unknown) {
    const { destination, draftId } = rawInput as { destination: WorkspaceDestination; draftId?: string }
    const workspace = await inspectWorkspace()
    const targetDraftId = draftId ?? workspace.data.activeDraftId
    const target = targetDraftId ? (await listAuthoringDrafts()).find(({ id }) => id === targetDraftId) : null
    const draftDestination = destination.startsWith('character-') || destination === 'create' || destination === 'experience-review'
    if (draftDestination && !target) throw new Error('Draft ID is required for this destination')
    const pending = await bundles.getPendingReview()
    const allowed = workspaceNavigation({
      characterReady: Boolean(target?.character && !REQUIRED_CHARACTER_TARGETS.some((required) =>
        !hasCurrentCharacterLayer(target.character!, required.group, required.variantId, required.layer),
      )),
      experienceReady: Boolean(target?.experience?.character),
      pendingReview: Boolean(pending && (pending.source === 'import' ? !targetDraftId : pending.draftId === targetDraftId)),
      activeCompanion: Boolean(workspace.data.activeCompanion),
    })
    if (!allowed.some(({ id }) => id === destination)) throw new Error(`Destination is unavailable: ${destination}`)
    const path = workspacePath(destination, targetDraftId)
    browser?.setTimeout(() => browser.dispatchEvent(new browser.CustomEvent('companion-navigate', { detail: { destination, draftId: targetDraftId } })), 0)
    return { status: 'ok', data: { destination, path }, nextActions: [] }
  }

  const characterTarget = async (draft: CharacterDraft, rawInput: unknown) => {
    const input = rawInput as Partial<{ group: CharacterVariantGroup; variantId: string; layer: CharacterVariantLayer }>
    if (!input.group && !input.variantId && !input.layer) return null
    if (!input.group || !input.variantId || !input.layer) throw new Error('Character target requires group, variantId, and layer')
    const group = CHARACTER_CREATION_GROUPS.find(({ group }) => group === input.group)
    if (!group || !group.layers.includes(input.layer) || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(input.variantId)) throw new Error('Unknown character asset target')
    if (input.group === 'body' && input.variantId !== 'base') throw new Error('The body group only supports body/base/body')
    const variant = draft.variants.find(({ group, id }) => group === input.group && id === input.variantId)
    const asset = variant?.layers[input.layer]
    const canonical = draft.variants.find(({ group, id }) => group === 'body' && id === 'base')?.layers.body
    const headRegistration = characterHeadRegistration(draft)
    const expressionReference = headRegistration?.asset
    const alignmentReference = input.group === 'expression' && headRegistration?.variant.id !== input.variantId ? expressionReference
      : input.group === 'outfit' ? canonical : undefined
    const referenceTransform = input.group === 'expression' ? headRegistration?.transform : undefined
    const editSource = input.group === 'expression' ? expressionReference ?? canonical
      : input.group === 'outfit' ? canonical : undefined
    const transform = variant?.transform ?? { x: 0, y: 0, scale: 1 }
    const measurement = asset ? measureCharacterMaskAlignment(
      input.group,
      alignmentReference ? await readCharacterAlphaMask(alignmentReference.blob) : null,
      await readCharacterAlphaMask(asset.blob),
      transform,
      referenceTransform,
    ) : null
    const currentBounds = asset?.inspection.visibleBounds ? transformCharacterBounds(asset.inspection.visibleBounds, transform) : undefined
    const overflow = currentBounds ? {
      left: Math.max(0, -currentBounds.x),
      top: Math.max(0, -currentBounds.y),
      right: Math.max(0, currentBounds.x + currentBounds.width - CHARACTER_RIG.canvas.width),
      bottom: Math.max(0, currentBounds.y + currentBounds.height - CHARACTER_RIG.canvas.height),
    } : undefined
    const placementLayers = resolveCharacterDraftReferenceLayers(draft, { group: input.group, id: input.variantId })
    const placementUsesEditSource = Boolean(editSource && placementLayers.length === 1 && placementLayers[0]!.blob === editSource.blob)
    const placement = characterAssetPlacement(input.group, input.layer)
    const lineage = input.group === 'body' ? 'establish-canonical'
      : input.group === 'expression' || input.group === 'outfit' ? 'edit-canonical-body'
        : 'place-against-current-composite'
    const reviewDestination = input.group === 'expression' ? 'character-expressions'
      : input.group === 'outfit' ? 'character-outfits'
        : input.group === 'prop' ? 'character-props' : 'character-expressions'
    const suggestedTransform = highConfidenceCharacterAutoFit(measurement)
    const visualFit = asset && canonical && input.group === 'expression' && headRegistration?.variant.id === input.variantId
      ? suggestCharacterVisualRegistration(await readCharacterVisualSample(canonical.blob), await readCharacterVisualSample(asset.blob), transform)
      : null
    const nextActions = !asset || !variant || !isCharacterDraftAssetCurrent(draft, variant, input.layer) ? [{
      tool: 'submit_character_asset_candidate', required: true, reason: 'Submit the final exact-canvas RGBA target layer.', input: { draftId: draft.id, group: input.group, variantId: input.variantId, layer: input.layer, expectedUpdatedAt: draft.updatedAt },
    }] : suggestedTransform ? [{
      tool: 'set_character_variant_transform',
      required: true,
      reason: 'Apply the suggested absolute transform, then inspect the alpha-mask alignment again.',
      input: { draftId: draft.id, group: input.group, variantId: input.variantId, expectedUpdatedAt: draft.updatedAt, ...suggestedTransform },
    }] : visualFit?.suggestedTransform ? [{
      tool: 'set_character_variant_transform',
      required: false,
      reason: 'Try the experimental native pixel-and-edge correlation fit, then visually review the head alignment view; this never approves the draft.',
      input: { draftId: draft.id, group: input.group, variantId: input.variantId, expectedUpdatedAt: draft.updatedAt, ...visualFit.suggestedTransform },
    }, {
      tool: 'navigate_companion', required: true, reason: 'Open the target editor and visually preflight Composite, Overlay, Difference, and Align before user Review.', input: { destination: reviewDestination, draftId: draft.id },
    }] : [{
      tool: 'navigate_companion', required: true, reason: 'Open the target editor and visually preflight Composite, Overlay, Difference, and Align before user Review.', input: { destination: reviewDestination, draftId: draft.id },
    }, {
      tool: 'navigate_companion', required: false, reason: 'After the visual preflight is ready, open the complete Character Review.', input: { destination: 'character-review', draftId: draft.id },
    }]
    return {
      input: { group: input.group, variantId: input.variantId, layer: input.layer },
      expectedUpdatedAt: draft.updatedAt,
      current: asset ? {
        filled: true,
        current: Boolean(variant && isCharacterDraftAssetCurrent(draft, variant, input.layer)),
        filename: asset.filename,
        sha256: asset.inspection.sha256,
        transform,
      } : { filled: false, current: false, transform },
      required: REQUIRED_CHARACTER_TARGETS.some((target) => target.group === input.group && target.variantId === input.variantId && target.layer === input.layer),
      placement: { slot: placement.slot, slotOrder: CHARACTER_RIG.slots.find(({ id }) => id === placement.slot)!.order, layerOrder: placement.order },
      generationRecipe: {
        lineage,
        method: input.group === 'prop' ? 'reference-guided-generation' : 'reference-image-edit',
        editSource: editSource ? {
          filename: editSource.filename,
          sha256: editSource.inspection.sha256,
          visibleBounds: editSource.inspection.visibleBounds,
          dataUrl: await readDataUrl(editSource.blob),
        } : null,
        placementReference: placementLayers.length ? {
          layerCount: placementLayers.length,
          ...(placementUsesEditSource ? { useEditSource: true } : { dataUrl: await renderCharacterCompositeDataUrl(placementLayers) }),
        } : null,
        preserveCanvasCoordinates: true,
        output: {
          generateAt: { width: 1024, height: 1536 },
          finalizeAt: { ...CHARACTER_RIG.canvas },
          rgba: true,
          realAlpha: true,
          content: input.group === 'body' || input.group === 'outfit' ? 'complete-character'
            : input.group === 'expression' ? 'complete-whole-head' : 'prop-layer',
        },
      },
      alignment: {
        mode: input.group === 'expression' ? 'whole-head-bounds'
          : input.group === 'outfit' ? 'pose-frame'
            : input.group === 'prop' ? 'composite-review'
              : 'establish-frame',
        transform,
        referenceBounds: measurement && 'metrics' in measurement && measurement.metrics && 'referenceBounds' in measurement.metrics
          ? measurement.metrics.referenceBounds : undefined,
        candidateBounds: currentBounds,
        overflow,
        measurement,
        autoFit: suggestedTransform ? { confidence: 'high', transform: suggestedTransform } : null,
        visualFit,
        registration: input.group === 'expression' ? {
          role: headRegistration?.variant.id === input.variantId ? 'head-anchor' : 'follower',
          anchorVariantId: headRegistration?.variant.id ?? null,
          calibration: headRegistration?.variant.id === input.variantId ? {
            status: 'visual-required',
            compareAgainst: 'canonical-body-default-head',
            tool: 'set_character_variant_transform',
            rebasesCurrentExpressions: true,
          } : null,
        } : null,
        reviewDestination: workspacePath(reviewDestination, draft.id),
      },
      nextActions,
    }
  }

  async function inspectCharacterContract(rawInput: unknown) {
      const { draftId, ...targetInput } = rawInput as { draftId: string }
      const draft = await openCharacterDraft(draftId)
      const canonical = draft.variants.find(({ group, id }) => group === 'body' && id === 'base')?.layers.body
      const target = await characterTarget(draft, targetInput)
      return {
        status: 'ok',
        data: {
          rig: CHARACTER_RIG,
          creationGroups: CHARACTER_CREATION_GROUPS,
          variants: draft.variants.map((variant) => ({
            group: variant.group,
            id: variant.id,
            label: variant.label,
            layers: CHARACTER_CREATION_GROUPS.find(({ group }) => group === variant.group)!.layers.map((layer) => ({
              layer,
              filled: Boolean(variant.layers[layer]),
              current: isCharacterDraftAssetCurrent(draft, variant, layer),
            })),
          })),
          draft: { id: draft.id, name: draft.nameConfirmed ? draft.name : '', selected: draft.selected, updatedAt: draft.updatedAt },
          registrationFrame: characterRegistrationFrame(draft),
          canonicalReference: canonical ? {
            filename: canonical.filename,
            sha256: canonical.inspection.sha256,
            ...(target ? {} : { dataUrl: await readDataUrl(canonical.blob) }),
          } : null,
          productionBrief: [
            'The first body/base/body candidate establishes the canonical character and registration frame.',
            'The canonical body includes the default face. The first accepted whole-head expression establishes head registration; visually preflight it, then edit that returned expression reference for later expressions.',
            'An outfit replaces the character-skin slot: generate the complete dressed character, never a clothing-only overlay. Preserve pose, body center, head position, and foot line. Generate props against the returned current composite.',
            'Generate at 1024×1536 and deterministically downsample 50% to the exact 512×768 canvas. Never crop, reframe, or recenter.',
            'Before importing, preprocess generated assets outside the website: remove the background, resize onto the exact 512×768 canvas without changing alignment, and verify genuine alpha transparency.',
            'Submit only final RGBA PNG layers. The website validates but never repairs candidate images.',
            'Expression layers replace the whole aligned head, including the same fixed hairstyle and facial hair. Hair and facial hair are not customizable slots.',
            'No expression overlay means the default face baked into the body. Optional whole-head variants include happy, sad, angry, surprised, and sleepy; additional variants are allowed.',
            'Outfits are full-body variants. Props are independent, multi-select, full-canvas overlays and may contain front and back layers. A prop may be positioned anywhere, including on the head or in a hand.',
          ],
          target,
        },
        nextActions: target?.nextActions ?? characterNextActions(draft),
      }
  }

  async function submitCharacterAssetCandidate(rawInput: unknown) {
      const input = rawInput as {
        draftId: string
        group: CharacterVariantGroup
        variantId: string
        label: string
        layer: CharacterVariantLayer
        expectedUpdatedAt: number
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
      const current = await openCharacterDraft(input.draftId)
      if (current.updatedAt !== input.expectedUpdatedAt) throw new Error(`Character Draft changed; expected ${input.expectedUpdatedAt}, current ${current.updatedAt}`)
      const canonical = current.variants.find(({ group, id }) => group === 'body' && id === 'base')?.layers.body
      if (!(target.group === 'body' && target.variantId === 'base' && target.layer === 'body') && !canonical) throw new Error('Submit body/base/body before derived character assets')
      const blob = new Blob([bytes], { type: 'image/png' })
      const inspection = await inspectCharacterImage(blob)
      validateCharacterAssetInspection(inspection)
      const headRegistration = characterHeadRegistration(current)
      const expressionReference = headRegistration?.asset
      const alignment = measureCharacterMaskAlignment(
        target.group,
        target.group === 'expression' && expressionReference ? await readCharacterAlphaMask(expressionReference.blob)
          : target.group === 'outfit' && canonical ? await readCharacterAlphaMask(canonical.blob) : null,
        await readCharacterAlphaMask(blob),
        undefined,
        target.group === 'expression' ? headRegistration?.transform : undefined,
      )
      if (alignment.status === 'invalid') return {
        status: 'ok',
        data: {
          accepted: false,
          target,
          filename,
          inspection: {
            width: inspection.width,
            height: inspection.height,
            genuineRgba: inspection.genuineRgba,
            hasTransparentPixels: inspection.hasTransparentPixels,
            visibleBounds: inspection.visibleBounds,
            visiblePixelCount: inspection.visiblePixelCount,
          },
          alignment: {
            mode: target.group === 'expression' ? 'whole-head-bounds'
              : target.group === 'outfit' ? 'pose-frame'
                : target.group === 'prop' ? 'composite-review' : 'establish-frame',
            measurement: alignment,
          },
        },
        nextActions: [{
          tool: 'submit_character_asset_candidate',
          required: true,
          reason: alignment.diagnostics[0]?.message ?? 'Regenerate the rejected character asset.',
          input: { draftId: current.id, group: target.group, variantId: target.variantId, layer: target.layer, expectedUpdatedAt: current.updatedAt },
        }],
      }
      let draft = await saveCharacterDraftAsset(characterDrafts, async () => inspection, current, target, blob, filename, 'agent')
      const autoFit = highConfidenceCharacterAutoFit(alignment)
      if (autoFit && target.group !== 'body') {
        draft = await setCharacterVariantTransform(characterDrafts, current.id, target.group, target.variantId, draft.updatedAt, autoFit)
      }
      const savedVariant = draft.variants.find(({ group, id }) => group === target.group && id === target.variantId)!
      const specification = await characterTarget(draft, target)
      document.defaultView?.dispatchEvent(new Event('character-draft-updated'))
      return {
        status: 'ok',
        data: {
          accepted: true,
          target: { ...target, label: savedVariant.label },
          filename,
          byteLength: bytes.byteLength,
          inspection: {
            width: inspection.width,
            height: inspection.height,
            genuineRgba: inspection.genuineRgba,
            hasTransparentPixels: inspection.hasTransparentPixels,
            visibleBounds: inspection.visibleBounds,
            visiblePixelCount: inspection.visiblePixelCount,
          },
          alignment: specification?.alignment,
          autoFit: autoFit ? { applied: true, transform: autoFit } : { applied: false },
        },
        nextActions: specification?.nextActions ?? characterNextActions(draft),
      }
  }

  async function setCharacterTransform(rawInput: unknown) {
      const input = rawInput as {
        draftId: string
        group: CharacterVariantGroup
        variantId: string
        expectedUpdatedAt: number
        x: number
        y: number
        scale: number
      }
      const current = await openCharacterDraft(input.draftId)
      const before = current.variants.find(({ group, id }) => group === input.group && id === input.variantId)?.transform ?? { x: 0, y: 0, scale: 1 }
      const calibratesHead = input.group === 'expression' && current.headRegistration?.variantId === input.variantId
      const draft = await setCharacterVariantTransform(characterDrafts, input.draftId, input.group, input.variantId, input.expectedUpdatedAt, {
        x: input.x,
        y: input.y,
        scale: input.scale,
      })
      const variant = draft.variants.find(({ group, id }) => group === input.group && id === input.variantId)!
      const firstLayer = CHARACTER_CREATION_GROUPS.find(({ group }) => group === input.group)!.layers.find((layer) => variant.layers[layer])!
      const specification = await characterTarget(draft, { group: input.group, variantId: input.variantId, layer: firstLayer })
      document.defaultView?.dispatchEvent(new Event('character-draft-updated'))
      return {
        status: 'ok',
        data: {
          target: { group: input.group, variantId: input.variantId },
          before,
          after: variant.transform,
          rebasedVariantIds: calibratesHead ? draft.variants.filter((candidate) =>
            candidate.group === 'expression' && candidate.id !== input.variantId && isCharacterDraftAssetCurrent(draft, candidate, 'head')
          ).map(({ id }) => id) : [],
          updatedAt: draft.updatedAt,
          alignment: specification?.alignment,
        },
        nextActions: specification?.nextActions ?? characterNextActions(draft),
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
    if (!bundle?.record.metadata) return trigger === 'inspect-companion' ? {
      ok: true as const,
      data: {
        status: 'ok',
        data: { activeCompanion: null },
        nextActions: [{ tool: 'inspect_workspace', required: true, reason: 'Inspect authoring state and allowed destinations.' }],
      },
    } : incompatiblePlayResult(null)
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
