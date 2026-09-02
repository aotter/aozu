import { useState } from 'react'
import { useTranslation } from 'react-i18next'

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
import { DataControls } from '@/ui/DataControls'
import type { SavedCompanion } from '@/core/application/companion'
import type { StagedCandidatePreview } from '@/core/application/candidate'

const startOptions = ['starter', 'bundle'] as const

export function StartPage({ savedCompanions, pendingReview, authoringDrafts, onOpenCompanion, onDeleteCompanion, onChooseStarter, onResumeReview, onResumeDraft, onDeleteDraft, exportCharacterDraft, prepareImport }: {
  savedCompanions: SavedCompanion[]
  pendingReview: StagedCandidatePreview | null
  authoringDrafts: Array<{ id: string; name: string; status: 'character' | 'experience'; destination: string }>
  onOpenCompanion(bundleId: string): Promise<void>
  onDeleteCompanion(bundleId: string): Promise<void>
  onChooseStarter(): void
  onResumeReview(): void
  onResumeDraft(destination: string): void
  onDeleteDraft(draftId: string): Promise<void>
  exportCharacterDraft(draftId: string): Promise<Blob>
  prepareImport(blob: Blob): Promise<void>
}) {
  const { t } = useTranslation()
  const [deleting, setDeleting] = useState<string>()
  const [deleteError, setDeleteError] = useState(false)
  const [confirmation, setConfirmation] = useState<{ kind: 'draft' | 'companion'; id: string; name: string }>()
  const deleteConfirmed = async () => {
    if (!confirmation || deleting) return
    setDeleting(confirmation.id); setDeleteError(false)
    try {
      await (confirmation.kind === 'draft' ? onDeleteDraft(confirmation.id) : onDeleteCompanion(confirmation.id))
      setConfirmation(undefined)
    } catch { setDeleteError(true) } finally { setDeleting(undefined) }
  }

  return <>
    <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-3xl flex-col justify-center px-4 py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">{t('start.title')}</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{t('start.description')}</p>
      {pendingReview && <section className="mt-8">
        <h2 className="font-heading text-lg font-medium">{t('start.pending.title')}</h2>
        <article className="mt-3 flex items-center justify-between gap-4 rounded-2xl border bg-background p-4 shadow-sm">
          <div className="min-w-0">
            <h3 className="truncate font-heading font-medium">{pendingReview.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t('start.pending.description')}</p>
          </div>
          <Button onClick={onResumeReview}>{t('start.pending.resume')}</Button>
        </article>
      </section>}
      {authoringDrafts.length > 0 && <section className="mt-8">
        <h2 className="font-heading text-lg font-medium">{t('start.draft.title')}</h2>
        <div className="mt-3 grid gap-3">{authoringDrafts.map((draft) => <article key={draft.id} className="flex flex-col items-stretch justify-between gap-4 rounded-2xl border bg-background p-4 shadow-sm sm:flex-row sm:items-center">
          <div className="min-w-0">
            <h3 className="truncate font-heading font-medium">{draft.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t(`start.draft.${draft.status}`)}</p>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            <DataControls exportData={() => exportCharacterDraft(draft.id)} exportFilename={`${draft.name}-draft.zip`} exportIconOnly exportLabel={t('draft.download')} />
            <Button variant="destructive" disabled={Boolean(deleting)} onClick={() => setConfirmation({ kind: 'draft', id: draft.id, name: draft.name })}>{t('start.saved.delete')}</Button>
            <Button onClick={() => onResumeDraft(draft.destination)}>{t('start.draft.resume')}</Button>
          </div>
        </article>)}</div>
        {deleteError && <p role="alert" className="mt-2 text-sm text-destructive">{t('start.saved.deleteError')}</p>}
      </section>}
      {savedCompanions.length > 0 && <section className="mt-8">
        <h2 className="font-heading text-lg font-medium">{t('start.saved.title')}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {savedCompanions.map((companion) => <article key={companion.bundleId} className="flex items-center justify-between gap-4 rounded-2xl border bg-background p-4 shadow-sm">
            <div className="min-w-0">
              <h3 className="truncate font-heading font-medium">{companion.name}</h3>
              {companion.active && <p className="mt-1 text-xs text-muted-foreground">{t('start.saved.current')}</p>}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button disabled={Boolean(deleting)} onClick={() => void onOpenCompanion(companion.bundleId)}>{t(companion.active ? 'start.saved.continue' : 'start.saved.open')}</Button>
              <Button variant="destructive" disabled={Boolean(deleting)} onClick={() => setConfirmation({ kind: 'companion', id: companion.bundleId, name: companion.name })}>{t('start.saved.delete')}</Button>
            </div>
          </article>)}
        </div>
        {deleteError && <p role="alert" className="mt-2 text-sm text-destructive">{t('start.saved.deleteError')}</p>}
      </section>}
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {startOptions.map((option) => <section key={option} className="flex min-h-40 flex-col rounded-2xl border bg-background p-4 shadow-sm">
          <h2 className="font-heading font-medium">{t(`start.options.${option}.title`)}</h2>
          <p className="mt-2 text-sm leading-5 text-muted-foreground">{t(`start.options.${option}.description`)}</p>
          {option === 'bundle' ? <div className="mt-auto"><DataControls prepareImport={prepareImport} /></div> : <Button className="mt-auto" onClick={onChooseStarter}>{t('start.chooseStarter')}</Button>}
        </section>)}
      </div>
    </main>
    <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open && !deleting) setConfirmation(undefined) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(`start.${confirmation?.kind === 'draft' ? 'draft' : 'saved'}.deleteTitle`)}</AlertDialogTitle>
          <AlertDialogDescription>{confirmation && t(`start.${confirmation.kind === 'draft' ? 'draft' : 'saved'}.confirmDelete`, { name: confirmation.name })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={Boolean(deleting)}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={Boolean(deleting)} onClick={(event) => { event.preventDefault(); void deleteConfirmed() }}>
            {deleting ? t('start.saved.deleting') : t('start.saved.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
}
