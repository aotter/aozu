import { bootMantleRuntime, type MantleRuntime } from '@aotter/mantle-runtime'

import { createIndexedDbAssetRepository } from './adapters/indexeddb/asset-repository.ts'
import { createIndexedDbCharacterDraftRepository } from './adapters/indexeddb/character-draft-repository.ts'
import { createCharacterWorkspaceRepository } from './adapters/indexeddb/character-workspace-repository.ts'
import { createIndexedDbMantleStorageAdapter } from './adapters/indexeddb/mantle-storage.ts'
import { createWebMcpController } from './adapters/webmcp/controller.ts'
import { loadStarterCatalog } from './adapters/browser/starter-packages.ts'
import { AUTHORING_NAMESPACE } from './core/application/authoring.ts'
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
  migrateCharacterDraft,
  hasCurrentCharacterLayer,
  isCharacterDraftAssetCurrent,
  characterAssetPlacement,
  characterDraftAtlasKey,
  characterRegistrationFrame,
  resolveCharacterDraftAtlasSources,
  resolveCharacterDraftReferenceLayers,
  resolveCharacterAssetSources,
  setCharacterVariantTransform,
  transformCharacterBounds,
  validateCharacterAssetInspection,
  saveCharacterDraftAsset,
} from './core/application/character-creation.ts'
import { createCharacterEditor } from './core/application/character-editor.ts'
import { highConfidenceCharacterAutoFit, measureCharacterMaskAlignment, measureProtectedRegionDelta, suggestCharacterVisualRegistration } from './core/application/character-alignment.ts'
import { inspectCharacterImage, readCharacterAlphaMask, readCharacterPixels, readCharacterVisualSample, renderCharacterCompositeDataUrl, renderCharacterEditMaskDataUrl, renderStitchedCharacterEditBlob } from './adapters/browser/character-image.ts'
import { compileCharacterTextureAtlas } from './adapters/browser/character-atlas.ts'
import { inspectSceneImage } from './adapters/browser/scene-image.ts'
import { requestPersistentStorage } from './adapters/browser/storage-persistence.ts'
import { exportCharacterDraftZip, readCharacterDraftZip } from './adapters/zip/character-draft.ts'
import { type StarterCharacterSelection } from './core/domain/starter.ts'
import { compileAuthoringBackbone, FIXED_BACKBONE_VERSION } from './core/mantle/backbone.ts'

const readDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read character asset'))
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(blob)
})

const CHARACTER_WEBMCP_TRIGGERS = [
  'inspect-workspace',
  'navigate-character',
  'inspect-character-contract',
  'submit-character-asset-candidate',
  'set-character-variant-transform',
  'undo-character-change',
  'redo-character-change',
] as const

