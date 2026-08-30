import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { CompanionStartup } from '@/core/application/companion.ts'
import type { StagedCandidatePreview } from '@/core/application/candidate.ts'
import type { AgentCustomization } from '@/core/application/authoring.ts'
import type { CharacterCreationRole, CharacterDraft, ResolvedCharacterLayer } from '@/core/domain/character.ts'
import { Button } from '@/ui/components/ui/button'
import { Separator } from '@/ui/components/ui/separator'

import { AppHeader } from './AppHeader'
import { AppMenu } from './AppMenu'
import { DataControls } from './DataControls'
import { CharacterAssetImage, CharacterRenderer } from './CharacterRenderer'

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
  saveCharacterAsset(draft: CharacterDraft, role: CharacterCreationRole, blob: Blob, filename: string): Promise<CharacterDraft>
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

const characterSlots: Array<{ role: CharacterCreationRole; required: boolean }> = [
  { role: 'body-base', required: true },
  { role: 'head-neutral', required: true },
  { role: 'head-happy', required: false },
  { role: 'body-outfit', required: false },
  { role: 'prop-back', required: false },
  { role: 'prop-front', required: false },
]

function CharacterDraftScreen({ seed, webmcpAvailable, updateDraft, saveAsset, onReview, onCancel }: {
  seed: CharacterDraft
  webmcpAvailable: boolean
  updateDraft(draft: CharacterDraft): Promise<CharacterDraft>
  saveAsset(draft: CharacterDraft, role: CharacterCreationRole, blob: Blob, filename: string): Promise<CharacterDraft>
  onReview(draft: CharacterDraft): Promise<void>
  onCancel(): Promise<void>
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(seed)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const body = draft.assets[draft.selectedBody] ? draft.selectedBody : 'body-base'
  const expression = draft.assets[draft.selectedExpression] ? draft.selectedExpression : 'head-neutral'
  const previewLayers = ([
    ['prop-back', 10], [body, 30], [expression, 35], ['prop-front', 40],
  ] as Array<[CharacterCreationRole, number]>).flatMap(([role, slotOrder]) => {
    const asset = draft.assets[role]
    return asset ? [{ id: role, blob: asset.blob, slotOrder, layerOrder: 1 }] : []
  })
  const missing = characterSlots.filter(({ required, role }) => required && !draft.assets[role])
  const persist = (next: CharacterDraft) => { setDraft(next); void updateDraft(next) }

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
        <div className="mt-4 grid grid-cols-2 gap-2">
          {draft.assets['body-outfit'] && <Button type="button" variant={body === 'body-outfit' ? 'default' : 'outline'} onClick={() => persist({ ...draft, selectedBody: 'body-outfit' })}>{t('characterDraft.useOutfit')}</Button>}
          {body === 'body-outfit' && <Button type="button" variant="outline" onClick={() => persist({ ...draft, selectedBody: 'body-base' })}>{t('characterDraft.useBase')}</Button>}
          {draft.assets['head-happy'] && <Button type="button" variant={expression === 'head-happy' ? 'default' : 'outline'} onClick={() => persist({ ...draft, selectedExpression: 'head-happy' })}>{t('characterDraft.useHappy')}</Button>}
          {expression === 'head-happy' && <Button type="button" variant="outline" onClick={() => persist({ ...draft, selectedExpression: 'head-neutral' })}>{t('characterDraft.useNeutral')}</Button>}
        </div>
      </section>

      <section aria-labelledby="asset-grid-title">
        <h2 id="asset-grid-title" className="font-heading text-xl font-medium">{t('characterDraft.assetsTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t(webmcpAvailable ? 'characterDraft.agentReady' : 'characterDraft.agentUnavailable')}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {characterSlots.map(({ role, required }) => {
            const asset = draft.assets[role]
            return <article key={role} className="flex min-h-56 flex-col rounded-2xl border bg-background p-3 shadow-sm">
              <div className="aspect-2/3 min-h-0 overflow-hidden rounded-xl bg-muted/40">{asset ? <CharacterAssetImage blob={asset.blob} /> : <div className="grid size-full place-items-center text-xs text-muted-foreground">{t('characterDraft.empty')}</div>}</div>
              <div className="mt-3 flex items-start justify-between gap-2"><div><h3 className="text-sm font-medium">{t(`characterDraft.roles.${role}.title`)}</h3><p className="mt-0.5 text-xs text-muted-foreground">{t(`characterDraft.roles.${role}.description`)}</p></div>{required && <span className="text-xs text-muted-foreground">{t('characterDraft.required')}</span>}</div>
              {asset && <p className="mt-2 truncate text-xs text-muted-foreground">{asset.source === 'agent' ? t('characterDraft.fromAgent') : asset.filename}</p>}
              <label className="mt-auto pt-3"><span className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-accent">{busy === role ? t('data.busy') : t(asset ? 'characterDraft.replace' : 'characterDraft.upload')}</span><input className="sr-only" type="file" accept="image/png" disabled={Boolean(busy)} onChange={async (event) => {
                const file = event.target.files?.[0]
                if (!file) return
                setBusy(role); setError(undefined)
                try { setDraft(await saveAsset(draft, role, file, file.name)) } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) } finally { setBusy(undefined); event.target.value = '' }
              }} /></label>
            </article>
          })}
        </div>
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
