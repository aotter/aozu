import { ArrowLeftIcon, CircleSlash2Icon, Layers2Icon, PencilIcon, PlusIcon, Redo2Icon, Undo2Icon } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useStore } from 'zustand'

import { CHARACTER_CREATION_GROUPS, REQUIRED_CHARACTER_TARGETS, characterDraftAtlasKey, characterRegistrationFrame, hasCurrentCharacterLayer, isCharacterDraftAssetCurrent, resolveCharacterDraftLayers, resolveCharacterDraftReferenceLayers, saveCharacterDraftAsset, setCharacterVariantTransform, transformCharacterBounds } from '@/core/application/character-creation.ts'
import type { CharacterFitSuggestion } from '@/core/application/character-alignment.ts'
import type { CharacterEditor } from '@/core/application/character-editor.ts'
import { IDENTITY_CHARACTER_TRANSFORM, type CharacterDraft, type CharacterDraftVariant, type CharacterTextureAtlas, type CharacterVariantGroup, type CharacterVariantLayer, type CharacterVariantTransform } from '@/core/domain/character.ts'
import { AozuIcon, type AozuIconName } from '@/ui/AozuIcon'
import { CharacterAlignmentRenderer, CharacterAssetImage, CharacterAtlasFrameImage, CharacterRenderer, CharacterSlotPlaceholder } from '@/ui/CharacterRenderer'
import { Button } from '@/ui/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/components/ui/tooltip'
import { DataControls } from '@/ui/DataControls'
import { StatusPage } from '@/ui/pages/StatusPage'
import { useBlobUrl } from '@/ui/useBlobUrl'

type CharacterCategoryId = 'expressions' | 'outfits' | 'props'
type CharacterCategory = { id: CharacterCategoryId; group: CharacterVariantGroup; icon: AozuIconName }

const characterCategories: CharacterCategory[] = [
  { id: 'expressions', group: 'expression', icon: 'expressions' },
  { id: 'outfits', group: 'outfit', icon: 'outfits' },
  { id: 'props', group: 'prop', icon: 'props' },
]
const categoryForGroup = (group: CharacterVariantGroup) => characterCategories.find((category) => category.group === group)!.id
const expressionIcons = ['happy', 'sad', 'angry', 'surprised', 'sleepy']
const expressionPlaceholder = (variantId: string) => `/assets/expression-placeholders/${expressionIcons.includes(variantId) ? variantId : 'happy'}.webp`
// Expressions have portrait art; outfits and props reuse their category icon; the base body keeps its silhouette mask.
const CharacterVariantPlaceholder = ({ group, variantId, label }: { group: CharacterVariantGroup; variantId: string; label?: string }) => group === 'expression'
  ? <img className="expression-placeholder" src={expressionPlaceholder(variantId)} alt={label ?? ''} />
  : group === 'body'
    ? <CharacterSlotPlaceholder src="/assets/character-slots/body-base.webp" label={label} />
    : <AozuIcon name={group === 'prop' ? 'props' : 'outfits'} className="is-placeholder" />
const variantKey = ({ group, id }: Pick<CharacterDraftVariant, 'group' | 'id'>) => `${group}:${id}`
const describe = (error: unknown) => error instanceof Error ? error.message : String(error)
const sameTransform = (left: CharacterVariantTransform = IDENTITY_CHARACTER_TRANSFORM, right: CharacterVariantTransform) =>
  left.x === right.x && left.y === right.y && left.scale === right.scale
