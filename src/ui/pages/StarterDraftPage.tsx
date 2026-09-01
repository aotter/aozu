import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { resolveStarterCharacterLayers } from '@/core/application/character-creation.ts'
import { resolveStarterSceneLayers } from '@/core/application/scene.ts'
import type {
  ExperienceDraft,
  StarterCharacterSelection,
  StarterStorySelection,
  ValidatedStarterPackage,
} from '@/core/domain/starter.ts'
import { CharacterRenderer } from '@/ui/CharacterRenderer'
import { SceneRenderer } from '@/ui/SceneRenderer'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/ui/components/ui/alert-dialog'
import { Button } from '@/ui/components/ui/button'

const selected = (
  value: StarterCharacterSelection | StarterStorySelection,
  starterId: string,
  starterVersion: number,
  resourceId: string,
) => Boolean(value && value.starterId === starterId && value.starterVersion === starterVersion &&
  ('stateId' in value ? value.stateId : value.directionId) === resourceId)

export function StarterDraftPage({ loadStarters, startCreation, onSelected }: {
  loadStarters(): Promise<ValidatedStarterPackage[]>
  startCreation(character: StarterCharacterSelection, story: StarterStorySelection, replaceCharacterDraft?: boolean): Promise<ExperienceDraft | null>
  onSelected(): void
}) {
  const { t } = useTranslation()
  const [packages, setPackages] = useState<ValidatedStarterPackage[]>()
  const [character, setCharacter] = useState<StarterCharacterSelection>(null)
  const [story, setStory] = useState<StarterStorySelection>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [replaceRequired, setReplaceRequired] = useState(false)

  useEffect(() => {
    let live = true
    void loadStarters().then((loaded) => { if (live) setPackages(loaded) }).catch(() => live && setError(true))
    return () => { live = false }
  }, [loadStarters])

  if (!packages && !error) return <main className="mx-auto w-full max-w-4xl px-4 py-10"><p>{t('startup.loading')}</p></main>

  const begin = async (replaceCharacterDraft = false) => {
    setBusy(true); setError(false)
    try {
      const draft = await startCreation(character, story, replaceCharacterDraft)
      if (!draft) return setReplaceRequired(true)
      if (draft) onSelected()
    } catch { setError(true) } finally { setBusy(false) }
  }

  return <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
    <h1 className="font-heading text-3xl font-semibold tracking-tight">{t('starter.title')}</h1>
    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{t('starter.description')}</p>

    <section className="mt-8">
      <h2 className="font-heading text-xl font-medium">{t('starter.characterTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('starter.characterDescription')}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <button type="button" aria-pressed={character === null} onClick={() => setCharacter(null)}
          className="rounded-2xl border p-3 text-left aria-pressed:border-foreground aria-pressed:ring-1 aria-pressed:ring-foreground">
          <div className="flex aspect-[2/3] items-center justify-center rounded-xl border border-dashed bg-muted/30 text-sm text-muted-foreground">{t('starter.blank')}</div>
          <span className="mt-3 block font-medium">{t('starter.blankCharacter')}</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{t('starter.blankCharacterDescription')}</span>
        </button>
        {packages?.flatMap((loaded) => loaded.starter.characterStates.map((state) => {
          const active = selected(character, loaded.starter.id, loaded.starter.version, state.id)
          return <button key={`${loaded.starter.id}@${loaded.starter.version}:${state.id}`} type="button" aria-pressed={active}
            onClick={() => setCharacter({ starterId: loaded.starter.id, starterVersion: loaded.starter.version, stateId: state.id })}
            className="rounded-2xl border p-3 text-left aria-pressed:border-foreground aria-pressed:ring-1 aria-pressed:ring-foreground">
            <CharacterRenderer label={state.name} layers={resolveStarterCharacterLayers(loaded, state.id)} />
            <span className="mt-3 block font-medium">{state.name}</span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">{state.summary}</span>
          </button>
        }))}
      </div>
    </section>

    <section className="mt-8">
      <h2 className="font-heading text-xl font-medium">{t('starter.storyTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('starter.storyDescription')}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <button type="button" aria-pressed={story === null} onClick={() => setStory(null)}
          className="rounded-2xl border p-3 text-left aria-pressed:border-foreground aria-pressed:ring-1 aria-pressed:ring-foreground">
          <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed bg-muted/30 text-sm text-muted-foreground">{t('starter.blank')}</div>
          <span className="mt-3 block font-medium">{t('starter.blankStory')}</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{t('starter.blankStoryDescription')}</span>
        </button>
        {packages?.flatMap((loaded) => loaded.starter.directions.map((direction) => {
          const active = selected(story, loaded.starter.id, loaded.starter.version, direction.id)
          return <button key={`${loaded.starter.id}@${loaded.starter.version}:${direction.id}`} type="button" aria-pressed={active}
            onClick={() => setStory({ starterId: loaded.starter.id, starterVersion: loaded.starter.version, directionId: direction.id })}
            className="rounded-2xl border p-3 text-left aria-pressed:border-foreground aria-pressed:ring-1 aria-pressed:ring-foreground">
            <SceneRenderer label={direction.name} layers={resolveStarterSceneLayers(loaded, direction.id)} />
            <span className="mt-3 block font-medium">{direction.name}</span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">{direction.summary}</span>
          </button>
        }))}
      </div>
    </section>

    <div className="mt-8 flex items-center gap-3">
      <Button disabled={busy || !packages} onClick={() => void begin()}>{busy ? t('starter.choosing') : t('starter.continue')}</Button>
      {error && <p role="alert" className="text-sm text-destructive">{t('starter.error')}</p>}
    </div>
    <AlertDialog open={replaceRequired} onOpenChange={setReplaceRequired}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('starter.replaceCharacterTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('starter.replaceCharacter')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t('starter.cancelReplace')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onClick={() => void begin(true)}>
            {busy ? t('starter.choosing') : t('starter.replaceAndContinue')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main>
}
