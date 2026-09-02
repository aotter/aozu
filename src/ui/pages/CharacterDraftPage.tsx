import { ArrowLeftIcon, BotIcon, CircleSlash2Icon, ImagePlusIcon, Layers2Icon, PencilIcon, PlusIcon, ScanFaceIcon, ShapesIcon, ShirtIcon, SmileIcon, SparklesIcon, UserRoundIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router'

import { CHARACTER_CREATION_GROUPS, REQUIRED_CHARACTER_TARGETS, characterRegistrationFrame, hasCurrentCharacterLayer, isCharacterDraftAssetCurrent, resolveCharacterDraftLayers, resolveCharacterDraftReferenceLayers, transformCharacterBounds } from '@/core/application/character-creation.ts'
import { workspacePath, type WorkspaceDestination } from '@/core/application/workspace.ts'
import { IDENTITY_CHARACTER_TRANSFORM, type CharacterAssetTarget, type CharacterDraft, type CharacterDraftVariant, type CharacterTextureAtlas, type CharacterVariantGroup, type CharacterVariantLayer, type CharacterVariantTransform } from '@/core/domain/character.ts'
import { CharacterAlignmentRenderer, CharacterAssetImage, CharacterAtlasFrameImage, CharacterRenderer, CharacterSlotPlaceholder } from '@/ui/CharacterRenderer'
import { Button } from '@/ui/components/ui/button'
import { DataControls } from '@/ui/DataControls'
import { StatusPage } from '@/ui/pages/StatusPage'

type CharacterCategoryId = 'expressions' | 'outfits' | 'props'
type CharacterCategory = { id: CharacterCategoryId; group: CharacterVariantGroup; icon: ComponentType<{ className?: string }> }

const characterCategories: CharacterCategory[] = [
  { id: 'expressions', group: 'expression', icon: SmileIcon },
  { id: 'outfits', group: 'outfit', icon: ShirtIcon },
  { id: 'props', group: 'prop', icon: ShapesIcon },
]
const categoryDestinations: Record<CharacterCategoryId, WorkspaceDestination> = {
  expressions: 'character-expressions', outfits: 'character-outfits', props: 'character-props',
}
const expressionIcons = ['happy', 'sad', 'angry', 'surprised', 'sleepy']
const characterSlotIcon = (group: CharacterVariantGroup, variantId: string) => {
  if (group === 'expression') return `/assets/expression-placeholders/${expressionIcons.includes(variantId) ? variantId : 'happy'}.png`
  if (group === 'body') return '/assets/character-slots/body-base.png'
  return '/assets/character-slots/body-outfit.png'
}
const CharacterVariantPlaceholder = ({ group, variantId, label }: { group: CharacterVariantGroup; variantId: string; label?: string }) => group === 'expression'
  ? <img className="expression-placeholder" src={characterSlotIcon(group, variantId)} alt={label ?? ''} />
  : <CharacterSlotPlaceholder src={characterSlotIcon(group, variantId)} label={label} />
const variantKey = ({ group, id }: Pick<CharacterDraftVariant, 'group' | 'id'>) => `${group}:${id}`
const useBlobUrl = (blob?: Blob) => {
  const [src, setSrc] = useState<string>()
  useEffect(() => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    // oxlint-disable-next-line react/set-state-in-effect -- Object URLs are external browser resources.
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])
  return src
}

