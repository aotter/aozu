import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { CompanionStartup } from '@/core/application/companion.ts'
import { Button } from '@/ui/components/ui/button'
import { Separator } from '@/ui/components/ui/separator'

import { AppHeader } from './AppHeader'
import { AppMenu } from './AppMenu'

type ScreenState = CompanionStartup | { status: 'loading' } | { status: 'error' }

type AppProps = {
  loadStartup(): Promise<CompanionStartup>
}

const startOptions = ['custom', 'preset', 'bundle'] as const

function App({ loadStartup }: AppProps) {
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

  if (screen.status === 'loading') return <StatusScreen>{t('startup.loading')}</StatusScreen>
  if (screen.status === 'error') {
    return <StatusScreen>{t('startup.error')}</StatusScreen>
  }
  if (screen.status === 'start') return <StartScreen webmcpAvailable={screen.webmcpAvailable} />

  return (
    <MainScreen
      companionName={screen.companion.name}
      webmcpAvailable={screen.webmcpAvailable}
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

function StartScreen({ webmcpAvailable }: { webmcpAvailable: boolean }) {
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
              <Button className="mt-auto" disabled>
                {t('start.unavailable')}
              </Button>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}

function MainScreen({
  companionName,
  webmcpAvailable,
}: {
  companionName: string
  webmcpAvailable: boolean
}) {
  const { t } = useTranslation()

  return (
    <div className="min-h-svh bg-muted/30">
      <AppHeader
        title={companionName}
        webmcpAvailable={webmcpAvailable}
        actions={<AppMenu />}
      />

      <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-5xl flex-col px-4">
        <section
          aria-labelledby="stage-title"
          className="flex min-h-0 flex-1 items-center justify-center py-6"
        >
          <div className="flex aspect-2/3 max-h-[65svh] w-full max-w-sm items-center justify-center rounded-3xl border bg-background shadow-sm">
            <div className="text-center text-muted-foreground">
              <h1 id="stage-title" className="text-base font-medium text-foreground">
                {t('main.stageTitle')}
              </h1>
              <p className="mt-1 text-sm">{t('main.placeholder')}</p>
            </div>
          </div>
        </section>

        <Separator />

        <section aria-labelledby="dialogue-title" className="py-4">
          <div className="rounded-2xl border bg-background p-4 shadow-sm">
            <h2 id="dialogue-title" className="font-heading text-sm font-medium">
              {t('main.dialogueTitle')}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{t('main.dialoguePlaceholder')}</p>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
