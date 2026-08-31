import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router'

import { CHARACTER_CREATION_GROUPS, REQUIRED_CHARACTER_TARGETS, resolveCharacterDraftLayers } from '@/core/application/character-creation.ts'
import type { CharacterAssetTarget, CharacterDraft, CharacterVariantGroup, CharacterVariantLayer } from '@/core/domain/character.ts'
import { AppHeader } from '@/ui/AppHeader'
import { CharacterAssetImage, CharacterRenderer, CharacterSlotPlaceholder } from '@/ui/CharacterRenderer'
import { Button } from '@/ui/components/ui/button'
import { StatusPage } from '@/ui/pages/StatusPage'

type CharacterStepId = 'identity' | 'expressions' | 'outfits' | 'accessories' | 'review'

const characterDraftSteps: Array<{ id: CharacterStepId; groups: CharacterVariantGroup[] }> = [
  { id: 'identity', groups: ['body'] },
  { id: 'expressions', groups: ['expression'] },
  { id: 'outfits', groups: ['outfit'] },
  { id: 'accessories', groups: ['headwear', 'prop'] },
  { id: 'review', groups: [] },
]
const expressionIcons = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'sleepy']
const characterSlotIcon = (group: CharacterVariantGroup, variantId: string, layer: CharacterVariantLayer) => {
  if (group === 'expression') return `/assets/character-slots/expression-${expressionIcons.includes(variantId) ? variantId : 'neutral'}.png`
  if (group === 'body') return '/assets/character-slots/body-base.png'
  if (group === 'outfit') return '/assets/character-slots/body-outfit.png'
  return `/assets/character-slots/${group}-${layer}.png`
}

