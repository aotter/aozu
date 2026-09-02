import { ArrowLeftIcon, CircleSlash2Icon, Layers2Icon, PencilIcon, PlusIcon, ShapesIcon, ShirtIcon, SmileIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router'

import { CHARACTER_CREATION_GROUPS, REQUIRED_CHARACTER_TARGETS, characterRegistrationFrame, hasCurrentCharacterLayer, isCharacterDraftAssetCurrent, resolveCharacterDraftLayers, resolveCharacterDraftReferenceLayers, transformCharacterBounds } from '@/core/application/character-creation.ts'
import { IDENTITY_CHARACTER_TRANSFORM, type CharacterAssetTarget, type CharacterDraft, type CharacterDraftVariant, type CharacterVariantGroup, type CharacterVariantLayer, type CharacterVariantTransform } from '@/core/domain/character.ts'
import { CharacterAlignmentRenderer, CharacterAssetImage, CharacterRenderer, CharacterSlotPlaceholder } from '@/ui/CharacterRenderer'
import { Button } from '@/ui/components/ui/button'
import { StatusPage } from '@/ui/pages/StatusPage'

type CharacterCategoryId = 'expressions' | 'outfits' | 'props'
type CharacterCategory = { id: CharacterCategoryId; group: CharacterVariantGroup; icon: ComponentType<{ className?: string }> }

const characterCategories: CharacterCategory[] = [
  { id: 'expressions', group: 'expression', icon: SmileIcon },
  { id: 'outfits', group: 'outfit', icon: ShirtIcon },
  { id: 'props', group: 'prop', icon: ShapesIcon },
]
const expressionIcons = ['happy', 'sad', 'angry', 'surprised', 'sleepy']
const characterSlotIcon = (group: CharacterVariantGroup, variantId: string) => {
  if (group === 'expression') return `/assets/character-slots/expression-${expressionIcons.includes(variantId) ? variantId : 'happy'}.png`
  if (group === 'body') return '/assets/character-slots/body-base.png'
  return '/assets/character-slots/body-outfit.png'
}
const variantKey = ({ group, id }: Pick<CharacterDraftVariant, 'group' | 'id'>) => `${group}:${id}`

export function CharacterDraftPage({ openDraft, updateDraft, saveAsset, setVariantTransform, autoFitVariant, onReview }: {
  openDraft(): Promise<CharacterDraft>
  updateDraft(draft: CharacterDraft): Promise<CharacterDraft>
  saveAsset(draft: CharacterDraft, target: CharacterAssetTarget, blob: Blob, filename: string): Promise<CharacterDraft>
  setVariantTransform(draft: CharacterDraft, group: CharacterVariantGroup, variantId: string, transform: CharacterVariantTransform): Promise<CharacterDraft>
  autoFitVariant(draft: CharacterDraft, group: CharacterVariantGroup, variantId: string): Promise<CharacterDraft>
  onReview(draft: CharacterDraft): Promise<void>
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { step } = useParams()
  const category = characterCategories.find(({ id }) => id === step)
  const [draft, setDraft] = useState<CharacterDraft>()
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [selectedVariantKey, setSelectedVariantKey] = useState<string>()
  const [alignmentMode, setAlignmentMode] = useState<'composite' | 'overlay' | 'difference' | 'diagnostic'>('overlay')
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

  if (!step || step === 'identity' || step === 'accessories') return <Navigate to="/character/expressions" state={location.state} replace />
  if (!category) return <Navigate to="/character/expressions" state={location.state} replace />
  if (loadError) return <StatusPage>{t('startup.error')}</StatusPage>
  if (!draft) return <StatusPage>{t('startup.loading')}</StatusPage>

  const missing = REQUIRED_CHARACTER_TARGETS.filter((target) => !hasCurrentCharacterLayer(draft, target.group, target.variantId, target.layer))
  const visibleVariants = category ? draft.variants.filter(({ group }) => category.group === group) : []
  const selectedVariant = visibleVariants.find((variant) => variantKey(variant) === selectedVariantKey)
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

  return <div className="h-[calc(100svh-3.5rem)] overflow-hidden bg-muted/30">
    <main className="mx-auto grid h-[calc(100svh-3.5rem)] w-full max-w-5xl grid-cols-[minmax(0,2fr)_minmax(7rem,1fr)] gap-2 p-2 sm:w-[calc(100%-4rem)] sm:gap-4 sm:p-4 lg:w-[calc(100%-8rem)]">
      <section className="flex min-h-0 min-w-0 flex-col rounded-2xl border bg-background p-2 sm:p-4">
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          <div
            className={`aspect-2/3 h-full max-h-full max-w-full ${draggable ? 'cursor-move touch-none' : ''}`}
            title={draggable ? t('characterDraft.transform.dragHead') : undefined}
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={(event) => void finishDrag(event)}
            onPointerCancel={(event) => void finishDrag(event)}
          >{selectedVariant
            ? <CharacterAlignmentRenderer
                label={draft.name}
                candidateLayers={previewLayers}
                referenceLayers={referenceLayers}
                mode={alignmentMode}
                candidateBounds={candidateBounds}
                referenceBounds={referenceBounds}
                footLine={registration.footLine}
              />
            : <CharacterRenderer label={draft.name} layers={previewLayers} />}</div>
        </div>
        {selectedVariant && <div className="mt-2 grid grid-cols-4 gap-1" aria-label={t('characterDraft.alignment.label')}>
          {(['composite', 'overlay', 'difference', 'diagnostic'] as const).map((mode) => <Button key={mode} type="button" size="sm" variant={alignmentMode === mode ? 'secondary' : 'ghost'} className="h-7 px-1 text-[10px] sm:text-xs" onClick={() => setAlignmentMode(mode)}>{t(`characterDraft.alignment.${mode}`)}</Button>)}
        </div>}
        <label className="mt-2 min-w-0">
          <span className="sr-only">{t('draft.name')}</span>
          <input className="h-9 w-full rounded-md border bg-background px-2 text-sm" aria-label={t('draft.name')} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} onBlur={() => void updateDraft(draft)} />
        </label>
      </section>

      <section className="flex min-h-0 min-w-0 flex-col rounded-2xl border bg-background p-1.5 sm:p-4" aria-label={t('characterDraft.customizeTitle')}>
        <nav aria-label={t('characterDraft.categorySwitcher')} className="flex shrink-0 gap-1 border-b bg-background pb-2 sm:gap-2">
          {characterCategories.map(({ id, icon: Icon }) => <Button
            key={id}
            type="button"
            variant={category?.id === id ? 'secondary' : 'ghost'}
            size="icon"
            className="size-8 shrink-0 rounded-lg sm:size-9"
            aria-current={category?.id === id ? 'page' : undefined}
            onClick={() => { setSelectedVariantKey(undefined); navigate(`/character/${id}`, { replace: true, state: location.state }) }}
          >
            <Icon className="size-4" />
            <span className="sr-only">{t(`characterDraft.categories.${id}`)}</span>
          </Button>)}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!selectedVariant && <>
          <h2 className="mt-1 truncate text-sm font-medium sm:text-lg">{t(`characterDraft.categories.${category.id}`)}</h2>
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:mt-4 sm:gap-3">
            <button type="button" aria-label={t('characterDraft.none')} title={t('characterDraft.none')} aria-pressed={!hasSelection(category.group)} className={`relative aspect-square min-w-0 overflow-hidden rounded-xl border bg-background transition-colors hover:border-foreground/40 ${!hasSelection(category.group) ? 'border-foreground ring-1 ring-foreground' : ''}`} onClick={() => clearVariant(category.group)}>
              <span className="flex aspect-square items-center justify-center bg-muted/40"><CircleSlash2Icon className="size-1/3 text-muted-foreground" /></span>
            </button>
            {visibleVariants.map((variant) => {
              const group = CHARACTER_CREATION_GROUPS.find(({ group }) => group === variant.group)!
              const thumbnail = variant.layers.front && isCharacterDraftAssetCurrent(draft, variant, 'front')
                ? variant.layers.front
                : group.layers.map((layer) => isCharacterDraftAssetCurrent(draft, variant, layer) ? variant.layers[layer] : undefined).find(Boolean)
              const selected = isSelected(variant)
              return <div key={variantKey(variant)} className={`relative min-w-0 overflow-hidden rounded-xl border bg-background transition-colors hover:border-foreground/40 ${selected ? 'border-foreground ring-1 ring-foreground' : ''}`}>
                <button type="button" aria-label={variant.label} title={variant.label} aria-pressed={selected} className="block w-full" onClick={() => toggleVariant(variant)}>
                  <span className="flex aspect-square items-center justify-center bg-muted/40 p-1 sm:p-2">{thumbnail
                    ? <CharacterAssetImage blob={thumbnail.blob} label={variant.label} />
                    : variant.group === 'prop' ? <ShapesIcon className="size-1/2 text-[#7b739e]/70" />
                      : <CharacterSlotPlaceholder src={characterSlotIcon(variant.group, variant.id)} label={variant.label} />}</span>
                </button>
                <button type="button" title={t('characterDraft.editVariant', { name: variant.label })} className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-md border bg-background/90 text-muted-foreground hover:text-foreground" aria-label={t('characterDraft.editVariant', { name: variant.label })} onClick={() => setSelectedVariantKey(variantKey(variant))}><PencilIcon className="size-3.5" /></button>
              </div>
            })}
            <button type="button" title={t(`characterDraft.groups.${category.group}.add`)} className="flex aspect-square items-center justify-center rounded-xl border border-dashed text-muted-foreground hover:border-foreground/40 hover:text-foreground" aria-label={t(`characterDraft.groups.${category.group}.add`)} onClick={() => addVariant(category.group)}>
              <PlusIcon className="size-5" />
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
            <div className="mt-1 flex items-center gap-1 sm:gap-2">
              <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0" aria-label={t('characterDraft.backToVariants')} onClick={() => setSelectedVariantKey(undefined)}><ArrowLeftIcon /></Button>
              <input aria-label={t('characterDraft.variantLabel')} className="min-w-0 flex-1 rounded-md border-0 bg-transparent px-1 py-1 text-xs font-medium sm:text-sm" value={selectedVariant.label} onChange={(event) => setDraft({ ...draft, variants: draft.variants.map((variant) => variant === selectedVariant ? { ...variant, label: event.target.value } : variant) })} onBlur={() => void updateDraft(draft)} />
              {required && <span className="text-[9px] text-muted-foreground sm:text-xs">{t('characterDraft.required')}</span>}
            </div>
            {(primaryAsset || behindAsset) && <div className="mt-2 grid grid-cols-3 gap-1" aria-label={t('characterDraft.transform.label')}>
              {(['x', 'y', 'scale'] as const).map((field) => <label key={field} className="min-w-0 text-[9px] text-muted-foreground sm:text-xs">
                <span className="sr-only">{t(`characterDraft.transform.${field}`)}</span>
                <input
                  type="number"
                  step={field === 'scale' ? 0.01 : 1}
                  min={field === 'scale' ? 0.25 : field === 'x' ? -512 : -768}
                  max={field === 'scale' ? 4 : field === 'x' ? 512 : 768}
                  aria-label={t(`characterDraft.transform.${field}`)}
                  title={t(`characterDraft.transform.${field}`)}
                  className="h-8 w-full rounded-md border bg-background px-1 text-center text-xs text-foreground"
                  value={transform[field]}
                  onChange={(event) => changeTransform(field, Number(event.target.value))}
                  onBlur={() => void commitTransform()}
                />
              </label>)}
              {(selectedVariant.group === 'outfit' || selectedVariant.group === 'expression') && <Button
                type="button"
                size="sm"
                variant="secondary"
                className="col-span-3 h-8"
                disabled={Boolean(busy)}
                onClick={async () => {
                  setBusy('auto-fit'); setError(undefined)
                  try { setDraft(await autoFitVariant(draft, selectedVariant.group, selectedVariant.id)) }
                  catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) }
                  finally { setBusy(undefined) }
                }}
              >{t(registration.head?.variantId === selectedVariant.id ? 'characterDraft.transform.visualFit' : 'characterDraft.transform.autoFit')}</Button>}
            </div>}
            <label className="mt-2 block cursor-pointer overflow-hidden rounded-xl border hover:border-foreground/40 sm:mt-4">
              <span className="flex aspect-square items-center justify-center bg-muted/40 p-2">{primaryAsset
                ? <CharacterAssetImage blob={primaryAsset.blob} />
                : PlaceholderIcon ? <PlaceholderIcon className="size-1/2 text-[#7b739e]/70" />
                  : <CharacterSlotPlaceholder src={characterSlotIcon(selectedVariant.group, selectedVariant.id)} />}</span>
              <span className="block truncate p-1.5 text-[10px] sm:p-2 sm:text-xs">{t(layeredAccessory ? 'characterDraft.layers.primary' : `characterDraft.layers.${primaryLayer}`)}</span>
              {fileInput(selectedVariant, primaryLayer)}
            </label>
            {layeredAccessory && <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed p-2 hover:border-foreground/40">
              <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/40">{behindAsset ? <CharacterAssetImage blob={behindAsset.blob} /> : <Layers2Icon className="size-5 text-[#7b739e]/70" />}</span>
              <span className="min-w-0 truncate text-[9px] sm:text-xs">{t('characterDraft.layers.behindOptional')}</span>
              {fileInput(selectedVariant, 'back')}
            </label>}
          </>
        })()}

        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        </div>
        <div className="shrink-0 border-t pt-2">
          {missing.length > 0 && <p className="mb-2 text-[10px] leading-4 text-muted-foreground sm:text-xs">{t('characterDraft.missingRequired')}</p>}
          <Button size="sm" className="w-full" disabled={Boolean(busy) || Boolean(missing.length) || !draft.name.trim()} onClick={async () => {
            setBusy('review'); setError(undefined)
            try { await onReview(await updateDraft(draft)) }
            catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); setBusy(undefined) }
          }}>{busy === 'review' ? t('characterDraft.validating') : t('common.continue')}</Button>
        </div>
      </section>
    </main>
  </div>
}