export function createApplication(document: Document) {
  const legacyCharacterDrafts = createIndexedDbCharacterDraftRepository()
  const browser = document.defaultView
  // Derived atlas output lives outside the tracked Character and outside the Mantle entry.
  let authoringAtlas: { key: string; value: ReturnType<typeof compileCharacterTextureAtlas> } | undefined
  const compileAuthoringAtlas = (draft: CharacterDraft) => {
    const key = characterDraftAtlasKey(draft)
    if (authoringAtlas?.key !== key) authoringAtlas = { key, value: compileCharacterTextureAtlas(resolveCharacterDraftAtlasSources(draft)) }
    return authoringAtlas.value
  }
  let starterPackages: ReturnType<typeof loadStarterCatalog> | undefined
  const loadStarters = () => starterPackages ??= loadStarterCatalog(
    browser?.fetch.bind(browser) ?? fetch,
    inspectCharacterImage,
    inspectSceneImage,
    FIXED_BACKBONE_VERSION,
  )
  const authoringPlan = compileAuthoringBackbone()
  let authoringRuntime: Promise<MantleRuntime> | undefined
  const invokeContext = { user: null, staff: null, env: {} }

  const getAuthoringRuntime = () => authoringRuntime ??= bootMantleRuntime({
    plan: authoringPlan,
    storage: createIndexedDbMantleStorageAdapter(AUTHORING_NAMESPACE),
    handlers: {
      'companion.inspect-workspace': inspectWorkspace,
      'companion.navigate-character': navigateCharacter,
      'companion.create-local-companion': storyModeUnavailable,
      'companion.inspect-experience-contract': storyModeUnavailable,
      'companion.submit-experience-candidate': storyModeUnavailable,
      'companion.inspect-character-contract': inspectCharacterContract,
      'companion.submit-character-asset-candidate': submitCharacterAssetCandidate,
      'companion.set-character-variant-transform': setCharacterTransform,
      'companion.undo-character-change': characterHistoryTool('undo'),
      'companion.redo-character-change': characterHistoryTool('redo'),
    },
  })
  const characterDrafts = createCharacterWorkspaceRepository(getAuthoringRuntime, createIndexedDbAssetRepository)
  const editor = createCharacterEditor(characterDrafts, createIndexedDbAssetRepository, inspectCharacterImage)
  const webmcp = createWebMcpController(document, authoringPlan, CHARACTER_WEBMCP_TRIGGERS, async (trigger, input) =>
    (await getAuthoringRuntime()).invokeTrigger({ trigger, input, ctx: invokeContext }))

  function storyModeUnavailable(): never {
    throw new Error('Story mode is not available in this build')
  }

  let legacyCharactersMigrated: Promise<void> | undefined
  const migrateLegacyCharacters = () => legacyCharactersMigrated ??= (async () => {
    const legacy = await legacyCharacterDrafts.list()
    if (!legacy.length) return
    const packIds = new Set((await characterDrafts.list()).map(({ character }) => character.packId))
    for (const stored of legacy) {
      const draft = migrateCharacterDraft(stored)
      if (!packIds.has(draft.packId)) {
        await characterDrafts.create(draft)
        packIds.add(draft.packId)
      }
      await legacyCharacterDrafts.delete(stored.id)
    }
  })().catch((error) => {
    legacyCharactersMigrated = undefined
    throw error
  })

  const listCharacterDrafts = async () => {
    await migrateLegacyCharacters()
    return (await characterDrafts.list()).sort((left, right) => right.character.updatedAt - left.character.updatedAt || left.character.id.localeCompare(right.character.id))
  }

  const persisted = async <T>(record: Promise<{ character: T }>) => {
    const { character } = await record
    await requestPersistentStorage(browser?.navigator.storage)
    return character
  }
  const activeCharacter = () => {
    const { character, persistedRevision } = editor.store.getState()
    if (!character || persistedRevision === null) throw new Error('No Character is open')
    return { character, revision: persistedRevision }
  }
  const settledRevision = (what: string) => {
    const { persistedRevision, saveStatus, saveError } = editor.store.getState()
    if (saveStatus !== 'saved') throw new Error(`${what} is applied in the editor but not saved: ${saveError ?? saveStatus}`)
    return persistedRevision!
  }

  const application = {
    webmcp,
    editor,
    async loadCharacterLibrary() {
      return { characters: (await listCharacterDrafts()).map(({ character: { id, name, updatedAt } }) => ({ id, name, updatedAt })) }
    },
    listStarters: loadStarters,
    async createCharacter(characterChoice: StarterCharacterSelection) {
      let character: CharacterDraft
      if (characterChoice) {
        const packages = await loadStarters()
        const loaded = packages.find(({ starter }) => starter.id === characterChoice.starterId && starter.version === characterChoice.starterVersion)
        if (!loaded) throw new Error(`Starter not found: ${characterChoice.starterId}@${characterChoice.starterVersion}`)
        character = createCharacterDraftFromStarter(loaded, characterChoice.stateId)
      } else {
        character = createCharacterDraft()
      }
      return persisted(characterDrafts.create(character))
    },
    /** Save As: duplicates the active in-memory Character and switches to the copy. */
    saveCharacterAs: () => persisted(editor.saveAs().then((character) => ({ character }))),
    /** Copy: duplicates the latest saved library Character. */
    async copyCharacter(characterId: string) {
      return persisted(editor.duplicate((await editor.read(characterId)).character))
    },
    async autoFitCharacterVariant(group: CharacterVariantGroup, variantId: string) {
      const { character, revision } = activeCharacter()
      const variant = character.variants.find((candidate) => candidate.group === group && candidate.id === variantId)
      const layer = variant && CHARACTER_CREATION_GROUPS.find((candidate) => candidate.group === group)?.layers.find((candidate) => variant.layers[candidate])
      if (!variant || !layer) throw new Error('Character variant is empty or missing')
      const target = await characterTarget(character, revision, { group, variantId, layer })
      const visualTransform = target?.alignment.visualFit?.suggestedTransform
      const transform = visualTransform
        ?? ((target?.alignment.registration?.role === 'head-anchor' && target.alignment.visualFit) || target?.alignment.measurement?.status === 'aligned'
          ? null
          : highConfidenceCharacterAutoFit(target?.alignment.measurement))
      if (transform === null) return
      if (!transform) throw new Error('No high-confidence auto-fit is available; use the visual alignment controls.')
      await editor.dispatch((current) => setCharacterVariantTransform(current, group, variantId, transform), revision)
    },
    compileCharacterAtlas: compileAuthoringAtlas,
    async deleteCharacter(characterId: string) {
      await editor.close(characterId)
      await characterDrafts.delete(characterId)
    },
    async exportCharacter(characterId: string) {
      const { character } = await editor.view(characterId)
      return exportCharacterDraftZip(character, await compileAuthoringAtlas(character))
    },
    async importCharacter(blob: Blob) {
      const imported = await readCharacterDraftZip(blob, inspectCharacterImage)
      const duplicateIdentity = (await listCharacterDrafts()).some(({ character }) => character.packId === imported.draft.packId)
      return persisted(characterDrafts.create({
        ...imported.draft,
        id: crypto.randomUUID(),
        ...(duplicateIdentity ? { packId: `character-${crypto.randomUUID()}` } : {}),
        updatedAt: Date.now(),
      }))
    },
  }

  const categoryFor = (group: CharacterVariantGroup) => group === 'expression' ? 'expressions'
    : group === 'outfit' ? 'outfits' : group === 'prop' ? 'props' : 'expressions'
  const characterPath = (characterId: string, group: CharacterVariantGroup = 'expression', variantId?: string) =>
    `/characters/${encodeURIComponent(characterId)}/${categoryFor(group)}${variantId ? `/${encodeURIComponent(variantId)}` : ''}`
  const routeSelection = (path: string) => {
    const match = /^\/characters\/([^/]+)(?:\/(expressions|outfits|props)(?:\/([^/]+))?)?$/.exec(path)
    if (!match) return null
    try {
      return { characterId: decodeURIComponent(match[1]!), category: match[2] ?? null, variantId: match[3] ? decodeURIComponent(match[3]) : null }
    } catch { return null }
  }
  const characterNextActions = (draft: CharacterDraft) => {
    const missing = REQUIRED_CHARACTER_TARGETS.filter((target) => !hasCurrentCharacterLayer(draft, target.group, target.variantId, target.layer))
    return missing.length ? missing.map((target) => ({
      tool: 'inspect_character_contract',
      required: true,
      reason: `Inspect ${target.group}/${target.variantId}/${target.layer} before filling it.`,
      input: { characterId: draft.id, ...target },
    })) : []
  }
  const historyStatus = () => {
    const { activeCharacterId, persistedRevision, saveStatus } = editor.store.getState()
    const { pastStates, futureStates } = editor.history.getState()
    return {
      characterId: activeCharacterId,
      revision: persistedRevision,
      canUndo: pastStates.length > 0 && saveStatus !== 'conflict',
      canRedo: futureStates.length > 0 && saveStatus !== 'conflict',
      saveStatus,
    }
  }

  async function inspectWorkspace() {
    const route = browser?.location.pathname ?? '/'
    const selectedRoute = routeSelection(route)
    const records = await listCharacterDrafts()
    const saved = records.find(({ character }) => character.id === selectedRoute?.characterId)
    const current = saved ? await editor.view(saved.character.id) : null
    const character = current?.character ?? null
    const missingCharacterTargets = character ? REQUIRED_CHARACTER_TARGETS
      .filter((target) => !hasCurrentCharacterLayer(character, target.group, target.variantId, target.layer)) : REQUIRED_CHARACTER_TARGETS
    const navigation = [{ destination: 'characters', path: '/characters' }, ...(character ? [
      { destination: 'character-expressions', path: characterPath(character.id, 'expression') },
      { destination: 'character-outfits', path: characterPath(character.id, 'outfit') },
      { destination: 'character-props', path: characterPath(character.id, 'prop') },
    ] : [])]
    const nextActions = character ? characterNextActions(character) : [{
      tool: 'navigate_character', required: false, reason: records.length ? 'Open a Character before editing its assets.' : 'Open the Character library so the user can create a blank or starter Character.', input: { destination: 'characters' },
    }]
    return {
      status: 'ok',
      data: {
        route: { path: route, ...selectedRoute },
        characters: records.map(({ character: draft, version }) => ({
          id: draft.id,
          name: draft.name,
          revision: version,
          updatedAt: draft.updatedAt,
        })),
        currentCharacter: character && current ? {
          id: character.id,
          name: character.name,
          revision: current.version,
          updatedAt: character.updatedAt,
          selected: character.selected,
          missingTargets: missingCharacterTargets,
        } : null,
        history: historyStatus(),
        navigation,
      },
      nextActions,
    }
  }

  async function navigateCharacter(rawInput: unknown) {
    const { destination, characterId, variantId } = rawInput as {
      destination: 'characters' | 'character-expressions' | 'character-outfits' | 'character-props'
      characterId?: string
      variantId?: string
    }
    if (destination === 'characters') {
      return { status: 'ok', data: { destination, path: '/characters' }, nextActions: [], effects: { navigation: { path: '/characters', mode: 'push', reason: 'Open the Character library.' } } }
    }
    const character = characterId ? await editor.open(characterId) : null
    if (!character) throw new Error('A valid Character ID is required for this destination')
    const group = destination === 'character-expressions' ? 'expression' : destination === 'character-outfits' ? 'outfit' : 'prop'
    if (variantId && !character.variants.some((variant) => variant.group === group && variant.id === variantId)) throw new Error('Character variant not found')
    const path = characterPath(character.id, group, variantId)
    return { status: 'ok', data: { destination, characterId: character.id, variantId: variantId ?? null, path }, nextActions: [], effects: { navigation: { path, mode: 'push', reason: variantId ? 'Open the exact Character variant.' : 'Open the Character category.' } } }
  }

  const characterTarget = async (draft: CharacterDraft, revision: number, rawInput: unknown) => {
    const input = rawInput as Partial<{ group: CharacterVariantGroup; variantId: string; layer: CharacterVariantLayer }>
    if (!input.group && !input.variantId && !input.layer) return null
    if (!input.group || !input.variantId || !input.layer) throw new Error('Character target requires group, variantId, and layer')
    const group = CHARACTER_CREATION_GROUPS.find(({ group }) => group === input.group)
    if (!group || !group.layers.includes(input.layer) || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(input.variantId)) throw new Error('Unknown character asset target')
    if (input.group === 'body' && input.variantId !== 'base') throw new Error('The body group only supports body/base/body')
    const { asset, canonical, headRegistration, current, transform, alignmentReference, referenceTransform, editSource, editSourceTransform } = resolveCharacterAssetSources(draft, input as CharacterAssetTarget)
    const registrationFrame = characterRegistrationFrame(draft)
    const operation = current ? 'repair' as const : 'create' as const
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
    const suggestedTransform = highConfidenceCharacterAutoFit(measurement)
    const visualFit = asset && canonical && input.group === 'expression' && headRegistration?.variant.id === input.variantId
      ? suggestCharacterVisualRegistration(await readCharacterVisualSample(canonical.blob), await readCharacterVisualSample(asset.blob), transform)
      : null
    const editableRegion = input.group === 'expression' ? registrationFrame.editableRegions.expression
      : input.group === 'outfit' ? registrationFrame.editableRegions.outfit : undefined
    const protectedRegionDelta = asset && editSource && editableRegion
      ? measureProtectedRegionDelta(
          await readCharacterPixels(editSource.blob, editSourceTransform),
          await readCharacterPixels(asset.blob, transform),
          editableRegion,
        )
      : null
    const submissionAction = {
      tool: 'submit_character_asset_candidate',
      required: !current,
      reason: current ? 'Submit a replacement only when the user asked to repair this exact variant.' : 'Submit the final exact-canvas RGBA target layer.',
      input: {
        characterId: draft.id,
        group: input.group,
        variantId: input.variantId,
        layer: input.layer,
        expectedRevision: revision,
        expectedEditSourceSha256: editSource?.inspection.sha256 ?? null,
      },
    }
    const nextActions = !current ? [submissionAction] : suggestedTransform ? [{
      tool: 'set_character_variant_transform',
      required: true,
      reason: 'Apply the suggested absolute transform, then inspect the alpha-mask alignment again.',
      input: { characterId: draft.id, group: input.group, variantId: input.variantId, expectedRevision: revision, ...suggestedTransform },
    }] : visualFit?.suggestedTransform ? [{
      tool: 'set_character_variant_transform',
      required: false,
      reason: 'Try the experimental native pixel-and-edge correlation fit, then visually review the head alignment view.',
      input: { characterId: draft.id, group: input.group, variantId: input.variantId, expectedRevision: revision, ...visualFit.suggestedTransform },
    }, submissionAction] : [submissionAction, {
      tool: 'navigate_character', required: false, reason: 'Open this exact variant for visual preflight.', input: {
        destination: `character-${categoryFor(input.group)}`, characterId: draft.id, variantId: input.variantId,
      },
    }]
    return {
      input: { group: input.group, variantId: input.variantId, layer: input.layer },
      operation,
      expectedRevision: revision,
      current: asset ? {
        filled: true,
        current,
        filename: asset.filename,
        sha256: asset.inspection.sha256,
        transform,
      } : { filled: false, current: false, transform },
      required: REQUIRED_CHARACTER_TARGETS.some((target) => target.group === input.group && target.variantId === input.variantId && target.layer === input.layer),
      placement: { slot: placement.slot, slotOrder: CHARACTER_RIG.slots.find(({ id }) => id === placement.slot)!.order, layerOrder: placement.order },
      alignmentReference: alignmentReference ? {
        filename: alignmentReference.filename,
        sha256: alignmentReference.inspection.sha256,
        transform: referenceTransform ?? { x: 0, y: 0, scale: 1 },
        dataUrl: await readDataUrl(alignmentReference.blob),
      } : null,
      editSource: editSource ? {
        filename: editSource.filename,
        sha256: editSource.inspection.sha256,
        transform: editSourceTransform ?? { x: 0, y: 0, scale: 1 },
        coordinates: 'final-canvas',
        visibleBounds: editSource.inspection.visibleBounds && editSourceTransform
          ? transformCharacterBounds(editSource.inspection.visibleBounds, editSourceTransform)
          : editSource.inspection.visibleBounds,
        dataUrl: editSourceTransform ? await renderCharacterCompositeDataUrl([{
          id: 'edit-source', blobId: 'edit-source', slot: input.group === 'expression' ? 'expression-head' : 'character-skin',
          slotOrder: input.group === 'expression' ? 35 : 20, layerOrder: 0, transform: editSourceTransform, blob: editSource.blob,
        }]) : await readDataUrl(editSource.blob),
      } : null,
      editableRegion: editableRegion ? {
        ...editableRegion,
        mask: {
          filename: `${input.group}-${input.variantId}-${input.layer}-edit-mask.png`,
          mediaType: 'image/png',
          semantics: 'transparent-editable-opaque-protected',
          dataUrl: renderCharacterEditMaskDataUrl(editableRegion),
        },
      } : null,
      generationRecipe: {
        lineage,
        method: input.group === 'prop' ? 'reference-guided-generation' : 'reference-image-edit',
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
        protectedRegionDelta,
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
        reviewPath: characterPath(draft.id, input.group, input.variantId),
      },
      nextActions,
    }
  }

  async function inspectCharacterContract(rawInput: unknown) {
      const { characterId, ...targetInput } = rawInput as { characterId: string }
      const { character: draft, version } = await editor.view(characterId)
      const canonical = draft.variants.find(({ group, id }) => group === 'body' && id === 'base')?.layers.body
      const target = await characterTarget(draft, version, targetInput)
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
          character: { id: draft.id, name: draft.name, selected: draft.selected, revision: version },
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
            'When the target returns an editableRegion mask, transparent pixels are editable and opaque pixels are protected. The website deterministically stitches accepted expression and outfit proposals into their edit source; protectedRegionDelta must then be 0.',
            'Submit only full-canvas RGBA PNG proposals. The website never generates, removes backgrounds, or guesses geometry; it only compiles pixels authorized by the deterministic editable region.',
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
        characterId: string
        group: CharacterVariantGroup
        variantId: string
        label: string
        layer: CharacterVariantLayer
        expectedRevision: number
        expectedEditSourceSha256: string | null
        filename: string
        dataUrl: string
      }
      const target: CharacterAssetTarget = {
        group: input.group,
        variantId: input.variantId,
        label: input.label,
        layer: input.layer,
      }
      // Targeting another Character settles the active queue and switches sessions before validation.
      await editor.open(input.characterId)
      const { character: current, revision } = activeCharacter()
      if (revision !== input.expectedRevision) throw new Error(`Character changed; expected revision ${input.expectedRevision}, current ${revision}`)
      const sources = resolveCharacterAssetSources(current, target)
      const editSourceSha256 = sources.editSource?.inspection.sha256 ?? null
      if (editSourceSha256 !== input.expectedEditSourceSha256) throw new Error('Character edit source changed; inspect the target again')
      if (!(target.group === 'body' && target.variantId === 'base' && target.layer === 'body') && !sources.canonical) throw new Error('Submit body/base/body before derived character assets')
      const { filename, dataUrl } = input
      const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
      if (!match || dataUrl.length > 7_100_000) throw new Error('Expected a PNG data URL under 5 MiB')
      const binary = atob(match[1])
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
      const blob = new Blob([bytes], { type: 'image/png' })
      const inspection = await inspectCharacterImage(blob)
      validateCharacterAssetInspection(inspection)
      const alignment = measureCharacterMaskAlignment(
        target.group,
        sources.alignmentReference ? await readCharacterAlphaMask(sources.alignmentReference.blob) : null,
        await readCharacterAlphaMask(blob),
        undefined,
        sources.referenceTransform,
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
          input: { characterId: current.id, group: target.group, variantId: target.variantId, layer: target.layer, expectedRevision: revision, expectedEditSourceSha256: editSourceSha256 },
        }],
      }
      const autoFit = highConfidenceCharacterAutoFit(alignment)
      const registrationFrame = characterRegistrationFrame(current)
      const editableRegion = target.group === 'expression' ? registrationFrame.editableRegions.expression
        : target.group === 'outfit' ? registrationFrame.editableRegions.outfit : undefined
      const stitchedBlob = sources.editSource && editableRegion
        ? await renderStitchedCharacterEditBlob(
            sources.editSource.blob,
            blob,
            editableRegion,
            sources.editSourceTransform,
            autoFit ?? undefined,
          )
        : null
      const savedBlob = stitchedBlob ?? blob
      const savedInspection = stitchedBlob ? await inspectCharacterImage(stitchedBlob) : inspection
      // Blob first; then one command (asset swap plus optional auto-fit) creates exactly one history frame.
      const asset = await editor.stageAsset(savedBlob, filename, 'agent', savedInspection)
      await editor.dispatch((character) => {
        const placed = saveCharacterDraftAsset(character, target, asset)
        return !stitchedBlob && autoFit && target.group !== 'body' ? setCharacterVariantTransform(placed, target.group, target.variantId, autoFit) : placed
      }, input.expectedRevision)
      const draft = activeCharacter().character
      const savedRevision = settledRevision('Character asset')
      const savedVariant = draft.variants.find(({ group, id }) => group === target.group && id === target.variantId)!
      const specification = await characterTarget(draft, savedRevision, target)
      const protectedRegionDelta = stitchedBlob && sources.editSource && editableRegion
        ? measureProtectedRegionDelta(
            await readCharacterPixels(sources.editSource.blob, sources.editSourceTransform),
            await readCharacterPixels(stitchedBlob),
            editableRegion,
          ) : null
      const path = characterPath(draft.id, target.group, target.variantId)
      return {
        status: 'ok',
        data: {
          accepted: true,
          target: { ...target, label: savedVariant.label },
          filename,
          byteLength: savedBlob.size,
          inspection: {
            width: savedInspection.width,
            height: savedInspection.height,
            genuineRgba: savedInspection.genuineRgba,
            hasTransparentPixels: savedInspection.hasTransparentPixels,
            visibleBounds: savedInspection.visibleBounds,
            visiblePixelCount: savedInspection.visiblePixelCount,
          },
          alignment: specification?.alignment,
          compositor: stitchedBlob ? { applied: true, protectedRegionDelta } : { applied: false },
          autoFit: autoFit ? { applied: true, transform: autoFit, bakedIntoAsset: Boolean(stitchedBlob) } : { applied: false },
          revision: savedRevision,
        },
        nextActions: specification?.nextActions ?? characterNextActions(draft),
        effects: { navigation: { path, mode: 'push', reason: 'Open the accepted Character asset for visual review.' } },
      }
  }

  async function setCharacterTransform(rawInput: unknown) {
      const input = rawInput as {
        characterId: string
        group: CharacterVariantGroup
        variantId: string
        expectedRevision: number
        x: number
        y: number
        scale: number
      }
      await editor.open(input.characterId)
      const { character: current } = activeCharacter()
      const before = current.variants.find(({ group, id }) => group === input.group && id === input.variantId)?.transform ?? { x: 0, y: 0, scale: 1 }
      const calibratesHead = input.group === 'expression' && current.headRegistration?.variantId === input.variantId
      await editor.dispatch((character) => setCharacterVariantTransform(character, input.group, input.variantId, {
        x: input.x,
        y: input.y,
        scale: input.scale,
      }), input.expectedRevision)
      const draft = activeCharacter().character
      const revision = settledRevision('Character transform')
      const variant = draft.variants.find(({ group, id }) => group === input.group && id === input.variantId)!
      const firstLayer = CHARACTER_CREATION_GROUPS.find(({ group }) => group === input.group)!.layers.find((layer) => variant.layers[layer])!
      const specification = await characterTarget(draft, revision, { group: input.group, variantId: input.variantId, layer: firstLayer })
      const path = characterPath(draft.id, input.group, input.variantId)
      return {
        status: 'ok',
        data: {
          target: { group: input.group, variantId: input.variantId },
          before,
          after: variant.transform,
          rebasedVariantIds: calibratesHead ? draft.variants.filter((candidate) =>
            candidate.group === 'expression' && candidate.id !== input.variantId && isCharacterDraftAssetCurrent(draft, candidate, 'head')
          ).map(({ id }) => id) : [],
          revision,
          alignment: specification?.alignment,
        },
        nextActions: specification?.nextActions ?? characterNextActions(draft),
        effects: { navigation: { path, mode: 'push', reason: 'Open the adjusted Character variant for visual review.' } },
      }
  }

  function characterHistoryTool(direction: 'undo' | 'redo') {
    return async (rawInput: unknown) => {
      const input = rawInput as { characterId: string; expectedRevision: number }
      const state = editor.store.getState()
      const history = historyStatus()
      if (state.activeCharacterId !== input.characterId || !state.character) return { status: 'no_active_history', data: history }
      if (state.saveStatus !== 'saved') return { status: 'not_settled', data: history }
      if (state.persistedRevision !== input.expectedRevision) return { status: 'revision_conflict', data: history }
      if (!(direction === 'undo' ? history.canUndo : history.canRedo)) return { status: `nothing_to_${direction}`, data: history }
      await editor[direction]()
      settledRevision(`Character ${direction}`)
      const route = browser?.location.pathname ?? ''
      const path = routeSelection(route)?.characterId === input.characterId ? route : characterPath(input.characterId)
      return {
        status: 'ok',
        data: { ...historyStatus(), characterId: input.characterId },
        effects: { navigation: { path, mode: 'push', reason: `Review the Character after ${direction}.` } },
      }
    }
  }

  return application
}

export type Application = ReturnType<typeof createApplication>
