import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { CompanionStartup } from '@/core/application/companion.ts'
import type { StagedCandidatePreview } from '@/core/application/candidate.ts'
import type { AgentCustomization } from '@/core/application/authoring.ts'
import { CHARACTER_CREATION_GROUPS, REQUIRED_CHARACTER_TARGETS, resolveCharacterDraftLayers } from '@/core/application/character-creation.ts'
import type { CharacterAssetTarget, CharacterDraft, CharacterVariantGroup, CharacterVariantLayer, ResolvedCharacterLayer } from '@/core/domain/character.ts'
import { Button } from '@/ui/components/ui/button'
import { Separator } from '@/ui/components/ui/separator'

import { AppHeader } from './AppHeader'
import { AppMenu } from './AppMenu'
import { DataControls } from './DataControls'
import { CharacterAssetImage, CharacterRenderer, CharacterSlotPlaceholder } from './CharacterRenderer'

type ScreenState =
  | CompanionStartup
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'draft'; seed: AgentCustomization; webmcpAvailable: boolean }
  | { status: 'character-draft'; draft: CharacterDraft; webmcpAvailable: boolean }
  | { status: 'candidate'; preview: StagedCandidatePreview; webmcpAvailable: boolean }

type AppProps = {
  loadStartup(): Promise<CompanionStartup>
  createPresetSeed(): AgentCustomization
  openCharacterDraft(): Promise<CharacterDraft>
  updateCharacterDraft(draft: CharacterDraft): Promise<CharacterDraft>
  saveCharacterAsset(draft: CharacterDraft, target: CharacterAssetTarget, blob: Blob, filename: string): Promise<CharacterDraft>
  prepareCharacter(draft: CharacterDraft): Promise<StagedCandidatePreview>
  clearCharacterDraft(): Promise<void>
  preparePreset(customization: AgentCustomization): Promise<StagedCandidatePreview>
  approveCandidate(bundleId: string, approved: true): Promise<unknown>
  submitAction(actionId: string, expectedRevision: number): Promise<unknown>
  submitText(text: string, expectedRevision: number): Promise<unknown>
  exportData(): Promise<Blob>
  prepareImport(blob: Blob): Promise<StagedCandidatePreview>
}

const startOptions = ['custom', 'preset', 'bundle'] as const