export function CharacterDraftPage({ webmcpAvailable, openDraft, updateDraft, saveAsset, onReview, onCancel }: {
  webmcpAvailable: boolean
  openDraft(): Promise<CharacterDraft>
  updateDraft(draft: CharacterDraft): Promise<CharacterDraft>
  saveAsset(draft: CharacterDraft, target: CharacterAssetTarget, blob: Blob, filename: string): Promise<CharacterDraft>
  onReview(draft: CharacterDraft): Promise<void>
  onCancel(): void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { step } = useParams()
  const stepIndex = characterDraftSteps.findIndex(({ id }) => id === step)
  const currentStep = characterDraftSteps[stepIndex]
  const [draft, setDraft] = useState<CharacterDraft>()
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()

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

  if (stepIndex < 0) return <Navigate to="/character/identity" replace />
  if (loadError) return <StatusPage>{t('startup.error')}</StatusPage>
  if (!draft) return <StatusPage>{t('startup.loading')}</StatusPage>

  const previewLayers = resolveCharacterDraftLayers(draft)
  const missing = REQUIRED_CHARACTER_TARGETS.filter((target) => !draft.variants
    .find(({ group, id }) => group === target.group && id === target.variantId)?.layers[target.layer])
  const persist = (next: CharacterDraft) => { setDraft(next); void updateDraft(next) }
  const selectVariant = (group: CharacterVariantGroup, id: string) => {
    if (group === 'body') return persist({ ...draft, selected: { ...draft.selected, outfit: undefined } })
    if (group === 'expression') return persist({ ...draft, selected: { ...draft.selected, expression: id } })
    persist({ ...draft, selected: { ...draft.selected, [group]: draft.selected[group] === id ? undefined : id } })
  }
  const addVariant = (group: CharacterVariantGroup) => {
    const count = draft.variants.filter((variant) => variant.group === group).length + 1
    persist({
      ...draft,
      variants: [...draft.variants, {
        group,
        id: `${group}-${crypto.randomUUID().slice(0, 8)}`,
        label: `${t(`characterDraft.groups.${group}.variantName`)} ${count}`,
        layers: {},
      }],
    })
  }
  const goToStep = (index: number) => navigate(`/character/${characterDraftSteps[index].id}`)

  return <div className="min-h-svh bg-muted/30">
    <AppHeader
      title={draft.name}
      webmcpAvailable={webmcpAvailable}
      back={<Button type="button" size="sm" variant="ghost" disabled={Boolean(busy)} onClick={onCancel}>{t('common.back')}</Button>}
    />
    <main className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
      <section className="lg:sticky lg:top-22 lg:self-start">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{t('characterDraft.title')}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('characterDraft.description')}</p>
        <div className="mx-auto mt-6 w-full max-w-56 lg:max-w-none"><CharacterRenderer label={draft.name} layers={previewLayers} /></div>
        <label className="mt-5 grid gap-1.5 text-sm">
          <span>{t('draft.name')}</span>
          <input className="rounded-md border bg-background px-3 py-2" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} onBlur={() => void updateDraft(draft)} />
        </label>
      </section>

      <section className="min-w-0" aria-labelledby="asset-grid-title">
        <div role="tablist" aria-label={t('characterDraft.steps.label')} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-2">
          {characterDraftSteps.map(({ id }, index) => <Button
            key={id}
            id={`character-step-${id}`}
            type="button"
            role="tab"
            variant={stepIndex === index ? 'secondary' : 'ghost'}
            aria-selected={stepIndex === index}
            aria-controls="character-step-panel"
            onClick={() => goToStep(index)}
          >{index + 1}. {t(`characterDraft.steps.${id}`)}</Button>)}
        </div>
        <div id="character-step-panel" role="tabpanel" aria-labelledby={`character-step-${currentStep.id}`}>
          <h2 id="asset-grid-title" className="font-heading text-xl font-medium">{t('characterDraft.assetsTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t(webmcpAvailable ? 'characterDraft.agentReady' : 'characterDraft.agentUnavailable')}</p>
          {CHARACTER_CREATION_GROUPS.filter(({ group }) => currentStep.groups.includes(group)).map(({ group, layers, addable }) => {
            const variants = draft.variants.filter((variant) => variant.group === group)
            return <section key={group} className="mt-7" aria-labelledby={`character-group-${group}`}>
              <div className="flex items-end justify-between gap-3">
                <div><h3 id={`character-group-${group}`} className="font-heading font-medium">{t(`characterDraft.groups.${group}.title`)}</h3><p className="mt-1 text-xs text-muted-foreground">{t(`characterDraft.groups.${group}.description`)}</p></div>
                {addable && <Button type="button" size="sm" variant="outline" onClick={() => addVariant(group)}>{t(`characterDraft.groups.${group}.add`)}</Button>}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {variants.map((variant) => {
                  const required = REQUIRED_CHARACTER_TARGETS.some((target) => target.group === group && target.variantId === variant.id)
                  const selected = group === 'body' ? !draft.selected.outfit : group === 'expression'
                    ? draft.selected.expression === variant.id : draft.selected[group] === variant.id
                  const filled = layers.some((layer) => Boolean(variant.layers[layer]))
                  return <article key={`${group}:${variant.id}`} className="flex min-h-56 flex-col rounded-2xl border bg-background p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2"><input aria-label={t('characterDraft.variantLabel')} className="min-w-0 flex-1 rounded-md border-0 bg-transparent px-1 py-0.5 text-sm font-medium" value={variant.label} onChange={(event) => setDraft({ ...draft, variants: draft.variants.map((item) => item === variant ? { ...item, label: event.target.value } : item) })} onBlur={() => void updateDraft(draft)} />{required && <span className="text-xs text-muted-foreground">{t('characterDraft.required')}</span>}</div>
                    <div className={`mt-3 grid gap-2 ${layers.length > 1 ? 'grid-cols-2' : ''}`}>
                      {layers.map((layer) => {
                        const asset = variant.layers[layer]
                        const targetKey = `${group}:${variant.id}:${layer}`
                        return <div key={layer}>
                          <span className="text-xs text-muted-foreground">{t(`characterDraft.layers.${layer}`)}</span>
                          <div className="mt-1 aspect-2/3 overflow-hidden rounded-xl bg-muted/40">{asset ? <CharacterAssetImage blob={asset.blob} /> : <div className="size-full p-4"><CharacterSlotPlaceholder src={characterSlotIcon(group, variant.id, layer)} label={t('characterDraft.empty')} /></div>}</div>
                          {asset && <p className="mt-1 truncate text-xs text-muted-foreground">{asset.source === 'agent' ? t('characterDraft.fromAgent') : asset.filename}</p>}
                          <label className="mt-2 block"><span className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border px-2.5 text-xs font-medium hover:bg-accent">{busy === targetKey ? t('data.busy') : t(asset ? 'characterDraft.replace' : 'characterDraft.upload')}</span><input className="sr-only" type="file" accept="image/png" disabled={Boolean(busy)} onChange={async (event) => {
                            const file = event.target.files?.[0]
                            if (!file) return
                            setBusy(targetKey); setError(undefined)
                            try { setDraft(await saveAsset(draft, { group, variantId: variant.id, label: variant.label, layer }, file, file.name)) } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) } finally { setBusy(undefined); event.target.value = '' }
                          }} /></label>
                        </div>
                      })}
                    </div>
                    {filled && <Button type="button" size="sm" variant={selected ? 'default' : 'outline'} className="mt-3" disabled={selected && (group === 'body' || group === 'expression')} onClick={() => selectVariant(group, variant.id)}>{selected ? (group === 'body' || group === 'expression' ? t('characterDraft.selected') : t('characterDraft.removeFromPreview')) : t('characterDraft.previewVariant')}</Button>}
                  </article>
                })}
              </div>
            </section>
          })}
          {currentStep.id === 'review' && <div className="mt-7 rounded-2xl border bg-background p-5 shadow-sm">
            <h3 className="font-heading font-medium">{t('candidate.title')}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{missing.length ? t('characterDraft.missingRequired') : t('characterDraft.ready')}</p>
          </div>}
          {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        </div>
        <div className="sticky bottom-0 mt-6 flex items-center justify-between gap-2 border-t bg-background/95 py-3 backdrop-blur">
          <Button type="button" variant="outline" disabled={Boolean(busy) || stepIndex === 0} onClick={() => goToStep(stepIndex - 1)}>{t('characterDraft.previous')}</Button>
          {stepIndex < characterDraftSteps.length - 1
            ? <Button type="button" disabled={Boolean(busy)} onClick={() => goToStep(stepIndex + 1)}>{t('characterDraft.next')}</Button>
            : <Button disabled={Boolean(busy) || Boolean(missing.length) || !draft.name.trim()} onClick={async () => { setBusy('review'); setError(undefined); try { await onReview(await updateDraft(draft)) } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); setBusy(undefined) } }}>{busy === 'review' ? t('draft.validating') : t('draft.review')}</Button>}
        </div>
      </section>
    </main>
  </div>
}
