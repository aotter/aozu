import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ExperienceDraft, ValidatedStarterPackage } from '@/core/domain/starter.ts'
import { Button } from '@/ui/components/ui/button'

export function StarterDraftPage({ loadStarters, openDraft, selectStarter, webmcpAvailable, onCancel }: {
  loadStarters(): Promise<ValidatedStarterPackage[]>
  openDraft(): Promise<ExperienceDraft | null>
  selectStarter(starterId: string, starterVersion: number, directionId: string): Promise<ExperienceDraft>
  webmcpAvailable: boolean
  onCancel(): void
}) {
  const { t } = useTranslation()
  const [packages, setPackages] = useState<ValidatedStarterPackage[]>()
  const [draft, setDraft] = useState<ExperienceDraft | null>()
  const [starterKey, setStarterKey] = useState('')
  const [directionId, setDirectionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let live = true
    void Promise.all([loadStarters(), openDraft()]).then(([loaded, current]) => {
      if (!live) return
      const selected = loaded.find(({ starter }) => starter.id === current?.starter.id && starter.version === current.starter.version) ?? loaded[0]
      setPackages(loaded)
      setDraft(current)
      setStarterKey(selected ? `${selected.starter.id}@${selected.starter.version}` : '')
      setDirectionId(current?.direction.id ?? selected?.starter.directions[0]?.id ?? '')
    }).catch(() => live && setError(true))
    return () => { live = false }
  }, [loadStarters, openDraft])

  if (!packages && !error) return <main className="mx-auto w-full max-w-2xl px-4 py-10"><p>{t('startup.loading')}</p></main>
  const selected = packages?.find(({ starter }) => `${starter.id}@${starter.version}` === starterKey)

  return <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-2xl flex-col justify-center px-4 py-10">
    <h1 className="font-heading text-3xl font-semibold tracking-tight">{t('starter.title')}</h1>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('starter.description')}</p>
    {packages && <form className="mt-6 grid gap-5" onSubmit={async (event) => {
      event.preventDefault()
      if (!selected || !directionId) return
      setBusy(true); setError(false)
      try { setDraft(await selectStarter(selected.starter.id, selected.starter.version, directionId)) } catch { setError(true) } finally { setBusy(false) }
    }}>
      <label className="grid gap-1.5 text-sm">
        <span>{t('starter.package')}</span>
        <select className="rounded-md border bg-background px-3 py-2" value={starterKey} onChange={(event) => {
          const next = packages.find(({ starter }) => `${starter.id}@${starter.version}` === event.target.value)
          setStarterKey(event.target.value)
          setDirectionId(next?.starter.directions[0]?.id ?? '')
        }}>
          {packages.map(({ starter }) => <option key={`${starter.id}@${starter.version}`} value={`${starter.id}@${starter.version}`}>{starter.name} · v{starter.version}</option>)}
        </select>
      </label>
      {selected && <section className="rounded-2xl border bg-background p-5 shadow-sm">
        <h2 className="font-heading text-lg font-medium">{selected.starter.name}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{selected.starter.description}</p>
        <fieldset className="mt-4 grid gap-3">
          <legend className="text-sm font-medium">{t('starter.direction')}</legend>
          {selected.starter.directions.map((direction) => <label key={direction.id} className="flex gap-3 rounded-xl border p-3 text-sm">
            <input type="radio" name="direction" value={direction.id} checked={directionId === direction.id} onChange={() => setDirectionId(direction.id)} />
            <span><strong className="font-medium">{direction.name}</strong><span className="mt-1 block text-muted-foreground">{direction.summary}</span><span className="mt-1 block text-xs text-muted-foreground">{direction.seed.loopIds.join(' + ')} · {direction.seed.completionMode}</span></span>
          </label>)}
        </fieldset>
      </section>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !selected || !directionId}>{busy ? t('starter.saving') : t('starter.select')}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{t('starter.cancel')}</Button>
      </div>
    </form>}
    {draft && <section className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
      <h2 className="font-medium">{t('starter.saved')}</h2>
      <p className="mt-1 text-muted-foreground">{draft.starter.name} · {draft.direction.name} · revision {draft.revision}</p>
      <p className="mt-2">{t(webmcpAvailable ? 'starter.agentReady' : 'starter.noAgent')}</p>
    </section>}
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{t('startup.error')}</p>}
  </main>
}
