import { PlusIcon, SparklesIcon, Trash2Icon } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import type { StagedCandidatePreview } from '@/core/application/candidate'
import type { SavedCompanion } from '@/core/application/companion'
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
import { localizedText } from '@/ui/localizedText'

const CARD_SLOTS = 10

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
  const { t, i18n } = useTranslation()
  const localize = (value: string) => localizedText(value, i18n.resolvedLanguage ?? i18n.language)
  const [deleting, setDeleting] = useState<string>()
  const [deleteError, setDeleteError] = useState(false)
  const [confirmation, setConfirmation] = useState<{ kind: 'draft' | 'companion'; id: string; name: string }>()
  const visibleCompanions = savedCompanions.slice(0, CARD_SLOTS)
  const slots = Array.from({ length: CARD_SLOTS }, (_, index) => visibleCompanions[index])
  const deleteConfirmed = async () => {
    if (!confirmation || deleting) return
    setDeleting(confirmation.id); setDeleteError(false)
    try {
      await (confirmation.kind === 'draft' ? onDeleteDraft(confirmation.id) : onDeleteCompanion(confirmation.id))
      setConfirmation(undefined)
    } catch { setDeleteError(true) } finally { setDeleting(undefined) }
  }

  return <>
    <main className="parchment-screen home-parchment">
      <header className="home-hero">
        <p className="eyebrow"><SparklesIcon aria-hidden="true" />{t('start.eyebrow')}</p>
        <h1>{t('start.title')}</h1>
        <p>{t('start.description')}</p>
      </header>

      {(pendingReview || authoringDrafts.length > 0) && <section className="stitched-panel continue-panel">
        <h2>{t(pendingReview ? 'start.pending.title' : 'start.draft.title')}</h2>
        {pendingReview && <article className="continue-row">
          <span><b>{localize(pendingReview.name)}</b><small>{t('start.pending.description')}</small></span>
          <Button onClick={onResumeReview}>{t('start.pending.resume')}</Button>
        </article>}
        {authoringDrafts.map((draft) => <article key={draft.id} className="continue-row">
          <span><b>{localize(draft.name)}</b><small>{t(`start.draft.${draft.status}`)}</small></span>
          <span className="continue-actions">
            <DataControls exportData={() => exportCharacterDraft(draft.id)} exportFilename={`${draft.name}-draft.zip`} exportIconOnly exportLabel={t('draft.download')} />
            <Button variant="destructive" disabled={Boolean(deleting)} onClick={() => setConfirmation({ kind: 'draft', id: draft.id, name: localize(draft.name) })}>{t('start.saved.delete')}</Button>
            <Button onClick={() => onResumeDraft(draft.destination)}>{t('start.draft.resume')}</Button>
          </span>
        </article>)}
      </section>}

      <section className="card-vault" aria-labelledby="card-vault-title">
        <div className="vault-heading">
          <span><small>{t('start.saved.kicker')}</small><h2 id="card-vault-title">{t('start.saved.title')}</h2></span>
          <span className="card-count">{visibleCompanions.length} / {CARD_SLOTS}</span>
        </div>
        <p className="vault-hint">{t('start.saved.hint')}</p>
        <div className="companion-card-fan">
          {slots.map((companion, index) => {
            const center = (CARD_SLOTS - 1) / 2
            const distance = index - center
            const style = {
              '--card-angle': `${distance * 5.5}deg`,
              '--card-offset': `${distance * 3.3}rem`,
              '--card-lift': `${Math.abs(distance) * 0.42}rem`,
              '--card-z': index + 1,
            } as CSSProperties
            const companionName = companion ? localize(companion.name) : ''
            return <article key={companion?.bundleId ?? `empty-${index}`} className={`companion-card-slot ${companion ? 'is-saved' : 'is-empty'}`} style={style}>
              {companion ? <>
                <button type="button" className="companion-card-face" onClick={() => void onOpenCompanion(companion.bundleId)}>
                  <span className="card-crest">AOZU</span>
                  <span className="card-orbit" aria-hidden="true" />
                  <strong>{companionName}</strong>
                  <small>{companion.active ? t('start.saved.current') : t('start.saved.open')}</small>
                </button>
                <button type="button" className="card-delete" aria-label={`${t('start.saved.delete')} ${companionName}`} disabled={Boolean(deleting)} onClick={() => setConfirmation({ kind: 'companion', id: companion.bundleId, name: companionName })}><Trash2Icon /></button>
              </> : <button type="button" className="companion-card-face empty-card" onClick={onChooseStarter} aria-label={t('start.card.create')}>
                <PlusIcon aria-hidden="true" />
              </button>}
            </article>
          })}
        </div>
      </section>

      <section className="home-actions stitched-panel">
        <div><h2>{t('start.options.starter.title')}</h2><p>{t('start.options.starter.description')}</p></div>
        <Button onClick={onChooseStarter}><PlusIcon />{t('start.chooseStarter')}</Button>
        <div><h2>{t('start.options.bundle.title')}</h2><p>{t('start.options.bundle.description')}</p></div>
        <DataControls prepareImport={prepareImport} />
      </section>
      {deleteError && <p role="alert" className="form-error">{t('start.saved.deleteError')}</p>}
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