function App({ loadStartup, createPresetSeed, openCharacterDraft, updateCharacterDraft, saveCharacterAsset, prepareCharacter, clearCharacterDraft, preparePreset, approveCandidate, submitAction, submitText, exportData, prepareImport }: AppProps) {
  const { t } = useTranslation()
  const [screen, setScreen] = useState<ScreenState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    loadStartup()
      .then((result) => {
        if (active) setScreen(result)
      })
      .catch((error) => {
        console.error('Companion startup failed', error)
        if (active) setScreen({ status: 'error' })
      })
    return () => {
      active = false
    }
  }, [loadStartup])

  useEffect(() => {
    const refresh = () => void openCharacterDraft().then((draft) => setScreen((current) => ({
      status: 'character-draft',
      draft,
      webmcpAvailable: 'webmcpAvailable' in current ? current.webmcpAvailable : true,
    })))
    window.addEventListener('character-draft-updated', refresh)
    return () => window.removeEventListener('character-draft-updated', refresh)
  }, [openCharacterDraft])

  useEffect(() => {
    const refresh = () => void loadStartup().then(setScreen)
    window.addEventListener('companion-updated', refresh)
    return () => window.removeEventListener('companion-updated', refresh)
  }, [loadStartup])

  if (screen.status === 'loading') return <StatusScreen>{t('startup.loading')}</StatusScreen>
  if (screen.status === 'error') {
    return <StatusScreen>{t('startup.error')}</StatusScreen>
  }
  if (screen.status === 'candidate') {
    return <CandidateScreen
      preview={screen.preview}
      webmcpAvailable={screen.webmcpAvailable}
      onApprove={async () => {
        await approveCandidate(screen.preview.bundleId, true)
        if (screen.preview.source === 'character') await clearCharacterDraft()
        setScreen(await loadStartup())
      }}
      onCancel={async () => screen.preview.source === 'character'
        ? setScreen({ status: 'character-draft', draft: await openCharacterDraft(), webmcpAvailable: screen.webmcpAvailable })
        : setScreen(await loadStartup())}
    />
  }
  if (screen.status === 'draft') {
    return <DraftScreen
      seed={screen.seed}
      webmcpAvailable={screen.webmcpAvailable}
      onReview={async (customization) => {
        const preview = await preparePreset(customization)
        setScreen({ status: 'candidate', preview, webmcpAvailable: screen.webmcpAvailable })
      }}
      onCancel={async () => setScreen(await loadStartup())}
    />
  }
  if (screen.status === 'character-draft') {
    return <CharacterDraftScreen
      key={screen.draft.updatedAt}
      seed={screen.draft}
      webmcpAvailable={screen.webmcpAvailable}
      updateDraft={updateCharacterDraft}
      saveAsset={saveCharacterAsset}
      onReview={async (draft) => setScreen({ status: 'candidate', preview: await prepareCharacter(draft), webmcpAvailable: screen.webmcpAvailable })}
      onCancel={async () => setScreen(await loadStartup())}
    />
  }
  if (screen.status === 'start') {
    return <StartScreen
      webmcpAvailable={screen.webmcpAvailable}
      prepareImport={async (blob) => {
        const preview = await prepareImport(blob)
        setScreen({ status: 'candidate', preview, webmcpAvailable: screen.webmcpAvailable })
      }}
      onCreatePreset={() => setScreen({ status: 'draft', seed: createPresetSeed(), webmcpAvailable: screen.webmcpAvailable })}
      onCreateCharacter={async () => setScreen({ status: 'character-draft', draft: await openCharacterDraft(), webmcpAvailable: screen.webmcpAvailable })}
    />
  }

  return (
    <MainScreen
      companionName={screen.companion.name}
      stage={screen.stage}
      dialogue={screen.dialogue}
      pendingTurns={screen.pendingTurns}
      character={screen.character}
      webmcpAvailable={screen.webmcpAvailable}
      exportData={exportData}
      prepareImport={async (blob) => {
        const preview = await prepareImport(blob)
        setScreen({ status: 'candidate', preview, webmcpAvailable: screen.webmcpAvailable })
      }}
      onCreateCharacter={async () => setScreen({ status: 'character-draft', draft: await openCharacterDraft(), webmcpAvailable: screen.webmcpAvailable })}
      onAction={async (actionId) => {
        await submitAction(actionId, screen.stage.revision)
        setScreen(await loadStartup())
      }}
      onText={async (text) => {
        await submitText(text, screen.stage.revision)
        setScreen(await loadStartup())
      }}
    />
  )
}

function StatusScreen({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <p className="text-center text-sm text-muted-foreground">{children}</p>
    </main>
  )
}

function CandidateScreen({
  preview,
  webmcpAvailable,
  onApprove,
  onCancel,
}: {
  preview: StagedCandidatePreview
  webmcpAvailable: boolean
  onApprove(): Promise<void>
  onCancel(): Promise<void>
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setError(false)
    try { await task() } catch { setError(true); setBusy(false) }
  }

  return (
    <div className="min-h-svh">
      <AppHeader title={preview.name} webmcpAvailable={webmcpAvailable} />
      <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-xl flex-col justify-center px-4 py-10">
        <p className="text-sm font-medium text-muted-foreground">{t(`candidate.source.${preview.source}`)}</p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">{t('candidate.title')}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('candidate.description')}</p>
        <section className="mt-6 rounded-2xl border bg-background p-5 shadow-sm">
          <h2 className="font-heading text-lg font-medium">{preview.name}</h2>
          {preview.source === 'character' && <div className="mx-auto mt-4 max-w-xs"><CharacterRenderer label={preview.name} layers={preview.layers} /></div>}
          <dl className="mt-4 grid gap-2 text-sm">
            {preview.source === 'preset' ? <>
              <div className="flex justify-between gap-4"><dt>{t('candidate.stages')}</dt><dd>{preview.stageCount}</dd></div>
              <div className="flex justify-between gap-4"><dt>{t('candidate.initialStage')}</dt><dd>{preview.initialTitle}</dd></div>
            </> : preview.source === 'import' ? <>
              <div className="flex justify-between gap-4"><dt>{t('candidate.entries')}</dt><dd>{preview.entryCount}</dd></div>
              <div className="flex justify-between gap-4"><dt>{t('candidate.assets')}</dt><dd>{preview.assetCount}</dd></div>
            </> : <>
              <div className="flex justify-between gap-4"><dt>{t('candidate.appearances')}</dt><dd>{preview.appearanceCount}</dd></div>
            </>}
          </dl>
        </section>
        <div className="mt-6 flex gap-2">
          <Button disabled={busy} onClick={() => void run(onApprove)}>{busy ? t('candidate.activating') : t('candidate.approve')}</Button>
          <Button variant="outline" disabled={busy} onClick={() => void run(onCancel)}>{t('candidate.cancel')}</Button>
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{t('startup.error')}</p>}
      </main>
    </div>
  )
}

