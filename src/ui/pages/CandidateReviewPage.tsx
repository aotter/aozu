import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { StagedCandidatePreview } from '@/core/application/candidate.ts'
import { CharacterRenderer } from '@/ui/CharacterRenderer'
import { SceneRenderer } from '@/ui/SceneRenderer'
import { Button } from '@/ui/components/ui/button'

export function CandidateReviewPage({ preview, onApprove, onCancel }: {
  preview: StagedCandidatePreview
  onApprove(): Promise<void>
  onCancel(): Promise<void>
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setError(false)
    try { await task() } catch { setError(true); setBusy(false) }
  }

  return <>
    <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-xl flex-col justify-center px-4 py-10">
      <p className="text-sm font-medium text-muted-foreground">{t(`candidate.source.${preview.source}`)}</p>
      <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">{t('candidate.title')}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('candidate.description')}</p>
      <section className="mt-6 rounded-2xl border bg-background p-5 shadow-sm">
        <h2 className="font-heading text-lg font-medium">{preview.name}</h2>
        {preview.source === 'character' && <div className="mx-auto mt-4 max-w-xs"><CharacterRenderer label={preview.name} layers={preview.layers} /></div>}
        {preview.source === 'experience' && <div className="mx-auto mt-4 max-w-xs">{preview.sceneLayers.length
          ? <SceneRenderer label={preview.initialTitle} layers={preview.sceneLayers}>
              <CharacterRenderer label={preview.name} layers={preview.characterLayers} className="size-full rounded-none border-0 bg-transparent" />
            </SceneRenderer>
          : <CharacterRenderer label={preview.name} layers={preview.characterLayers} />}</div>}
        <dl className="mt-4 grid gap-2 text-sm">
          {preview.source === 'experience' ? <>
            {preview.story && <>
              <div className="flex justify-between gap-4"><dt>{t('candidate.starter')}</dt><dd>{preview.story.starter.name} · v{preview.story.starter.version}</dd></div>
              <div className="flex justify-between gap-4"><dt>{t('candidate.direction')}</dt><dd>{preview.story.direction.name}</dd></div>
            </>}
            <div className="flex justify-between gap-4"><dt>{t('candidate.loops')}</dt><dd>{preview.seed.loopIds.join(' + ')}</dd></div>
            <div className="flex justify-between gap-4"><dt>{t('candidate.completionMode')}</dt><dd>{preview.seed.completionMode}</dd></div>
            <div className="flex justify-between gap-4"><dt>{t('candidate.stages')}</dt><dd>{preview.stageCount}</dd></div>
            <div className="flex justify-between gap-4"><dt>{t('candidate.initialStage')}</dt><dd>{preview.initialTitle}</dd></div>
            <div className="flex justify-between gap-4"><dt>{t('candidate.fallbacks')}</dt><dd>{preview.agentFallbackCount}</dd></div>
            <div className="mt-2"><dt className="font-medium">{t('candidate.initialContent')}</dt><dd className="mt-1 text-muted-foreground">{preview.initialNarrative}</dd></div>
          </> : preview.source === 'import' ? <>
            <div className="flex justify-between gap-4"><dt>{t('candidate.entries')}</dt><dd>{preview.entryCount}</dd></div>
            <div className="flex justify-between gap-4"><dt>{t('candidate.assets')}</dt><dd>{preview.assetCount}</dd></div>
          </> : <div className="flex justify-between gap-4"><dt>{t('candidate.appearances')}</dt><dd>{preview.appearanceCount}</dd></div>}
        </dl>
      </section>
      <div className="mt-6 flex gap-2">
        <Button disabled={busy} onClick={() => void run(onApprove)}>{busy ? t(preview.source === 'character' ? 'candidate.saving' : 'candidate.activating') : t(preview.source === 'character' ? 'candidate.saveCharacter' : 'candidate.approve')}</Button>
        <Button variant="outline" disabled={busy} onClick={() => void run(onCancel)}>{t('candidate.cancel')}</Button>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{t('startup.error')}</p>}
    </main>
  </>
}