const withVariant = (source: CharacterDraft, target: Pick<CharacterDraftVariant, 'group' | 'id'>, patch: Partial<CharacterDraftVariant>): CharacterDraft => ({
  ...source,
  variants: source.variants.map((variant) => variant.group === target.group && variant.id === target.id ? { ...variant, ...patch } : variant),
})
const activateVariant = (source: CharacterDraft, variant: CharacterDraftVariant) => {
  const { group, id } = variant
  if (group === 'body') return source
  if (group === 'expression') return source.selected.expression === id ? source : { ...source, selected: { ...source.selected, expression: id } }
  if (group === 'prop') return source.selected.props.includes(id) ? source : { ...source, selected: { ...source.selected, props: [...source.selected.props, id] } }
  return source.selected.outfit === id ? source : { ...source, selected: { ...source.selected, outfit: id } }
}
const fitNumber = (value: number | null) => value === null ? '—' : `${Math.round(value * 10_000) / 10_000}`
const fitMetrics = (t: (key: string) => string, suggestion: Extract<CharacterFitSuggestion, { status: 'suggested' }>) => [
  ...(['iou', 'footLine', 'match'] as const).flatMap((field) => {
    const key = field === 'iou' ? 'iou' : field === 'footLine' ? 'footLineDelta' : 'score'
    const before = suggestion.before[key]
    const after = suggestion.after[key]
    return before === null || after === null ? [] : [`${t(`characterDraft.transform.${field}`)} ${fitNumber(before)} → ${fitNumber(after)}`]
  }),
  `x ${suggestion.transform.x} · y ${suggestion.transform.y} · ×${suggestion.transform.scale}`,
]

const isTextEntry = (target: EventTarget | null) => target instanceof HTMLElement
  && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))

