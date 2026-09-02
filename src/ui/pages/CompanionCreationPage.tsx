import { BookOpenIcon, BotIcon, MapIcon, SparklesIcon, UserRoundIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { CharacterDraft, ResolvedCharacterLayer } from '@/core/domain/character.ts'
import type { ResolvedSceneLayer } from '@/core/domain/scene.ts'
import { CharacterRenderer } from '@/ui/CharacterRenderer'
import { SceneRenderer } from '@/ui/SceneRenderer'
import { Button } from '@/ui/components/ui/button'
import { StatusPage } from '@/ui/pages/StatusPage'

type Profile = NonNullable<CharacterDraft['profile']>
type Summary = {
  character: string
  characterLayers: Array<ResolvedCharacterLayer & { blob: Blob }>
  sceneLayers: Array<ResolvedSceneLayer & { blob: Blob }>
  profile: Profile
  story?: string
  stages: number
  actions: number
  metrics: number
  rules: number
}

export function CompanionCreationPage({ loadSummary, saveProfile, onCreate }: {
  loadSummary(): Promise<Summary>
  saveProfile(profile: Profile): Promise<Profile>
  onCreate(): Promise<void>
}) {
  const { t } = useTranslation()
  const [summary, setSummary] = useState<Summary | null>()
  const [profile, setProfile] = useState<Profile>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    void loadSummary().then((loaded) => {
      if (!active) return
      setSummary(loaded)
      setProfile(loaded.profile)
    }).catch(() => active && setSummary(null))
    return () => { active = false }
  }, [loadSummary])

  if (summary === null) return <StatusPage>{t('startup.error')}</StatusPage>
  if (!summary || !profile) return <StatusPage>{t('startup.loading')}</StatusPage>

  const changeProfile = (field: keyof Profile, value: string) => setProfile({ ...profile, [field]: value })
  const persistProfile = async () => {
    try { setProfile(await saveProfile(profile)); setError(false) } catch { setError(true) }
  }

  return <main className="adventure-authoring mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
    <header className="adventure-heading">
      <div>
        <p className="forge-kicker"><SparklesIcon aria-hidden="true" /> {t('create.kicker')}</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight">{t('create.title')}</h1>
        <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">{t('create.description')}</p>
      </div>
      <ol className="adventure-steps" aria-label={t('create.stepsLabel')}>
        <li className="is-complete"><UserRoundIcon aria-hidden="true" /><span>{t('create.stepCharacter')}</span></li>
        <li className="is-active"><BookOpenIcon aria-hidden="true" /><span>{t('create.stepProfile')}</span></li>
        <li><MapIcon aria-hidden="true" /><span>{t('create.stepWorld')}</span></li>
      </ol>
    </header>

    <div className="adventure-layout mt-6">
      <section className="adventure-stage" aria-label={t('create.previewLabel')}>
        <div className="adventure-scene">
          {summary.sceneLayers.length
            ? <SceneRenderer label={summary.story ?? t('create.blankStory')} layers={summary.sceneLayers}>
                <CharacterRenderer label={summary.character} layers={summary.characterLayers} className="size-full rounded-none border-0 bg-transparent" />
              </SceneRenderer>
            : <div className="blank-adventure-world">
                <CharacterRenderer label={summary.character} layers={summary.characterLayers} className="size-full rounded-none border-0 bg-transparent" />
              </div>}
          <div className="adventure-nameplate">{summary.character}</div>
          <div className="adventure-dialogue"><p>{t('create.characterQuestion', { name: summary.character })}</p></div>
        </div>
      </section>

      <section className="profile-scroll" aria-labelledby="profile-title">
        <div className="profile-scroll-heading">
          <BotIcon aria-hidden="true" />
          <div><h2 id="profile-title" className="font-heading text-2xl font-semibold">{t('create.profileTitle')}</h2><p>{t('create.profileDescription')}</p></div>
        </div>
        <div className="profile-fields">
          {(['age', 'personality', 'backstory', 'setting'] as const).map((field) => <label key={field}>
            <span>{t(`create.profile.${field}`)}</span>
            {field === 'backstory' || field === 'setting'
              ? <textarea rows={3} value={profile[field]} placeholder={t(`create.profilePlaceholder.${field}`)} onChange={(event) => changeProfile(field, event.target.value)} onBlur={() => void persistProfile()} />
              : <input value={profile[field]} placeholder={t(`create.profilePlaceholder.${field}`)} onChange={(event) => changeProfile(field, event.target.value)} onBlur={() => void persistProfile()} />}
          </label>)}
        </div>

        <aside className="experience-spell">
          <div className="spell-icon"><SparklesIcon aria-hidden="true" /></div>
          <div><strong>{t('create.webmcpTitle')}</strong><p>{t('create.webmcpInstruction')}</p><blockquote>{t('create.webmcpSpell', { name: summary.character })}</blockquote></div>
        </aside>

        <Button className="mt-4 w-full" disabled={busy} onClick={async () => {
          setBusy(true); setError(false)
          try { await saveProfile(profile); await onCreate() } catch { setBusy(false); setError(true) }
        }}>{busy ? t('create.creating') : t('create.submit')}</Button>
        {error && <p role="alert" className="mt-4 text-destructive">{t('create.error')}</p>}
      </section>
    </div>
  </main>
}
