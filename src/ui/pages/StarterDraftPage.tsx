import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { resolveStarterCharacterLayers } from '@/core/application/character-creation.ts'
import { resolveStarterSceneLayers } from '@/core/application/scene.ts'
import type { ExperienceDraft, ValidatedStarterPackage } from '@/core/domain/starter.ts'
import { CharacterRenderer } from '@/ui/CharacterRenderer'
import { SceneRenderer } from '@/ui/SceneRenderer'

export function StarterDraftPage({ loadStarters, selectStarter, onSelected }: {
  loadStarters(): Promise<ValidatedStarterPackage[]>
  selectStarter(starterId: string, starterVersion: number, directionId: string, replaceCharacterDraft?: boolean): Promise<ExperienceDraft | null>
  onSelected(): void
}) {
  const { t } = useTranslation()
  const [packages, setPackages] = useState<ValidatedStarterPackage[]>()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    let live = true
    void loadStarters().then((loaded) => { if (live) setPackages(loaded) }).catch(() => live && setError(true))
    return () => { live = false }
  }, [loadStarters])

  if (!packages && !error) return <main className="mx-auto w-full max-w-3xl px-4 py-10"><p>{t('startup.loading')}</p></main>

  return <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-3xl flex-col justify-center px-4 py-10">
    <h1 className="font-heading text-3xl font-semibold tracking-tight">{t('starter.title')}</h1>
    <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{t('starter.description')}</p>
    {packages && <div className="mt-6 grid gap-4">
      {packages.flatMap((loaded) => loaded.starter.directions.map((direction) => {
        const key = `${loaded.starter.id}@${loaded.starter.version}:${direction.id}`
        const choosing = busy === key
        return <button
          key={key}
          type="button"
          className="group grid min-w-0 grid-cols-[7.5rem_minmax(0,1fr)] gap-4 rounded-2xl border bg-background p-3 text-left shadow-sm transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[10rem_minmax(0,1fr)] sm:p-4"
          aria-label={t('starter.use', { name: direction.name })}
          disabled={Boolean(busy)}
          onClick={async () => {
            setBusy(key); setError(false)
            try {
              let draft = await selectStarter(loaded.starter.id, loaded.starter.version, direction.id)
              if (!draft && window.confirm(t('starter.replaceCharacter', { name: direction.name }))) {
                draft = await selectStarter(loaded.starter.id, loaded.starter.version, direction.id, true)
              }
              if (draft) onSelected()
            } catch { setError(true) } finally { setBusy('') }
          }}
        >
          <SceneRenderer label={direction.name} layers={resolveStarterSceneLayers(loaded, direction.id)}>
            <CharacterRenderer label={direction.name} layers={resolveStarterCharacterLayers(loaded, direction.id)} className="rounded-none border-0 bg-transparent" />
          </SceneRenderer>
          <span className="flex min-w-0 flex-col py-1">
            <span className="font-heading text-lg font-medium">{direction.name}</span>
            <span className="mt-1 text-sm leading-5 text-muted-foreground">{direction.summary}</span>
            <span className="mt-3 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              <span className="rounded-full bg-muted px-2 py-1">{t(direction.seed.completionMode === 'continuous' ? 'starter.ongoing' : 'starter.finite')}</span>
              {direction.seed.loopIds.map((id) => <span key={id} className="rounded-full bg-muted px-2 py-1">{id}</span>)}
            </span>
            <span className="mt-auto pt-4 text-xs text-muted-foreground">{t('starter.version', { name: loaded.starter.name, version: loaded.starter.version })}</span>
            <span className="mt-2 font-medium group-hover:underline">{choosing ? t('starter.choosing') : t('starter.use', { name: direction.name })}</span>
          </span>
        </button>
      }))}
    </div>}
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{t('starter.error')}</p>}
  </main>
}