function DraftScreen({
  seed,
  webmcpAvailable,
  onReview,
  onCancel,
}: {
  seed: AgentCustomization
  webmcpAvailable: boolean
  onReview(customization: AgentCustomization): Promise<void>
  onCancel(): Promise<void>
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(seed)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const stageIndex = draft.stages.findIndex(({ id }) => id === draft.initialStageId)
  const stage = draft.stages[stageIndex]!
  const updateStage = (values: Partial<typeof stage>) => setDraft((current) => ({
    ...current,
    stages: current.stages.map((item, index) => index === stageIndex ? { ...item, ...values } : item),
  }))

  return (
    <div className="min-h-svh">
      <AppHeader title={draft.name} webmcpAvailable={webmcpAvailable} />
      <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-xl flex-col justify-center px-4 py-10">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{t('draft.title')}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('draft.description')}</p>
        <form className="mt-6 grid gap-4" onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          setError(false)
          try { await onReview(draft) } catch { setError(true); setBusy(false) }
        }}>
          <label className="grid gap-1.5 text-sm">
            <span>{t('draft.name')}</span>
            <input className="rounded-md border bg-background px-3 py-2" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span>{t('draft.initialTitle')}</span>
            <input className="rounded-md border bg-background px-3 py-2" value={stage.title} onChange={(event) => updateStage({ title: event.target.value })} />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span>{t('draft.narrative')}</span>
            <textarea className="min-h-28 rounded-md border bg-background px-3 py-2" value={stage.narrative} onChange={(event) => updateStage({ narrative: event.target.value })} />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>{busy ? t('draft.validating') : t('draft.review')}</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void onCancel()}>{t('draft.cancel')}</Button>
          </div>
        </form>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{t('startup.error')}</p>}
      </main>
    </div>
  )
}

