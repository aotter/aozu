import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { resolveStarterCharacterLayers } from '@/core/application/character-creation.ts'
import type { CharacterDraft } from '@/core/domain/character.ts'
import type { StarterCharacterSelection, ValidatedStarterPackage } from '@/core/domain/starter.ts'
import { CharacterRenderer } from '@/ui/CharacterRenderer'
import { DataControls } from '@/ui/DataControls'
import { Button } from '@/ui/components/ui/button'
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

export type CharacterLibraryItem = Pick<CharacterDraft, 'id' | 'name' | 'revision' | 'updatedAt' | 'published'>

export function CharacterLibraryPage({ characters, loadStarters, createCharacter, openCharacter, deleteCharacter, exportCharacter, importCharacter, refresh }: {
  characters: CharacterLibraryItem[]
  loadStarters(): Promise<ValidatedStarterPackage[]>
  createCharacter(selection: StarterCharacterSelection): Promise<CharacterDraft>
  openCharacter(id: string): void
  deleteCharacter(id: string): Promise<void>
  exportCharacter(id: string): Promise<Blob>
  importCharacter(blob: Blob): Promise<void>
  refresh(): Promise<void>
}) {
  const { t } = useTranslation()
  const [starters, setStarters] = useState<ValidatedStarterPackage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [deleting, setDeleting] = useState<CharacterLibraryItem>()

  useEffect(() => { void loadStarters().then(setStarters).catch(() => setError(t('characters.loadError'))) }, [loadStarters, t])

  const create = async (selection: StarterCharacterSelection) => {
    setBusy(true); setError(undefined)
    try { openCharacter((await createCharacter(selection)).id) }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) }
    finally { setBusy(false) }
  }

  return <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{t('characters.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('characters.description')}</p>
      </div>
      <DataControls prepareImport={async (blob) => { await importCharacter(blob); await refresh() }} />
    </div>

    {characters.length > 0 && <section className="mt-8">
      <h2 className="font-heading text-lg font-medium">{t('characters.saved')}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{characters.map((character) => {
        const current = character.published?.revision === character.revision
        return <article key={character.id} className="rounded-2xl border bg-background p-4 shadow-sm">
          <button className="w-full text-left" onClick={() => openCharacter(character.id)}>
            <h3 className="truncate font-heading font-medium">{character.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{character.published
              ? t(current ? 'characters.published' : 'characters.unpublishedChanges', { version: character.published.version })
              : t('characters.draft')}</p>
          </button>
          <div className="mt-4 flex items-center justify-end gap-2">
            <DataControls exportData={() => exportCharacter(character.id)} exportFilename={`${character.name}-character.zip`} exportIconOnly exportLabel={t('draft.download')} />
            <Button variant="destructive" onClick={() => setDeleting(character)}>{t('characters.delete')}</Button>
            <Button onClick={() => openCharacter(character.id)}>{t('characters.edit')}</Button>
          </div>
        </article>
      })}</div>
    </section>}

    <section className="mt-8">
      <h2 className="font-heading text-lg font-medium">{t('characters.new')}</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <button type="button" disabled={busy} onClick={() => void create(null)} className="rounded-2xl border p-3 text-left hover:border-foreground/40 disabled:opacity-50">
          <div className="flex aspect-[2/3] items-center justify-center rounded-xl border border-dashed bg-muted/30 text-sm text-muted-foreground">{t('starter.blank')}</div>
          <span className="mt-3 block font-medium">{t('starter.blankCharacter')}</span>
        </button>
        {starters.flatMap((loaded) => loaded.starter.characterStates.map((state) => <button
          key={`${loaded.starter.id}@${loaded.starter.version}:${state.id}`}
          type="button"
          disabled={busy}
          onClick={() => void create({ starterId: loaded.starter.id, starterVersion: loaded.starter.version, stateId: state.id })}
          className="rounded-2xl border p-3 text-left hover:border-foreground/40 disabled:opacity-50"
        >
          <CharacterRenderer label={state.name} layers={resolveStarterCharacterLayers(loaded, state.id)} />
          <span className="mt-3 block font-medium">{state.name}</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{state.summary}</span>
        </button>))}
      </div>
    </section>

    <section className="mt-8 flex items-center justify-between rounded-2xl border border-dashed p-4 text-muted-foreground">
      <div><h2 className="font-heading font-medium text-foreground">{t('characters.story.title')}</h2><p className="mt-1 text-xs">{t('characters.story.description')}</p></div>
      <Button disabled variant="secondary">{t('characters.story.comingSoon')}</Button>
    </section>
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}

    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !busy) setDeleting(undefined) }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{t('characters.deleteTitle')}</AlertDialogTitle><AlertDialogDescription>{deleting && t('characters.deleteDescription', { name: deleting.name })}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>{t('common.cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={(event) => {
          event.preventDefault()
          if (!deleting) return
          setBusy(true); setError(undefined)
          void deleteCharacter(deleting.id).then(refresh).then(() => setDeleting(undefined)).catch((caught) => setError(caught instanceof Error ? caught.message : String(caught))).finally(() => setBusy(false))
        }}>{t('characters.delete')}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main>
}