export function CharacterDraftPage({ openDraft, updateDraft, saveAsset, setVariantTransform, autoFitVariant, compileAtlas, exportDraft, onReview }: {
  openDraft(): Promise<CharacterDraft>
  updateDraft(draft: CharacterDraft): Promise<CharacterDraft>
  saveAsset(draft: CharacterDraft, target: CharacterAssetTarget, blob: Blob, filename: string): Promise<CharacterDraft>
  setVariantTransform(draft: CharacterDraft, group: CharacterVariantGroup, variantId: string, transform: CharacterVariantTransform): Promise<CharacterDraft>
  autoFitVariant(draft: CharacterDraft, group: CharacterVariantGroup, variantId: string): Promise<CharacterDraft>
  compileAtlas(draft: CharacterDraft): Promise<CharacterTextureAtlas | undefined>
  exportDraft(): Promise<Blob>
  onReview(draft: CharacterDraft): Promise<void>
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { draftId, step } = useParams()
  const category = characterCategories.find(({ id }) => id === step)
  const [draft, setDraft] = useState<CharacterDraft>()
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [compiled, setCompiled] = useState<{ updatedAt: number; atlas?: CharacterTextureAtlas }>()
  const [selectedVariantKey, setSelectedVariantKey] = useState<string>()
  const [alignmentMode, setAlignmentMode] = useState<'composite' | 'overlay' | 'difference' | 'diagnostic'>('overlay')
  const compiledAt = useRef<number | undefined>(undefined)
  const drag = useRef<{
    draft: CharacterDraft
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
    let active = true
    const refresh = () => void openDraft()
      .then((next) => { if (active) setDraft(next) })
      .catch(() => { if (active) setLoadError(true) })
    refresh()
    window.addEventListener('character-draft-updated', refresh)
    return () => {
      active = false
      window.removeEventListener('character-draft-updated', refresh)
    }
  }, [openDraft])

  useEffect(() => {
    if (!draft || compiledAt.current === draft.updatedAt) return
    compiledAt.current = draft.updatedAt
    let active = true
    void compileAtlas(draft)
      .then((atlas) => { if (active) setCompiled({ updatedAt: draft.updatedAt, atlas }) })
      .catch((caught) => {
        console.error('Character atlas compile failed', caught)
        if (active) setCompiled({ updatedAt: draft.updatedAt })
      })
    return () => { active = false }
  }, [compileAtlas, draft])

  const atlas = draft && compiled?.updatedAt === draft.updatedAt ? compiled.atlas : undefined
  const atlasSrc = useBlobUrl(atlas?.image)

  if (!step || step === 'identity' || step === 'accessories') return <Navigate to={workspacePath('character-expressions', draftId)} state={location.state} replace />
  if (!category) return <Navigate to={workspacePath('character-expressions', draftId)} state={location.state} replace />
  if (loadError) return <StatusPage>{t('startup.error')}</StatusPage>
  if (!draft) return <StatusPage>{t('startup.loading')}</StatusPage>

  const missing = REQUIRED_CHARACTER_TARGETS.filter((target) => !hasCurrentCharacterLayer(draft, target.group, target.variantId, target.layer))
  const visibleVariants = category ? draft.variants.filter(({ group }) => category.group === group) : []
  const bodyVariant = draft.variants.find(({ group, id }) => group === 'body' && id === 'base')!
  const nameConfirmed = draft.nameConfirmed ?? draft.name !== 'My Companion'
  const selectedVariant = draft.variants.find((variant) => variantKey(variant) === selectedVariantKey)
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
  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggable || !selectedVariant) return
    const bounds = event.currentTarget.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      draft,
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
    if (!active || active.pointerId !== event.pointerId) return
    const next = {
      ...active.origin,
      x: Math.max(-512, Math.min(512, Math.round(active.origin.x + (event.clientX - active.startX) / active.width * 512))),
      y: Math.max(-768, Math.min(768, Math.round(active.origin.y + (event.clientY - active.startY) / active.height * 768))),
    }
    active.current = next
    setDraft((current) => current && ({
      ...current,
      variants: current.variants.map((variant) => variant.group === active.group && variant.id === active.variantId
        ? { ...variant, transform: next } : variant),
    }))
  }
  const finishDrag = async (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    drag.current = undefined
    event.currentTarget.releasePointerCapture(event.pointerId)
    try { setDraft(await setVariantTransform(active.draft, active.group, active.variantId, active.current)); setError(undefined) }
    catch (caught) { setDraft(active.draft); setError(caught instanceof Error ? caught.message : String(caught)) }
  }
  const persist = (next: CharacterDraft) => { setDraft(next); void updateDraft(next) }
  const activateVariant = (source: CharacterDraft, variant: CharacterDraftVariant) => {
    const { group, id } = variant
    if (group === 'body') return source
    if (group === 'expression') return { ...source, selected: { ...source.selected, expression: id } }
    if (group === 'prop') return source.selected.props.includes(id) ? source : { ...source, selected: { ...source.selected, props: [...source.selected.props, id] } }
    return { ...source, selected: { ...source.selected, [group]: id } }
  }
  const selectedId = (group: CharacterVariantGroup) => {
    if (group === 'body') return undefined
    if (group === 'expression') return draft.selected.expression
    if (group === 'outfit') return draft.selected.outfit
    return undefined
  }
  const selectVariant = (variant: CharacterDraftVariant) => persist(activateVariant(draft, variant))
  const clearVariant = (group: CharacterVariantGroup) => {
    if (group === 'expression') persist({ ...draft, selected: { ...draft.selected, expression: undefined } })
    if (group === 'outfit') persist({ ...draft, selected: { ...draft.selected, outfit: undefined } })
    if (group === 'prop') persist({ ...draft, selected: { ...draft.selected, props: [] } })
  }
  const isSelected = (variant: CharacterDraftVariant) => variant.group === 'prop' ? draft.selected.props.includes(variant.id) : selectedId(variant.group) === variant.id
  const toggleVariant = (variant: CharacterDraftVariant) => {
    if (variant.group !== 'prop' || !isSelected(variant)) return selectVariant(variant)
    persist({ ...draft, selected: { ...draft.selected, props: draft.selected.props.filter((id) => id !== variant.id) } })
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
    setSelectedVariantKey(variantKey(variant))
    persist({ ...draft, variants: [...draft.variants, variant] })
  }
  const fileInput = (variant: CharacterDraftVariant, layer: CharacterVariantLayer) => {
    const targetKey = `${variantKey(variant)}:${layer}`
    return <input className="sr-only" type="file" accept="image/png" disabled={Boolean(busy)} onChange={async (event) => {
        const file = event.target.files?.[0]
        if (!file) return
        setBusy(targetKey); setError(undefined)
        try {
          let next = await saveAsset(draft, { group: variant.group, variantId: variant.id, label: variant.label, layer }, file, file.name)
          if (variant.group !== 'body' && layer !== 'back') {
            next = activateVariant(next, variant)
            await updateDraft(next)
          }
          setDraft(next)
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : String(caught))
        } finally {
          setBusy(undefined); event.target.value = ''
        }
      }} />
  }

  const commitName = async () => {
    let next = draft
    const happy = draft.variants.find(({ group, id }) => group === 'expression' && id === 'happy')
    if (nameConfirmed && draft.name.trim() && !draft.selected.expression && happy && isCharacterDraftAssetCurrent(draft, happy, 'head')) next = activateVariant(draft, happy)
    setDraft(await updateDraft(next))
  }

  return <div className="draft-workshop-shell bg-muted/30">
    <main className="draft-workshop mx-auto w-full max-w-6xl p-3 sm:p-6">
      <aside className="character-spell-guide" aria-labelledby="character-spell-title">
        <div className="spell-icon"><BotIcon aria-hidden="true" /></div>
        <div className="min-w-0 flex-1">
          <p className="forge-kicker"><SparklesIcon aria-hidden="true" /> WEBMCP CHARACTER FORGE</p>
          <h1 id="character-spell-title" className="font-heading text-2xl font-semibold">{t('characterDraft.webmcpTitle')}</h1>
          <p>{t('characterDraft.webmcpInstruction')}</p>
          <blockquote>{t('characterDraft.webmcpSpell')}</blockquote>
        </div>
        <ol className="spell-workflow">
          <li><UserRoundIcon aria-hidden="true" /><span>{t('characterDraft.webmcpBody')}</span></li>
          <li><ScanFaceIcon aria-hidden="true" /><span>{t('characterDraft.webmcpExpressions')}</span></li>
          <li><ImagePlusIcon aria-hidden="true" /><span>{t('characterDraft.webmcpAccessories')}</span></li>
        </ol>
      </aside>

      <div className="draft-workshop-grid mt-4">
      <section className={`character-stage-panel rounded-2xl border bg-background ${nameConfirmed && draft.name.trim() ? 'is-awake' : ''}`}>
        <div className="character-stage-heading">
          <div><span>01</span><strong>{t('characterDraft.fullBodyTitle')}</strong></div>
          {nameConfirmed && draft.name.trim() && <p>{draft.name}</p>}
        </div>
        <div className="character-stage-canvas">
          <div
            className={`aspect-2/3 h-full max-h-full max-w-full ${draggable ? 'cursor-move touch-none' : ''}`}
            title={draggable ? t('characterDraft.transform.dragHead') : undefined}
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={(event) => void finishDrag(event)}
            onPointerCancel={(event) => void finishDrag(event)}
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
            : <CharacterRenderer label={nameConfirmed ? draft.name : t('characterDraft.unnamed')} layers={previewLayers} atlas={atlas} />}</div>
        </div>
        {selectedVariant && selectedAsset && <div className="alignment-switch" aria-label={t('characterDraft.alignment.label')}>
          {(['composite', 'overlay', 'difference', 'diagnostic'] as const).map((mode) => <Button key={mode} type="button" size="sm" variant={alignmentMode === mode ? 'secondary' : 'ghost'} onClick={() => setAlignmentMode(mode)}>{t(`characterDraft.alignment.${mode}`)}</Button>)}
        </div>}
        <div className="character-first-dialogue">
          <span className="dialogue-portrait"><UserRoundIcon aria-hidden="true" /></span>
          <label className="min-w-0 flex-1">
            <span>{nameConfirmed && draft.name.trim() ? t('characterDraft.namedQuestion') : t('characterDraft.nameQuestion')}</span>
            <input aria-label={t('draft.name')} placeholder={t('characterDraft.namePlaceholder')} value={nameConfirmed ? draft.name : ''} onChange={(event) => setDraft({ ...draft, name: event.target.value, nameConfirmed: true })} onBlur={() => void commitName()} />
          </label>
        </div>
      </section>

      <section className="doll-workbench rounded-2xl border bg-background" aria-label={t('characterDraft.customizeTitle')}>
        <div className="workbench-heading"><span>02</span><div><h2>{t('characterDraft.customizeTitle')}</h2><p>{t('characterDraft.workbenchDescription')}</p></div></div>
        {!selectedVariant && <button type="button" className="body-foundation-card" onClick={() => setSelectedVariantKey(variantKey(bodyVariant))}>
          <span className="body-foundation-preview">{isCharacterDraftAssetCurrent(draft, bodyVariant, 'body')
            ? <CharacterAssetImage blob={bodyVariant.layers.body!.blob} label={bodyVariant.label} />
            : <img src="/assets/placeholders/companion-body.png" alt="" />}</span>
          <span><strong>{t('characterDraft.baseBody')}</strong><small>{t('characterDraft.baseBodyHint')}</small></span>
          <PencilIcon aria-hidden="true" />
        </button>}

        {!selectedVariant && <nav aria-label={t('characterDraft.categorySwitcher')} className="workbench-tabs">
          {characterCategories.map(({ id, icon: Icon }) => <Button
            key={id}
            type="button"
            variant={category?.id === id ? 'secondary' : 'ghost'}
            className="shrink-0"
            aria-current={category?.id === id ? 'page' : undefined}
            onClick={() => { setSelectedVariantKey(undefined); navigate(workspacePath(categoryDestinations[id], draft.id), { replace: true, state: location.state }) }}
          >
            <Icon className="size-4" />
            <span>{t(`characterDraft.categories.${id}`)}</span>
          </Button>)}
        </nav>}

        <div className="workbench-content">
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
                  <span className="variant-preview">{thumbnail
                    ? atlas && atlasSrc && frameId && atlas.data.frames[frameId]
                      ? <CharacterAtlasFrameImage atlas={atlas} src={atlasSrc} frameId={frameId} label={variant.label} />
                      : <CharacterAssetImage blob={thumbnail.blob} label={variant.label} />
                    : variant.group === 'prop' ? <ShapesIcon className="size-1/2 text-[#7b739e]/70" />
                      : <CharacterVariantPlaceholder group={variant.group} variantId={variant.id} label={variant.label} />}</span><span className="variant-label">{variant.label}</span>
                </button>
                <button type="button" title={t('characterDraft.editVariant', { name: variant.label })} className="variant-edit" aria-label={t('characterDraft.editVariant', { name: variant.label })} onClick={() => setSelectedVariantKey(variantKey(variant))}><PencilIcon className="size-4" /></button>
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
          const PlaceholderIcon = selectedVariant.group === 'prop' ? ShapesIcon : undefined
          const required = REQUIRED_CHARACTER_TARGETS.some((target) => target.group === selectedVariant.group && target.variantId === selectedVariant.id)
          const transform = selectedVariant.transform ?? IDENTITY_CHARACTER_TRANSFORM
          const changeTransform = (field: keyof CharacterVariantTransform, value: number) => {
            if (!Number.isFinite(value)) return
            setDraft({
              ...draft,
              variants: draft.variants.map((variant) => variant === selectedVariant
                ? { ...variant, transform: { ...transform, [field]: value } }
                : variant),
            })
          }
          const commitTransform = async () => {
            const current = draft.variants.find((variant) => variantKey(variant) === variantKey(selectedVariant))!
            try { setDraft(await setVariantTransform(draft, current.group, current.id, current.transform ?? IDENTITY_CHARACTER_TRANSFORM)); setError(undefined) }
            catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) }
          }
          return <>
            <div className="variant-editor-heading">
              <Button type="button" size="icon" variant="ghost" aria-label={t('characterDraft.backToVariants')} onClick={() => setSelectedVariantKey(undefined)}><ArrowLeftIcon /></Button>
              <input aria-label={t('characterDraft.variantLabel')} value={selectedVariant.label} onChange={(event) => setDraft({ ...draft, variants: draft.variants.map((variant) => variant === selectedVariant ? { ...variant, label: event.target.value } : variant) })} onBlur={() => void updateDraft(draft)} />
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
                  onBlur={() => void commitTransform()}
                />
              </label>)}
              {(selectedVariant.group === 'outfit' || selectedVariant.group === 'expression') && <Button
                type="button"
                size="sm"
                variant="secondary"
                className="col-span-3"
                disabled={Boolean(busy)}
                onClick={async () => {
                  setBusy('auto-fit'); setError(undefined)
                  try { setDraft(await autoFitVariant(draft, selectedVariant.group, selectedVariant.id)) }
                  catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) }
                  finally { setBusy(undefined) }
                }}
              >{t(registration.head?.variantId === selectedVariant.id ? 'characterDraft.transform.visualFit' : 'characterDraft.transform.autoFit')}</Button>}
            </div>}
            <label className="asset-upload-card">
              <span className="asset-upload-preview">{primaryAsset
                ? atlas && atlasSrc && atlas.data.frames[`${selectedVariant.group}-${selectedVariant.id}-${primaryLayer}`]
                  ? <CharacterAtlasFrameImage atlas={atlas} src={atlasSrc} frameId={`${selectedVariant.group}-${selectedVariant.id}-${primaryLayer}`} />
                  : <CharacterAssetImage blob={primaryAsset.blob} />
                : PlaceholderIcon ? <PlaceholderIcon className="size-1/2 text-[#7b739e]/70" />
                  : <CharacterVariantPlaceholder group={selectedVariant.group} variantId={selectedVariant.id} />}</span>
              <span>{t(layeredAccessory ? 'characterDraft.layers.primary' : `characterDraft.layers.${primaryLayer}`)}</span>
              {fileInput(selectedVariant, primaryLayer)}
            </label>
            {layeredAccessory && <label className="back-layer-upload">
              <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/40">{behindAsset
                ? atlas && atlasSrc && atlas.data.frames[`${selectedVariant.group}-${selectedVariant.id}-back`]
                  ? <CharacterAtlasFrameImage atlas={atlas} src={atlasSrc} frameId={`${selectedVariant.group}-${selectedVariant.id}-back`} />
                  : <CharacterAssetImage blob={behindAsset.blob} />
                : <Layers2Icon className="size-5 text-[#7b739e]/70" />}</span>
              <span className="min-w-0 truncate">{t('characterDraft.layers.behindOptional')}</span>
              {fileInput(selectedVariant, 'back')}
            </label>}
          </>
        })()}

        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        </div>
        <div className="workbench-footer">
          {missing.length > 0 && <p className="mb-2 text-muted-foreground">{t('characterDraft.missingRequired')}</p>}
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
          <DataControls exportData={exportDraft} exportFilename="companion-character-draft.zip" exportIconOnly exportLabel={t('draft.download')} />
          <Button size="sm" className="w-full" disabled={Boolean(busy) || Boolean(missing.length) || !nameConfirmed || !draft.name.trim()} onClick={async () => {
            setBusy('review'); setError(undefined)
            try { await onReview(await updateDraft(draft)) }
            catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); setBusy(undefined) }
          }}>{busy === 'review' ? t('characterDraft.validating') : t('common.continue')}</Button>
          </div>
        </div>
      </section>
      </div>
    </main>
  </div>
}