export function CharacterDraftPage({ editor, autoFitVariant, fitSuggestion, compileAtlas, exportCharacter, saveAs }: {
  editor: CharacterEditor
  autoFitVariant(group: CharacterVariantGroup, variantId: string): Promise<void>
  fitSuggestion(group: CharacterVariantGroup, variantId: string): Promise<CharacterFitSuggestion>
  compileAtlas(draft: CharacterDraft): Promise<CharacterTextureAtlas | undefined>
  exportCharacter(): Promise<Blob>
  saveAs(): Promise<CharacterDraft>
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { characterId, step, variantId } = useParams()
  const category = characterCategories.find(({ id }) => id === step)
  const activeCharacterId = useStore(editor.store, (state) => state.activeCharacterId)
  const character = useStore(editor.store, (state) => state.character)
  const saveStatus = useStore(editor.store, (state) => state.saveStatus)
  const saveError = useStore(editor.store, (state) => state.saveError)
  const canUndo = useStore(editor.history, (state) => state.pastStates.length > 0) && saveStatus !== 'conflict'
  const canRedo = useStore(editor.history, (state) => state.futureStates.length > 0) && saveStatus !== 'conflict'
  const [loadError, setLoadError] = useState<{ characterId: string; message: string }>()
  // In-progress text, numeric, or drag edits render locally until one commit; keyed to the committed value they started from.
  const [local, setLocal] = useState<{ base: CharacterDraft; value: CharacterDraft }>()
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [compiled, setCompiled] = useState<{ key: string; atlas?: CharacterTextureAtlas }>()
  const [fit, setFit] = useState<{ key: string; value: CharacterFitSuggestion }>()
  const [alignmentMode, setAlignmentMode] = useState<'composite' | 'overlay' | 'difference' | 'diagnostic'>('overlay')
  const atlasDraft = useRef<CharacterDraft | undefined>(undefined)
  const drag = useRef<{
    group: CharacterVariantGroup
    variantId: string
    pointerId: number
    startX: number
    startY: number
    width: number
    height: number
    origin: CharacterVariantTransform
    current: CharacterVariantTransform
  } | undefined>(undefined)

  useEffect(() => {
    let live = true
    editor.open(characterId ?? '').catch((caught: unknown) => { if (live) setLoadError({ characterId: characterId ?? '', message: describe(caught) }) })
    return () => { live = false }
  }, [editor, characterId])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || isTextEntry(event.target)) return
      const key = event.key.toLowerCase()
      if (key === 'z') { event.preventDefault(); void (event.shiftKey ? editor.redo() : editor.undo()) }
      else if (key === 'y' && event.ctrlKey) { event.preventDefault(); void editor.redo() }
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => { if (editor.store.getState().saveStatus !== 'saved') event.preventDefault() }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('beforeunload', onBeforeUnload) }
  }, [editor])

  const committed = activeCharacterId === characterId ? character ?? undefined : undefined
  const draft = local && local.base === committed ? local.value : committed
  const atlasKey = committed ? characterDraftAtlasKey(committed) : undefined
  useLayoutEffect(() => { atlasDraft.current = committed }, [committed])
  useEffect(() => {
    const source = atlasDraft.current
    if (!source || !atlasKey || compiled?.key === atlasKey) return
    let active = true
    void compileAtlas(source)
      .then((atlas) => { if (active) setCompiled({ key: atlasKey, atlas }) })
      .catch((caught) => {
        console.error('Character atlas compile failed', caught)
        if (active) setCompiled({ key: atlasKey })
      })
    return () => { active = false }
  }, [atlasKey, compileAtlas, compiled?.key])

  const fitGroup = category?.group === 'expression' || category?.group === 'outfit' ? category.group : undefined
  const fitKey = committed && atlasKey && variantId && fitGroup ? `${fitGroup}:${variantId}:${atlasKey}` : undefined
  useEffect(() => {
    if (!fitKey || !fitGroup || !variantId) return
    let active = true
    void fitSuggestion(fitGroup, variantId)
      .then((value) => { if (active) setFit({ key: fitKey, value }) })
      .catch(() => { if (active) setFit({ key: fitKey, value: { status: 'unavailable' } }) })
    return () => { active = false }
  }, [fitKey, fitGroup, variantId, fitSuggestion])
  const suggestion = fit && fitKey && fit.key === fitKey ? fit.value : undefined

  const atlas = compiled?.atlas
  const atlasSrc = useBlobUrl(atlas?.image)

  if (!step || step === 'identity' || step === 'accessories') return <Navigate to={`/characters/${encodeURIComponent(characterId ?? '')}/expressions`} replace />
  if (!category) return <Navigate to={`/characters/${encodeURIComponent(characterId ?? '')}/expressions`} replace />
  if (loadError && loadError.characterId === characterId) return <StatusPage>
    {loadError.message}
    {activeCharacterId && activeCharacterId !== characterId && <><br /><Button variant="link" onClick={() => navigate(`/characters/${encodeURIComponent(activeCharacterId)}/expressions`)}>{t('characterDraft.backToActive', { name: character?.name })}</Button></>}
  </StatusPage>
  if (!draft) return <StatusPage>{t('startup.loading')}</StatusPage>

  const edit = (value: CharacterDraft) => { if (committed) setLocal({ base: committed, value }) }
  const revert = () => setLocal(undefined)
  const commit = (produce: (current: CharacterDraft) => CharacterDraft) => {
    setError(undefined)
    setLocal(undefined)
    try { void editor.dispatch(produce) } catch (caught) { setError(describe(caught)) }
  }
  const textKeys = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') revert()
  }

  const missing = REQUIRED_CHARACTER_TARGETS.filter((target) => !hasCurrentCharacterLayer(draft, target.group, target.variantId, target.layer))
  const visibleVariants = category ? draft.variants.filter(({ group }) => category.group === group) : []
  const selectedVariant = visibleVariants.find((variant) => variant.id === variantId)
  if (variantId && !selectedVariant) return <Navigate to={`/characters/${encodeURIComponent(draft.id)}/${category.id}`} replace />
  const previewLayers = resolveCharacterDraftLayers(draft, selectedVariant)
  const referenceLayers = selectedVariant ? resolveCharacterDraftReferenceLayers(draft, selectedVariant) : []
  const registration = characterRegistrationFrame(draft)
  const selectedPrimaryLayer = selectedVariant && (selectedVariant.group === 'prop' ? selectedVariant.layers.front ? 'front' : 'back' : CHARACTER_CREATION_GROUPS.find(({ group }) => group === selectedVariant.group)!.layers[0])
  const selectedAsset = selectedVariant && selectedPrimaryLayer ? selectedVariant.layers[selectedPrimaryLayer] : undefined
  const referenceBounds = selectedVariant?.group === 'expression' ? registration.head?.bounds
    : selectedVariant?.group === 'outfit' ? registration.bodyBounds : undefined
  const selectedTransform = selectedVariant?.transform ?? IDENTITY_CHARACTER_TRANSFORM
  const candidateBounds = selectedAsset?.inspection.visibleBounds ? transformCharacterBounds(selectedAsset.inspection.visibleBounds, selectedTransform) : undefined
  const draggable = selectedVariant?.group === 'expression' && Boolean(selectedAsset)
  const commitTransform = (target: Pick<CharacterDraftVariant, 'group' | 'id'>, transform: CharacterVariantTransform) => commit((current) => {
    const variant = current.variants.find((candidate) => candidate.group === target.group && candidate.id === target.id)
    return !variant || sameTransform(variant.transform, transform) ? current : setCharacterVariantTransform(current, target.group, target.id, transform)
  })
  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggable || !selectedVariant) return
    const bounds = event.currentTarget.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      group: selectedVariant.group,
      variantId: selectedVariant.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: bounds.width,
      height: bounds.height,
      origin: selectedTransform,
      current: selectedTransform,
    }
  }
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId || !committed) return
    const next = {
      ...active.origin,
      x: Math.max(-512, Math.min(512, Math.round(active.origin.x + (event.clientX - active.startX) / active.width * 512))),
      y: Math.max(-768, Math.min(768, Math.round(active.origin.y + (event.clientY - active.startY) / active.height * 768))),
    }
    active.current = next
    edit(withVariant(committed, { group: active.group, id: active.variantId }, { transform: next }))
  }
  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    drag.current = undefined
    event.currentTarget.releasePointerCapture(event.pointerId)
    commitTransform({ group: active.group, id: active.variantId }, active.current)
  }
  const selectedId = (group: CharacterVariantGroup) => {
    if (group === 'body') return undefined
    if (group === 'expression') return draft.selected.expression
    if (group === 'outfit') return draft.selected.outfit
    return undefined
  }
  const selectVariant = (variant: CharacterDraftVariant) => commit((current) => activateVariant(current, variant))
  const clearVariant = (group: CharacterVariantGroup) => commit((current) => {
    if (group === 'expression') return current.selected.expression === undefined ? current : { ...current, selected: { ...current.selected, expression: undefined } }
    if (group === 'outfit') return current.selected.outfit === undefined ? current : { ...current, selected: { ...current.selected, outfit: undefined } }
    if (group === 'prop') return current.selected.props.length === 0 ? current : { ...current, selected: { ...current.selected, props: [] } }
    return current
  })
  const isSelected = (variant: CharacterDraftVariant) => variant.group === 'prop' ? draft.selected.props.includes(variant.id) : selectedId(variant.group) === variant.id
  const toggleVariant = (variant: CharacterDraftVariant) => {
    if (variant.group !== 'prop' || !isSelected(variant)) return selectVariant(variant)
    commit((current) => ({ ...current, selected: { ...current.selected, props: current.selected.props.filter((id) => id !== variant.id) } }))
  }
  const hasSelection = (group: CharacterVariantGroup) => group === 'prop' ? Boolean(draft.selected.props.length) : Boolean(selectedId(group))
  const addVariant = (group: CharacterVariantGroup) => {
    const count = draft.variants.filter((variant) => variant.group === group).length + 1
    const variant: CharacterDraftVariant = {
      group,
      id: `${group}-${crypto.randomUUID().slice(0, 8)}`,
      label: `${t(`characterDraft.groups.${group}.variantName`)} ${count}`,
      layers: {},
    }
    commit((current) => ({ ...current, variants: [...current.variants, variant] }))
    navigate(`/characters/${encodeURIComponent(draft.id)}/${categoryForGroup(group)}/${encodeURIComponent(variant.id)}`)
  }
  const fileInput = (variant: CharacterDraftVariant, layer: CharacterVariantLayer) => {
    const targetKey = `${variantKey(variant)}:${layer}`
    return <input className="sr-only" type="file" accept="image/png" disabled={Boolean(busy)} onChange={async (event) => {
        const file = event.target.files?.[0]
        if (!file) return
        setBusy(targetKey); setError(undefined)
        try {
          // Blob write first; then exactly one command swaps the asset reference (and activates the variant).
          const asset = await editor.stageAsset(file, file.name, 'user')
          await editor.dispatch((current) => {
            const next = saveCharacterDraftAsset(current, { group: variant.group, variantId: variant.id, label: variant.label, layer }, asset)
            return variant.group !== 'body' && layer !== 'back' ? activateVariant(next, variant) : next
          })
        } catch (caught) {
          setError(describe(caught))
        } finally {
          setBusy(undefined); event.target.value = ''
        }
      }} />
  }
  const runBusy = async (key: string, task: () => Promise<unknown>) => {
    setBusy(key); setError(undefined)
    try { await task() } catch (caught) { setError(describe(caught)) } finally { setBusy(undefined) }
  }
  const iconAction = (label: string, icon: ComponentType<{ className?: string }>, enabled: boolean, run: () => void) => {
    const Icon = icon
    return <Tooltip><TooltipTrigger asChild><Button type="button" size="icon" variant="ghost" aria-label={label} disabled={!enabled} onClick={run}><Icon /></Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
  }

  return <div className="draft-workshop-shell">
    <main className="draft-workshop mx-auto flex h-full w-full max-w-6xl flex-col p-3 sm:p-6">
      <aside className="character-spell-guide" aria-labelledby="character-spell-title">
        <div className="spell-icon"><AozuIcon name="book" /></div>
        <div className="min-w-0 flex-1">
          <p className="forge-kicker">{t('characterDraft.kicker')}</p>
          <h1 id="character-spell-title" className="font-heading text-2xl font-semibold">{t('characterDraft.chatgpt.title')}</h1>
          <p>{t('characterDraft.chatgpt.description')}</p>
        </div>
      </aside>

      <div className="draft-workshop-grid mt-4 min-h-0 flex-1">
      <section className="character-stage-panel rounded-2xl border bg-background">
        <div className="character-stage-heading">
          <div><span>01</span><strong>{t('characterDraft.stageTitle')}</strong></div>
          {draft.name.trim() && <p>{draft.name}</p>}
        </div>
        <div className="character-stage-canvas">
          <div
            className={`aspect-2/3 h-full max-h-full max-w-full ${draggable ? 'cursor-move touch-none' : ''}`}
            title={draggable ? t('characterDraft.transform.dragHead') : undefined}
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          >{selectedVariant && selectedAsset
            ? <CharacterAlignmentRenderer
                label={draft.name}
                candidateLayers={previewLayers}
                referenceLayers={referenceLayers}
                mode={alignmentMode}
                candidateBounds={candidateBounds}
                referenceBounds={referenceBounds}
                footLine={registration.footLine}
              />
            : <CharacterRenderer label={draft.name} layers={previewLayers} atlas={atlas} />}</div>
        </div>
        {selectedVariant && selectedAsset && <div className="alignment-switch" aria-label={t('characterDraft.alignment.label')}>
          {(['composite', 'overlay', 'difference', 'diagnostic'] as const).map((mode) => <Button key={mode} type="button" size="sm" variant={alignmentMode === mode ? 'secondary' : 'ghost'} onClick={() => setAlignmentMode(mode)}>{t(`characterDraft.alignment.${mode}`)}</Button>)}
        </div>}
        <div className="character-first-dialogue">
          <span className="dialogue-portrait"><AozuIcon name="profile" /></span>
          <label className="min-w-0 flex-1">
            <span>{t('draft.name')}</span>
            <input
              aria-label={t('draft.name')}
              value={draft.name}
              onChange={(event) => edit({ ...draft, name: event.target.value })}
              onBlur={(event) => {
                const name = event.currentTarget.value
                commit((current) => current.name === name || !name.trim() ? current : { ...current, name })
              }}
              onKeyDown={textKeys}
            />
          </label>
        </div>
      </section>

      <section className="doll-workbench rounded-2xl border bg-background" aria-label={t('characterDraft.customizeTitle')}>
        <div className="workbench-heading"><span>02</span><div><h2>{t('characterDraft.customizeTitle')}</h2><p>{t('characterDraft.workbenchDescription')}</p></div></div>
        {!selectedVariant && <nav aria-label={t('characterDraft.categorySwitcher')} className="workbench-tabs">
          {characterCategories.map(({ id, icon }) => <Button
            key={id}
            type="button"
            variant={category?.id === id ? 'secondary' : 'ghost'}
            className="shrink-0"
            title={t(`characterDraft.categories.${id}`)}
            aria-current={category?.id === id ? 'page' : undefined}
            onClick={() => navigate(`/characters/${encodeURIComponent(draft.id)}/${id}`)}
          >
            <AozuIcon name={icon} />
            <span className="sr-only">{t(`characterDraft.categories.${id}`)}</span>
          </Button>)}
        </nav>}

        <div className="workbench-content min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!selectedVariant && <>
          <h3>{t(`characterDraft.categories.${category.id}`)}</h3>
          <div className="variant-grid">
            <button type="button" aria-label={t('characterDraft.none')} title={t('characterDraft.none')} aria-pressed={!hasSelection(category.group)} className={`variant-card ${!hasSelection(category.group) ? 'is-selected' : ''}`} onClick={() => clearVariant(category.group)}>
              <span className="variant-preview"><CircleSlash2Icon className="size-1/3 text-muted-foreground" /></span><span className="variant-label">{t('characterDraft.none')}</span>
            </button>
            {visibleVariants.map((variant) => {
              const group = CHARACTER_CREATION_GROUPS.find(({ group }) => group === variant.group)!
              const thumbnailLayer = variant.layers.front && isCharacterDraftAssetCurrent(draft, variant, 'front')
                ? 'front'
                : group.layers.find((layer) => isCharacterDraftAssetCurrent(draft, variant, layer))
              const thumbnail = thumbnailLayer ? variant.layers[thumbnailLayer] : undefined
              const frameId = thumbnailLayer && `${variant.group}-${variant.id}-${thumbnailLayer}`
              const selected = isSelected(variant)
              return <div key={variantKey(variant)} className={`variant-card ${selected ? 'is-selected' : ''}`}>
                <button type="button" aria-label={variant.label} title={variant.label} aria-pressed={selected} className="block w-full" onClick={() => toggleVariant(variant)}>
                  <span className={`variant-preview ${variant.group === 'expression' ? 'is-expression' : ''}`}>{thumbnail
                    ? atlas && atlasSrc && frameId && atlas.data.frames[frameId]
                      ? <CharacterAtlasFrameImage atlas={atlas} src={atlasSrc} frameId={frameId} label={variant.label} />
                      : <CharacterAssetImage blob={thumbnail.blob} bounds={thumbnail.inspection.visibleBounds} label={variant.label} />
                    : <CharacterVariantPlaceholder group={variant.group} variantId={variant.id} label={variant.label} />}</span><span className="variant-label">{variant.label}</span>
                </button>
                <button type="button" title={t('characterDraft.editVariant', { name: variant.label })} className="variant-edit" aria-label={t('characterDraft.editVariant', { name: variant.label })} onClick={() => navigate(`/characters/${encodeURIComponent(draft.id)}/${category.id}/${encodeURIComponent(variant.id)}`)}><PencilIcon className="size-4" /></button>
              </div>
            })}
            <button type="button" title={t(`characterDraft.groups.${category.group}.add`)} className="variant-card add-variant" aria-label={t(`characterDraft.groups.${category.group}.add`)} onClick={() => addVariant(category.group)}>
              <span className="variant-preview"><PlusIcon className="size-6" /></span><span className="variant-label">{t(`characterDraft.groups.${category.group}.add`)}</span>
            </button>
          </div>
        </>}

        {selectedVariant && (() => {
          const group = CHARACTER_CREATION_GROUPS.find(({ group }) => group === selectedVariant.group)!
          const layeredAccessory = selectedVariant.group === 'prop'
          const primaryLayer = layeredAccessory ? 'front' : group.layers[0]
          const primaryAsset = isCharacterDraftAssetCurrent(draft, selectedVariant, primaryLayer) ? selectedVariant.layers[primaryLayer] : undefined
          const behindAsset = layeredAccessory && isCharacterDraftAssetCurrent(draft, selectedVariant, 'back') ? selectedVariant.layers.back : undefined
          const required = REQUIRED_CHARACTER_TARGETS.some((target) => target.group === selectedVariant.group && target.variantId === selectedVariant.id)
          const transform = selectedVariant.transform ?? IDENTITY_CHARACTER_TRANSFORM
          const changeTransform = (field: keyof CharacterVariantTransform, value: number) => {
            if (!Number.isFinite(value)) return
            edit(withVariant(draft, selectedVariant, { transform: { ...transform, [field]: value } }))
          }
          return <>
            <div className="variant-editor-heading">
              <Button type="button" size="icon" variant="ghost" aria-label={t('characterDraft.backToVariants')} onClick={() => navigate(`/characters/${encodeURIComponent(draft.id)}/${category.id}`)}><ArrowLeftIcon /></Button>
              <input
                aria-label={t('characterDraft.variantLabel')}
                className="min-w-0"
                value={selectedVariant.label}
                onChange={(event) => edit(withVariant(draft, selectedVariant, { label: event.target.value }))}
                onBlur={(event) => {
                  const label = event.currentTarget.value.trim()
                  commit((current) => {
                  const variant = current.variants.find((candidate) => candidate.group === selectedVariant.group && candidate.id === selectedVariant.id)
                  return !variant || !label || variant.label === label ? current : withVariant(current, variant, { label })
                  })
                }}
                onKeyDown={textKeys}
              />
              {required && <span className="required-status">{t('characterDraft.required')}</span>}
            </div>
            {(primaryAsset || behindAsset) && <div className="transform-grid" aria-label={t('characterDraft.transform.label')}>
              {(['x', 'y', 'scale'] as const).map((field) => <label key={field} className="min-w-0 text-muted-foreground">
                <span className="sr-only">{t(`characterDraft.transform.${field}`)}</span>
                <input
                  type="number"
                  step={field === 'scale' ? 0.01 : 1}
                  min={field === 'scale' ? 0.25 : field === 'x' ? -512 : -768}
                  max={field === 'scale' ? 4 : field === 'x' ? 512 : 768}
                  aria-label={t(`characterDraft.transform.${field}`)}
                  title={t(`characterDraft.transform.${field}`)}
                  className="w-full rounded-md border bg-background px-1 text-center text-foreground"
                  value={transform[field]}
                  onChange={(event) => changeTransform(field, Number(event.target.value))}
                  onBlur={(event) => {
                    const value = Number(event.currentTarget.value)
                    if (!Number.isFinite(value)) return revert()
                    commit((current) => {
                      const variant = current.variants.find((candidate) => candidate.group === selectedVariant.group && candidate.id === selectedVariant.id)
                      if (!variant) return current
                      const next = { ...(variant.transform ?? IDENTITY_CHARACTER_TRANSFORM), [field]: value }
                      return sameTransform(variant.transform, next) ? current : setCharacterVariantTransform(current, variant.group, variant.id, next)
                    })
                  }}
                  onKeyDown={textKeys}
                />
              </label>)}
              {suggestion?.status === 'suggested' && <div className="col-span-3">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 w-full"
                  disabled={Boolean(busy)}
                  onClick={() => void runBusy('auto-fit', () => autoFitVariant(selectedVariant.group, selectedVariant.id))}
                >{t('characterDraft.transform.applySuggestedFit')}</Button>
                <p className="mt-1 text-[9px] leading-3 text-muted-foreground sm:text-[10px]">
                  {t(`characterDraft.transform.fitSource.${suggestion.source}`)} · {fitMetrics(t, suggestion).join(' · ')}
                </p>
              </div>}
              {suggestion && suggestion.status !== 'suggested' && <p className="col-span-3 text-[9px] leading-3 text-muted-foreground sm:text-[10px]">
                {t(suggestion.status === 'aligned' ? 'characterDraft.transform.fitAligned' : 'characterDraft.transform.fitUnavailable')}
              </p>}
            </div>}
            <label className="asset-upload-card">
              <span className="asset-upload-preview">{primaryAsset
                ? atlas && atlasSrc && atlas.data.frames[`${selectedVariant.group}-${selectedVariant.id}-${primaryLayer}`]
                  ? <CharacterAtlasFrameImage atlas={atlas} src={atlasSrc} frameId={`${selectedVariant.group}-${selectedVariant.id}-${primaryLayer}`} />
                  : <CharacterAssetImage blob={primaryAsset.blob} bounds={primaryAsset.inspection.visibleBounds} />
                : <CharacterVariantPlaceholder group={selectedVariant.group} variantId={selectedVariant.id} />}</span>
              <span>{t(layeredAccessory ? 'characterDraft.layers.primary' : `characterDraft.layers.${primaryLayer}`)}</span>
              {fileInput(selectedVariant, primaryLayer)}
            </label>
            {layeredAccessory && <label className="back-layer-upload">
              <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/40">{behindAsset
                ? atlas && atlasSrc && atlas.data.frames[`${selectedVariant.group}-${selectedVariant.id}-back`]
                  ? <CharacterAtlasFrameImage atlas={atlas} src={atlasSrc} frameId={`${selectedVariant.group}-${selectedVariant.id}-back`} />
                  : <CharacterAssetImage blob={behindAsset.blob} bounds={behindAsset.inspection.visibleBounds} />
                : <Layers2Icon className="size-5 text-muted-foreground" />}</span>
              <span className="min-w-0 truncate">{t('characterDraft.layers.behindOptional')}</span>
              {fileInput(selectedVariant, 'back')}
            </label>}
          </>
        })()}

        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        </div>
        <div className="workbench-footer">
          {missing.length > 0 && <p className="mb-2 text-muted-foreground">{t('characterDraft.missingRequired')}</p>}
          <TooltipProvider><div className="flex flex-wrap items-center gap-1">
            {iconAction(t('characterDraft.undo'), Undo2Icon, canUndo, () => void editor.undo())}
            {iconAction(t('characterDraft.redo'), Redo2Icon, canRedo, () => void editor.redo())}
            <DataControls exportData={exportCharacter} exportFilename="companion-character.zip" exportIconOnly exportLabel={t('draft.download')} />
            <Button size="sm" variant="outline" disabled={Boolean(busy) || !draft.name.trim()} onClick={() => void runBusy('save-as', saveAs)}>{busy === 'save-as' ? t('characterDraft.savingAs') : t('characterDraft.saveAs')}</Button>
          </div></TooltipProvider>
          <p role="status" title={saveError} className={`mt-1 ${saveStatus === 'failed' || saveStatus === 'conflict' ? 'text-destructive' : 'text-muted-foreground'}`}>
            {t(`characterDraft.status.${saveStatus}`)}
            {saveStatus === 'failed' && <> · <button type="button" className="underline" onClick={() => void editor.retry()}>{t('characterDraft.status.retry')}</button></>}
            {saveStatus === 'conflict' && <> · <button type="button" className="underline" onClick={() => void runBusy('reload', () => editor.reload())}>{t('characterDraft.status.reload')}</button> / <button type="button" className="underline" onClick={() => void runBusy('save-as', saveAs)}>{t('characterDraft.saveAs')}</button></>}
          </p>
        </div>
      </section>
      </div>
    </main>
  </div>
}
