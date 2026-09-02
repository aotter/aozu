import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/ui/components/ui/button'
import { DataControls } from '@/ui/DataControls'
import type { SavedCompanion } from '@/core/application/companion'
import type { StagedCandidatePreview } from '@/core/application/candidate'

const startOptions = ['starter', 'bundle'] as const

export function StartPage({ savedCompanions, pendingReview, authoringDraft, onOpenCompanion, onDeleteCompanion, onChooseStarter, onResumeReview, onResumeDraft, prepareImport }: {
  savedCompanions: SavedCompanion[]
  pendingReview: StagedCandidatePreview | null
  authoringDraft: { characterName: string | null; destination: '/character/expressions' | '/create' } | null
  onOpenCompanion(bundleId: string): Promise<void>
  onDeleteCompanion(bundleId: string): Promise<void>
  onChooseStarter(): void
  onResumeReview(): void
  onResumeDraft(destination: '/character/expressions' | '/create'): void
  prepareImport(blob: Blob): Promise<void>
}) {
  const { t } = useTranslation()
  const [deleting, setDeleting] = useState<string>()
  const [deleteError, setDeleteError] = useState(false)

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
      {authoringDraft && <section className="mt-8">
        <h2 className="font-heading text-lg font-medium">{t('start.draft.title')}</h2>
        <article className="mt-3 flex items-center justify-between gap-4 rounded-2xl border bg-background p-4 shadow-sm">
          <div className="min-w-0">
            {authoringDraft.characterName && <h3 className="truncate font-heading font-medium">{authoringDraft.characterName}</h3>}
            <p className="mt-1 text-xs text-muted-foreground">{t(`start.draft.${authoringDraft.destination === '/create' ? 'experience' : 'character'}`)}</p>
          </div>
          <Button onClick={() => onResumeDraft(authoringDraft.destination)}>{t('start.draft.resume')}</Button>
        </article>
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
              <Button variant="destructive" disabled={Boolean(deleting)} onClick={async () => {
                if (!window.confirm(t('start.saved.confirmDelete', { name: companion.name }))) return
                setDeleting(companion.bundleId); setDeleteError(false)
                try { await onDeleteCompanion(companion.bundleId) } catch { setDeleteError(true) } finally { setDeleting(undefined) }
              }}>{t('start.saved.delete')}</Button>
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
  </>
}
