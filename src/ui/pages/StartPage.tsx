import { PlusIcon, Trash2Icon } from 'lucide-react'
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
import { AozuIcon } from '@/ui/AozuIcon'
import type { SavedCompanion } from '@/core/application/companion'
import type { StagedCandidatePreview } from '@/core/application/candidate'

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
  const cardCount = 10
  const cardSlots = Array.from({ length: cardCount }, (_, index) => savedCompanions.slice(0, 9)[index])
  const additionalCompanions = savedCompanions.slice(9)
  const fanMiddle = (cardSlots.length - 1) / 2
  const deleteConfirmed = async () => {
    if (!confirmation || deleting) return
    setDeleting(confirmation.id); setDeleteError(false)
    try {
      await (confirmation.kind === 'draft' ? onDeleteDraft(confirmation.id) : onDeleteCompanion(confirmation.id))
      setConfirmation(undefined)
    } catch { setDeleteError(true) } finally { setDeleting(undefined) }
  }

  return <>
    <main className="start-page mx-auto min-h-[calc(100svh-3.5rem)] w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="forge-hero" aria-labelledby="start-title">
        <div>
          <p className="forge-kicker"><AozuIcon name="book" /> {t('start.bookKicker')}</p>
          <h1 id="start-title" className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">{t('start.title')}</h1>
          <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">{t('start.description')}</p>
        </div>
        <AozuIcon name="book" className="forge-seal" />
      </section>

      <section className="companion-vault mt-10" aria-labelledby="saved-companions-title">
        <div className="vault-heading">
          <div>
            <p className="forge-kicker"><AozuIcon name="archive" /> {t('start.archiveKicker')}</p>
            <h2 id="saved-companions-title" className="font-heading text-2xl font-medium">{t('start.saved.title')}</h2>
          </div>
          <span className="vault-count">{t('start.saved.count', { count: savedCompanions.length })}</span>
        </div>

        <div className="companion-fan-shell">
          <div className="companion-fan" aria-label={t('start.saved.title')}>
            {cardSlots.map((companion, index) => {
              const offset = index - fanMiddle
              const style = { transform: `translate(calc(-50% + ${offset * 48}px), ${Math.abs(offset) * 7}px) rotate(${offset * 4.25}deg)` }
              if (!companion) return <button
                key={`empty-${index}`}
                type="button"
                className="companion-card is-empty"
                style={style}
                aria-label={t('start.chooseStarter')}
                onClick={onChooseStarter}
              >
                <span className="blank-card-figure" aria-hidden="true" />
                <PlusIcon className="blank-card-plus" aria-hidden="true" />
              </button>

              return <article key={companion.bundleId} className={`companion-card is-saved${companion.active ? ' is-active' : ''}`} style={style}>
                <button className="companion-card-open" type="button" onClick={() => void onOpenCompanion(companion.bundleId)}>
                  <span className="companion-card-crest" aria-hidden="true">{companion.name.trim().slice(0, 2).toUpperCase()}</span>
                  <span className="companion-card-name">{companion.name}</span>
                  <span className="companion-card-status">{t(companion.active ? 'start.saved.current' : 'start.saved.open')}</span>
                </button>
                <Button className="companion-card-delete" size="icon" variant="destructive" disabled={Boolean(deleting)} aria-label={`${t('start.saved.delete')} ${companion.name}`} onClick={() => setConfirmation({ kind: 'companion', id: companion.bundleId, name: companion.name })}>
                  <Trash2Icon aria-hidden="true" />
                </Button>
              </article>
            })}
          </div>
        </div>
        {additionalCompanions.length > 0 && <details className="saved-overflow">
          <summary>{t('start.saved.more', { count: additionalCompanions.length })}</summary>
          <div className="saved-overflow-grid">
            {additionalCompanions.map((companion) => <article key={companion.bundleId}>
              <button type="button" onClick={() => void onOpenCompanion(companion.bundleId)}>
                <span className="overflow-crest" aria-hidden="true">{companion.name.trim().slice(0, 2).toUpperCase()}</span>
                <span>{companion.name}</span>
              </button>
              <Button size="icon" variant="destructive" disabled={Boolean(deleting)} aria-label={`${t('start.saved.delete')} ${companion.name}`} onClick={() => setConfirmation({ kind: 'companion', id: companion.bundleId, name: companion.name })}>
                <Trash2Icon aria-hidden="true" />
              </Button>
            </article>)}
          </div>
        </details>}
        {deleteError && <p role="alert" className="mt-2 text-sm text-destructive">{t('start.saved.deleteError')}</p>}
      </section>

      <div className="start-gates mt-8 grid gap-4 sm:grid-cols-2">
        <section className="start-gate rounded-2xl border bg-background p-5 shadow-sm">
          <div className="gate-icon"><AozuIcon name="book" /></div>
          <div className="min-w-0">
            <h2 className="font-heading text-xl font-medium">{t('start.options.starter.title')}</h2>
            <p className="mt-2 leading-6 text-muted-foreground">{t('start.options.starter.description')}</p>
          </div>
          <Button className="gate-action" onClick={onChooseStarter}><PlusIcon aria-hidden="true" />{t('start.chooseStarter')}</Button>
        </section>
        <section className="start-gate rounded-2xl border bg-background p-5 shadow-sm">
          <div className="gate-icon"><AozuIcon name="import" /></div>
          <div className="min-w-0">
            <h2 className="font-heading text-xl font-medium">{t('start.options.bundle.title')}</h2>
            <p className="mt-2 leading-6 text-muted-foreground">{t('start.options.bundle.description')}</p>
          </div>
          <div className="gate-action"><DataControls prepareImport={prepareImport} /></div>
        </section>
      </div>

      {(pendingReview || authoringDrafts.length > 0) && <section className="draft-pouch mt-8" aria-labelledby="draft-pouch-title">
        <div className="draft-pouch-heading">
          <AozuIcon name="archive" />
          <h2 id="draft-pouch-title" className="font-heading text-lg font-medium">{t('start.draft.title')}</h2>
        </div>
        <div className="draft-pouch-list">
          {pendingReview && <article className="draft-pouch-item">
            <div className="min-w-0">
              <h3 className="truncate font-heading font-medium">{pendingReview.name}</h3>
              <p>{t('start.pending.description')}</p>
            </div>
            <Button onClick={onResumeReview}>{t('start.pending.resume')}</Button>
          </article>}
          {authoringDrafts.map((draft) => <article key={draft.id} className="draft-pouch-item">
            <div className="min-w-0">
              <h3 className="truncate font-heading font-medium">{draft.name}</h3>
              <p>{t(`start.draft.${draft.status}`)}</p>
            </div>
            <div className="draft-pouch-actions">
              <DataControls exportData={() => exportCharacterDraft(draft.id)} exportFilename={`${draft.name}-draft.zip`} exportIconOnly exportLabel={t('draft.download')} />
              <Button variant="destructive" disabled={Boolean(deleting)} onClick={() => setConfirmation({ kind: 'draft', id: draft.id, name: draft.name })}>{t('start.saved.delete')}</Button>
              <Button onClick={() => onResumeDraft(draft.destination)}>{t('start.draft.resume')}</Button>
            </div>
          </article>)}
        </div>
        {deleteError && <p role="alert" className="mt-2 text-sm text-destructive">{t('start.saved.deleteError')}</p>}
      </section>}
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
