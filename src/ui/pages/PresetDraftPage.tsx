import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { AgentCustomization } from '@/core/application/authoring.ts'
import { Button } from '@/ui/components/ui/button'

export function PresetDraftPage({ seed, onReview, onCancel }: {
  seed: AgentCustomization
  onReview(customization: AgentCustomization): Promise<void>
  onCancel(): void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(seed)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const stageIndex = draft.stages.findIndex(({ id }) => id === draft.initialStageId)
  const stage = draft.stages[stageIndex]!
  const updateStage = (values: Partial<typeof stage>) => setDraft((current) => ({
    ...current,
    stages: current.stages.map((item, index) => index === stageIndex ? { ...item, ...values } : item),
  }))

  return <>
    <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-xl flex-col justify-center px-4 py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">{t('draft.title')}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('draft.description')}</p>
      <form className="mt-6 grid gap-4" onSubmit={async (event) => {
        event.preventDefault()
        setBusy(true)
        setError(false)
        try { await onReview(draft) } catch { setError(true); setBusy(false) }
      }}>
        <label className="grid gap-1.5 text-sm">
          <span>{t('draft.name')}</span>
          <input className="rounded-md border bg-background px-3 py-2" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span>{t('draft.initialTitle')}</span>
          <input className="rounded-md border bg-background px-3 py-2" value={stage.title} onChange={(event) => updateStage({ title: event.target.value })} />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span>{t('draft.narrative')}</span>
          <textarea className="min-h-28 rounded-md border bg-background px-3 py-2" value={stage.narrative} onChange={(event) => updateStage({ narrative: event.target.value })} />
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>{busy ? t('draft.validating') : t('draft.review')}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{t('draft.cancel')}</Button>
        </div>
      </form>
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{t('startup.error')}</p>}
    </main>
  </>
}
