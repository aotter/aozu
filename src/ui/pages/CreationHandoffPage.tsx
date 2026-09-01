import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { InstalledCharacterPackProjection } from '@/core/application/character-creation.ts'
import type { ExperienceDraft } from '@/core/domain/starter.ts'
import { StatusPage } from '@/ui/pages/StatusPage'

type Summary = { character: string; story?: string }

export function CreationHandoffPage({ loadDraft, loadPacks }: {
  loadDraft(): Promise<ExperienceDraft | null>
  loadPacks(): Promise<InstalledCharacterPackProjection[]>
}) {
  const { t } = useTranslation()
  const [summary, setSummary] = useState<Summary | null>()

  useEffect(() => {
    let active = true
    void Promise.all([loadDraft(), loadPacks()]).then(([draft, packs]) => {
      if (!draft) throw new Error('Experience Draft not found')
      const pack = draft.character && packs.find(({ id, version }) => id === draft.character?.packId && version === draft.character.packVersion)
      if (!pack) throw new Error('Selected Character Pack not found')
      if (active) setSummary({ character: pack.name, story: draft.story?.direction.name })
    }).catch(() => active && setSummary(null))
    return () => { active = false }
  }, [loadDraft, loadPacks])

  if (summary === null) return <StatusPage>{t('startup.error')}</StatusPage>
  if (!summary) return <StatusPage>{t('startup.loading')}</StatusPage>

  return <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-xl flex-col justify-center px-4 py-10">
    <p className="text-sm font-medium text-muted-foreground">{t('create.eyebrow')}</p>
    <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">{t('create.title')}</h1>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('create.description')}</p>
    <dl className="mt-8 divide-y rounded-2xl border px-4">
      <div className="flex justify-between gap-4 py-4"><dt>{t('create.character')}</dt><dd className="text-right text-muted-foreground">{summary.character}</dd></div>
      <div className="flex justify-between gap-4 py-4"><dt>{t('create.story')}</dt><dd className="text-right text-muted-foreground">{summary.story ?? t('create.blankStory')}</dd></div>
    </dl>
    <div className="mt-6 rounded-2xl bg-muted p-4">
      <p className="text-xs font-medium text-muted-foreground">{t('create.promptLabel')}</p>
      <p className="mt-2 font-medium">{t('create.prompt')}</p>
    </div>
    <p className="mt-4 text-xs text-muted-foreground">{t('create.waiting')}</p>
  </main>
}
