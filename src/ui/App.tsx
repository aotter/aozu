import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { CompanionStartup } from '@/core/application/companion.ts'
import { Button } from '@/ui/components/ui/button'
import { Separator } from '@/ui/components/ui/separator'

import { AppHeader } from './AppHeader'
import { AppMenu } from './AppMenu'
import { DataControls } from './DataControls'

type ScreenState = CompanionStartup | { status: 'loading' } | { status: 'error' }

type AppProps = {
  loadStartup(): Promise<CompanionStartup>
  createPreset(): Promise<unknown>
  submitAction(actionId: string, expectedRevision: number): Promise<unknown>
  submitText(text: string, expectedRevision: number): Promise<unknown>
  exportData(): Promise<Blob>
  importData(blob: Blob): Promise<unknown>
}

const startOptions = ['custom', 'preset', 'bundle'] as const

function App({ loadStartup, createPreset, submitAction, submitText, exportData, importData }: AppProps) {
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
  if (screen.status === 'start') {
    return <StartScreen webmcpAvailable={screen.webmcpAvailable} importData={importData} onCreate={async () => {
      await createPreset()
      setScreen({ status: 'loading' })
      setScreen(await loadStartup())
    }} />
  }

  return (
    <MainScreen
      companionName={screen.companion.name}
      stage={screen.stage}
      dialogue={screen.dialogue}
      pendingTurns={screen.pendingTurns}
      webmcpAvailable={screen.webmcpAvailable}
      exportData={exportData}
      importData={importData}
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

function StartScreen({ webmcpAvailable, onCreate, importData }: { webmcpAvailable: boolean; onCreate(): Promise<void>; importData(blob: Blob): Promise<unknown> }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

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
              {option === 'bundle' ? <DataControls importData={importData} /> : <Button
                className="mt-auto"
                disabled={option !== 'preset' || busy}
                onClick={option === 'preset' ? async () => {
                  setBusy(true)
                  setError(false)
                  try { await onCreate() } catch { setError(true); setBusy(false) }
                } : undefined}
              >
                {option === 'preset' ? (busy ? t('start.creating') : t('start.createPreset')) : t('start.unavailable')}
              </Button>}
            </section>
          ))}
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{t('startup.error')}</p>}
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
  importData,
  onAction,
  onText,
}: {
  companionName: string
  stage: import('@/core/domain/companion.ts').StageProjection
  dialogue?: string
  pendingTurns: number
  webmcpAvailable: boolean
  exportData(): Promise<Blob>
  importData(blob: Blob): Promise<unknown>
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
        actions={<AppMenu exportData={exportData} importData={importData} />}
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
