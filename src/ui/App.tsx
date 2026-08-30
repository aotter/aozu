import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { CompanionStartup } from '@/core/application/companion.ts'
import type { StagedCandidatePreview } from '@/core/application/candidate.ts'
import type { AgentCustomization } from '@/core/application/authoring.ts'
import { Button } from '@/ui/components/ui/button'
import { Separator } from '@/ui/components/ui/separator'

import { AppHeader } from './AppHeader'
import { AppMenu } from './AppMenu'
import { DataControls } from './DataControls'

type ScreenState =
  | CompanionStartup
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'draft'; seed: AgentCustomization; webmcpAvailable: boolean }
  | { status: 'candidate'; preview: StagedCandidatePreview; webmcpAvailable: boolean }

type AppProps = {
  loadStartup(): Promise<CompanionStartup>
  createPresetSeed(): AgentCustomization
  preparePreset(customization: AgentCustomization): Promise<StagedCandidatePreview>
  approveCandidate(bundleId: string, approved: true): Promise<unknown>
  submitAction(actionId: string, expectedRevision: number): Promise<unknown>
  submitText(text: string, expectedRevision: number): Promise<unknown>
  exportData(): Promise<Blob>
  prepareImport(blob: Blob): Promise<StagedCandidatePreview>
}

const startOptions = ['custom', 'preset', 'bundle'] as const

function App({ loadStartup, createPresetSeed, preparePreset, approveCandidate, submitAction, submitText, exportData, prepareImport }: AppProps) {
  const { t } = useTranslation()
  const [screen, setScreen] = useState<ScreenState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    loadStartup()
      .then((result) => {
        if (active) setScreen(result)
      })
      .catch(() => {
        if (active) setScreen({ status: 'error' })
      })
    return () => {
      active = false
    }
  }, [loadStartup])

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
        setScreen(await loadStartup())
      }}
      onCancel={async () => setScreen(await loadStartup())}
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
  if (screen.status === 'start') {
    return <StartScreen
      webmcpAvailable={screen.webmcpAvailable}
      prepareImport={async (blob) => {
        const preview = await prepareImport(blob)
        setScreen({ status: 'candidate', preview, webmcpAvailable: screen.webmcpAvailable })
      }}
      onCreate={() => setScreen({ status: 'draft', seed: createPresetSeed(), webmcpAvailable: screen.webmcpAvailable })}
    />
  }

  return (
    <MainScreen
      companionName={screen.companion.name}
      stage={screen.stage}
      dialogue={screen.dialogue}
      pendingTurns={screen.pendingTurns}
      webmcpAvailable={screen.webmcpAvailable}
      exportData={exportData}
      prepareImport={async (blob) => {
        const preview = await prepareImport(blob)
        setScreen({ status: 'candidate', preview, webmcpAvailable: screen.webmcpAvailable })
      }}
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
          <dl className="mt-4 grid gap-2 text-sm">
            {preview.source === 'preset' ? <>
              <div className="flex justify-between gap-4"><dt>{t('candidate.stages')}</dt><dd>{preview.stageCount}</dd></div>
              <div className="flex justify-between gap-4"><dt>{t('candidate.initialStage')}</dt><dd>{preview.initialTitle}</dd></div>
            </> : <>
              <div className="flex justify-between gap-4"><dt>{t('candidate.entries')}</dt><dd>{preview.entryCount}</dd></div>
              <div className="flex justify-between gap-4"><dt>{t('candidate.assets')}</dt><dd>{preview.assetCount}</dd></div>
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

function StartScreen({ webmcpAvailable, onCreate, prepareImport }: { webmcpAvailable: boolean; onCreate(): void; prepareImport(blob: Blob): Promise<void> }) {
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
                disabled={option !== 'preset'}
                onClick={option === 'preset' ? onCreate : undefined}
              >
                {option === 'preset' ? t('start.createPreset') : t('start.unavailable')}
              </Button>}
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}

function MainScreen({
  companionName,
  stage,
  dialogue,
  pendingTurns,
  webmcpAvailable,
  exportData,
  prepareImport,
  onAction,
  onText,
}: {
  companionName: string
  stage: import('@/core/domain/companion.ts').StageProjection
  dialogue?: string
  pendingTurns: number
  webmcpAvailable: boolean
  exportData(): Promise<Blob>
  prepareImport(blob: Blob): Promise<void>
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
        actions={<AppMenu exportData={exportData} prepareImport={prepareImport} />}
      />

      <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-5xl flex-col px-4">
        <section
          aria-labelledby="stage-title"
          className="flex min-h-0 flex-1 items-center justify-center py-6"
        >
          <div className="flex aspect-2/3 max-h-[65svh] w-full max-w-sm items-center justify-center rounded-3xl border bg-background shadow-sm">
            <div className="text-center text-muted-foreground">
              <h1 id="stage-title" className="text-base font-medium text-foreground">{stage.title}</h1>
              <p className="mt-1 text-sm">{stage.narrative}</p>
            </div>
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
