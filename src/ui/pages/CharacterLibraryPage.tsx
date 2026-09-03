import { PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { CharacterDraft, ResolvedCharacterLayer } from '@/core/domain/character.ts'
import { AozuIcon } from '@/ui/AozuIcon'
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

export type CharacterLibraryItem = Pick<CharacterDraft, 'id' | 'name' | 'updatedAt'> & {
  /** The persisted Mantle entry version, projected together with `updatedAt` from one settled snapshot. */
  revision: number
  layers: Array<ResolvedCharacterLayer & { blob: Blob }>
}

export function CharacterLibraryPage({ characters, createCharacter, openCharacter, copyCharacter, deleteCharacter, exportCharacter, importCharacter, refresh }: {
  characters: CharacterLibraryItem[]
  createCharacter(): Promise<CharacterDraft>
  openCharacter(id: string): void
  copyCharacter(id: string): Promise<CharacterDraft>
  deleteCharacter(id: string): Promise<void>
  exportCharacter(id: string): Promise<Blob>
  importCharacter(blob: Blob): Promise<void>
  refresh(): Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const updatedAtFormat = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: 'medium', timeStyle: 'short' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [deleting, setDeleting] = useState<CharacterLibraryItem>()

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true); setError(undefined)
    try { await task() }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) }
    finally { setBusy(false) }
  }

  return <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
    <section className="forge-hero" aria-labelledby="characters-title">
      <div className="min-w-0">
        <p className="forge-kicker"><AozuIcon name="archive" /> {t('characters.kicker')}</p>
        <h1 id="characters-title" className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">{t('characters.title')}</h1>
        <p className="mt-3 max-w-xl leading-7 text-muted-foreground">{t('characters.description')}</p>
      </div>
      <AozuIcon name="book" className="forge-seal" />
    </section>

    <div className="mt-6 flex flex-wrap items-center gap-3">
      <Button size="lg" disabled={busy} onClick={() => void run(async () => openCharacter((await createCharacter()).id))}>
        <PlusIcon aria-hidden="true" />{t('characters.new')}
      </Button>
      <DataControls prepareImport={async (blob) => { await importCharacter(blob); await refresh() }} />
      <span className="vault-count ml-auto">{t('characters.count', { count: characters.length })}</span>
    </div>

    <section className="character-vault mt-6" aria-label={t('characters.title')}>
      {characters.length === 0
        ? <p className="leading-6 text-muted-foreground">{t('characters.empty')}</p>
        : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{characters.map((character) => <article key={character.id} className="rounded-2xl border p-3">
          <button type="button" className="character-portrait block w-full" aria-label={character.name} onClick={() => openCharacter(character.id)}>
            <CharacterRenderer label={character.name} layers={character.layers} />
          </button>
          <h3 className="mt-3 truncate font-heading text-lg font-semibold">{character.name}</h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {t('characters.revision', { revision: character.revision })} · {t('characters.updated', { updated: updatedAtFormat.format(character.updatedAt) })}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => openCharacter(character.id)}>{t('characters.edit')}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => copyCharacter(character.id).then(refresh))}>{t('characters.copy')}</Button>
            <DataControls exportData={() => exportCharacter(character.id)} exportFilename={`${character.name}-character.zip`} exportIconOnly exportLabel={t('draft.download')} />
            <Button size="sm" variant="destructive" className="ml-auto" onClick={() => setDeleting(character)}>{t('characters.delete')}</Button>
          </div>
        </article>)}</div>}
    </section>

    <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5">
      <div className="min-w-0">
        <h2 className="font-heading text-xl font-medium">{t('characters.story.title')}</h2>
        <p className="mt-1 text-muted-foreground">{t('characters.story.description')}</p>
      </div>
      <Button disabled variant="secondary">{t('characters.story.comingSoon')}</Button>
    </section>
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}

    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !busy) setDeleting(undefined) }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{t('characters.deleteTitle')}</AlertDialogTitle><AlertDialogDescription>{deleting && t('characters.deleteDescription', { name: deleting.name })}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>{t('common.cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={(event) => {
          event.preventDefault()
          if (!deleting) return
          void run(() => deleteCharacter(deleting.id).then(refresh).then(() => setDeleting(undefined)))
        }}>{t('characters.delete')}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main>
}