function StartScreen({ webmcpAvailable, onCreatePreset, onCreateCharacter, prepareImport }: { webmcpAvailable: boolean; onCreatePreset(): void; onCreateCharacter(): Promise<void>; prepareImport(blob: Blob): Promise<void> }) {
  const { t } = useTranslation()

  return (
    <div className="min-h-svh">
      <AppHeader webmcpAvailable={webmcpAvailable} />
      <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-3xl flex-col justify-center px-4 py-10">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{t('start.title')}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          {t('start.description')}
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {startOptions.map((option) => (
            <section key={option} className="flex min-h-40 flex-col rounded-2xl border bg-background p-4 shadow-sm">
              <h2 className="font-heading font-medium">{t(`start.options.${option}.title`)}</h2>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">
                {t(`start.options.${option}.description`)}
              </p>
              {option === 'bundle' ? <DataControls prepareImport={prepareImport} /> : <Button
                className="mt-auto"
                onClick={option === 'preset' ? onCreatePreset : () => void onCreateCharacter()}
              >
                {option === 'preset' ? t('start.createPreset') : t('start.createCharacter')}
              </Button>}
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}

const expressionIcons = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'sleepy']
const characterSlotIcon = (group: CharacterVariantGroup, variantId: string, layer: CharacterVariantLayer) => {
  if (group === 'expression') return `/assets/character-slots/expression-${expressionIcons.includes(variantId) ? variantId : 'neutral'}.png`
  if (group === 'body') return '/assets/character-slots/body-base.png'
  if (group === 'outfit') return '/assets/character-slots/body-outfit.png'
  return `/assets/character-slots/${group}-${layer}.png`
}

function CharacterDraftScreen({ seed, webmcpAvailable, updateDraft, saveAsset, onReview, onCancel }: {
  seed: CharacterDraft
  webmcpAvailable: boolean
  updateDraft(draft: CharacterDraft): Promise<CharacterDraft>
  saveAsset(draft: CharacterDraft, target: CharacterAssetTarget, blob: Blob, filename: string): Promise<CharacterDraft>
  onReview(draft: CharacterDraft): Promise<void>
  onCancel(): Promise<void>
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(seed)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
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

  return <div className="min-h-svh bg-muted/30">
    <AppHeader title={draft.name} webmcpAvailable={webmcpAvailable} />
    <main className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
      <section>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{t('characterDraft.title')}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('characterDraft.description')}</p>
        <div className="mt-6"><CharacterRenderer label={draft.name} layers={previewLayers} /></div>
        <label className="mt-5 grid gap-1.5 text-sm">
          <span>{t('draft.name')}</span>
          <input className="rounded-md border bg-background px-3 py-2" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} onBlur={() => void updateDraft(draft)} />
        </label>
      </section>

      <section aria-labelledby="asset-grid-title">
        <h2 id="asset-grid-title" className="font-heading text-xl font-medium">{t('characterDraft.assetsTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t(webmcpAvailable ? 'characterDraft.agentReady' : 'characterDraft.agentUnavailable')}</p>
        {CHARACTER_CREATION_GROUPS.map(({ group, layers, addable }) => {
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
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex gap-2"><Button disabled={Boolean(busy) || Boolean(missing.length) || !draft.name.trim()} onClick={async () => { setBusy('review'); setError(undefined); try { await onReview(await updateDraft(draft)) } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); setBusy(undefined) } }}>{busy === 'review' ? t('draft.validating') : t('draft.review')}</Button><Button variant="outline" disabled={Boolean(busy)} onClick={() => void onCancel()}>{t('draft.cancel')}</Button></div>
        {missing.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{t('characterDraft.missingRequired')}</p>}
      </section>
    </main>
  </div>
}

function MainScreen({
  companionName,
  stage,
  dialogue,
  pendingTurns,
  character,
  webmcpAvailable,
  exportData,
  prepareImport,
  onCreateCharacter,
  onAction,
  onText,
}: {
  companionName: string
  stage: import('@/core/domain/companion.ts').StageProjection
  dialogue?: string
  pendingTurns: number
  character?: Array<ResolvedCharacterLayer & { blob: Blob }>
  webmcpAvailable: boolean
  exportData(): Promise<Blob>
  prepareImport(blob: Blob): Promise<void>
  onCreateCharacter(): Promise<void>
  onAction(actionId: string): Promise<void>
  onText(text: string): Promise<void>
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')

  return (
    <div className="min-h-svh bg-muted/30">
      <AppHeader
        title={companionName}
        webmcpAvailable={webmcpAvailable}
        actions={<AppMenu exportData={exportData} prepareImport={prepareImport} onCreateCharacter={() => void onCreateCharacter()} />}
      />

      <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-5xl flex-col px-4">
        <section
          aria-label={t('main.stageTitle')}
          className="flex min-h-0 flex-1 items-center justify-center py-6"
        >
          <div className="flex aspect-2/3 max-h-[65svh] w-full max-w-sm items-center justify-center rounded-3xl bg-background shadow-sm">
            {character ? <CharacterRenderer label={companionName} layers={character} /> : <div className="text-center text-muted-foreground">
              <h1 id="stage-title" className="text-base font-medium text-foreground">{stage.title}</h1>
              <p className="mt-1 text-sm">{stage.narrative}</p>
            </div>}
          </div>
        </section>

        <Separator />

        <section aria-labelledby="dialogue-title" className="py-4">
          <div className="rounded-2xl border bg-background p-4 shadow-sm">
            <h2 id="dialogue-title" className="font-heading text-sm font-medium">
              {t('main.dialogueTitle')}
            </h2>
            {dialogue && <p className="mt-2 text-sm text-foreground">{dialogue}</p>}
            {pendingTurns > 0 && <p className="mt-2 text-sm text-muted-foreground">{t('main.waitingForAgent')}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {stage.actions.map((action) => (
                <Button key={action.id} variant="outline" disabled={busy} onClick={async () => {
                  setBusy(true)
                  try { await onAction(action.id) } finally { setBusy(false) }
                }}>{action.label}</Button>
              ))}
            </div>
            <form className="mt-3 flex gap-2" onSubmit={async (event) => {
              event.preventDefault()
              if (!text.trim() || busy) return
              setBusy(true)
              try { await onText(text); setText('') } finally { setBusy(false) }
            }}>
              <label htmlFor="companion-message" className="sr-only">{t('main.messageLabel')}</label>
              <input
                id="companion-message"
                className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                placeholder={t('main.messagePlaceholder')}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
              <Button type="submit" disabled={busy || !text.trim()}>{t('main.send')}</Button>
            </form>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
