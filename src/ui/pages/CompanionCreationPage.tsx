import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/ui/components/ui/button'
import { StatusPage } from '@/ui/pages/StatusPage'

type Summary = { character: string; story?: string; stages: number; actions: number; metrics: number; rules: number }

export function CompanionCreationPage({ loadSummary, onCreate }: {
  loadSummary(): Promise<Summary>
  onCreate(): Promise<void>
}) {
  const { t } = useTranslation()
  const [summary, setSummary] = useState<Summary | null>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    void loadSummary().then((loaded) => { if (active) setSummary(loaded) }).catch(() => active && setSummary(null))
    return () => { active = false }
  }, [loadSummary])

  if (summary === null) return <StatusPage>{t('startup.error')}</StatusPage>
  if (!summary) return <StatusPage>{t('startup.loading')}</StatusPage>

  return <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-xl flex-col justify-center px-4 py-10">
    <h1 className="font-heading text-3xl font-semibold tracking-tight">{t('create.title')}</h1>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('create.description')}</p>
    <dl className="mt-8 divide-y rounded-2xl border px-4">
      <div className="flex justify-between gap-4 py-4"><dt>{t('create.character')}</dt><dd className="text-right text-muted-foreground">{summary.character}</dd></div>
      <div className="flex justify-between gap-4 py-4"><dt>{t('create.story')}</dt><dd className="text-right text-muted-foreground">{summary.story ?? t('create.blankStory')}</dd></div>
    </dl>
    <dl className="mt-4 grid grid-cols-4 divide-x rounded-2xl border py-4 text-center">
      {(['stages', 'actions', 'metrics', 'rules'] as const).map((key) => <div key={key} className="flex flex-col px-2">
        <dt className="order-2 mt-1 text-xs text-muted-foreground">{t(`create.stats.${key}`)}</dt>
        <dd className="order-1 font-heading text-xl font-semibold">{summary[key]}</dd>
      </div>)}
    </dl>
    <Button className="mt-6" disabled={busy} onClick={async () => {
      setBusy(true); setError(false)
      try { await onCreate() } catch { setBusy(false); setError(true) }
    }}>{busy ? t('create.creating') : t('create.submit')}</Button>
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{t('create.error')}</p>}
  </main>
}
