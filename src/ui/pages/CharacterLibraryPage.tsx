import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { CharacterDraft } from '@/core/domain/character.ts'
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

export type CharacterLibraryItem = Pick<CharacterDraft, 'id' | 'name' | 'updatedAt'>

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
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [deleting, setDeleting] = useState<CharacterLibraryItem>()

  const create = async () => {
    setBusy(true); setError(undefined)
    try { openCharacter((await createCharacter()).id) }
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
        return <article key={character.id} className="rounded-2xl border bg-background p-4 shadow-sm">
          <button className="w-full text-left" onClick={() => openCharacter(character.id)}>
            <h3 className="truncate font-heading font-medium">{character.name}</h3>
          </button>
          <div className="mt-4 flex items-center justify-end gap-2">
            <DataControls exportData={() => exportCharacter(character.id)} exportFilename={`${character.name}-character.zip`} exportIconOnly exportLabel={t('draft.download')} />
            <Button variant="destructive" onClick={() => setDeleting(character)}>{t('characters.delete')}</Button>
            <Button variant="outline" disabled={busy} onClick={() => { setBusy(true); void copyCharacter(character.id).then(refresh).catch((caught) => setError(caught instanceof Error ? caught.message : String(caught))).finally(() => setBusy(false)) }}>{t('characters.copy')}</Button>
            <Button onClick={() => openCharacter(character.id)}>{t('characters.edit')}</Button>
          </div>
        </article>
      })}</div>
    </section>}

    <section className="mt-8">
      <Button disabled={busy} onClick={() => void create()}>
        {busy ? t('starter.choosing') : t('characters.new')}
      </Button>
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
