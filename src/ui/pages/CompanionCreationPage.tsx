import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { CharacterDraft, ResolvedCharacterLayer } from '@/core/domain/character.ts'
import { CharacterRenderer } from '@/ui/CharacterRenderer'
import { AozuIcon } from '@/ui/AozuIcon'
import { Button } from '@/ui/components/ui/button'
import { StatusPage } from '@/ui/pages/StatusPage'

type Profile = NonNullable<CharacterDraft['profile']>
type Summary = {
  character: string
  characterLayers: Array<ResolvedCharacterLayer & { blob: Blob }>
  profile: Profile
}

const PROFILE_FIELDS = ['age', 'personality', 'backstory', 'setting'] as const
type ProfileField = typeof PROFILE_FIELDS[number]

export function CompanionCreationPage({ loadSummary, saveProfile, onCreate }: {
  loadSummary(): Promise<Summary>
  saveProfile(profile: Profile): Promise<Profile>
  onCreate(): Promise<void>
}) {
  const { t } = useTranslation()
  const [summary, setSummary] = useState<Summary | null>()
  const [profile, setProfile] = useState<Profile>()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    void loadSummary().then((loaded) => {
      if (!active) return
      setSummary(loaded)
      setProfile(loaded.profile)
      const firstEmpty = PROFILE_FIELDS.findIndex((field) => !loaded.profile[field].trim())
      setStep(firstEmpty < 0 ? PROFILE_FIELDS.length - 1 : firstEmpty)
    }).catch(() => active && setSummary(null))
    return () => { active = false }
  }, [loadSummary])

  if (summary === null) return <StatusPage>{t('startup.error')}</StatusPage>
  if (!summary || !profile) return <StatusPage>{t('startup.loading')}</StatusPage>

  const changeProfile = (field: keyof Profile, value: string) => setProfile({ ...profile, [field]: value })
  const field: ProfileField = PROFILE_FIELDS[step]
  const isLastQuestion = step === PROFILE_FIELDS.length - 1
  const saveAnswer = async () => {
    if (!profile[field].trim()) return
    setBusy(true)
    setError(false)
    try {
      setProfile(await saveProfile(profile))
      if (isLastQuestion) await onCreate()
      else { setStep(step + 1); setBusy(false) }
    } catch {
      setBusy(false)
      setError(true)
    }
  }

  return <main className="rpg-prologue-shell">
    <section className="rpg-prologue-stage" aria-label={t('create.previewLabel')}>
      <img className="rpg-world-background" src="/assets/scenes/forest-river-default.png" alt="" />
      <div className="rpg-world-light" aria-hidden="true" />

      <header className="rpg-hud">
        <div className="rpg-chapter-mark">
          <AozuIcon name="book" />
          <div>
            <p>{t('create.kicker')}</p>
            <h1>{t('create.title')}</h1>
          </div>
        </div>
        <ol className="rpg-progress" aria-label={t('create.stepsLabel')}>
          {PROFILE_FIELDS.map((profileField, index) => <li key={profileField} className={index < step ? 'is-complete' : index === step ? 'is-active' : ''}>
            <span>{index + 1}</span><b>{t(`create.profile.${profileField}`)}</b>
          </li>)}
        </ol>
      </header>

      <CharacterRenderer
        label={summary.character}
        layers={summary.characterLayers}
        className="rpg-character-sprite rounded-none border-0 bg-transparent"
      />

      <form className="rpg-dialogue-panel" onSubmit={(event) => { event.preventDefault(); void saveAnswer() }}>
        <span className="rpg-dialogue-corner is-left" aria-hidden="true" />
        <span className="rpg-dialogue-corner is-right" aria-hidden="true" />
        <div className="rpg-speaker-name">{summary.character}</div>
        <div className="rpg-dialogue-content">
          <div className="rpg-dialogue-copy">
            <p className="rpg-question-count">{t('create.questionProgress', { current: step + 1, total: PROFILE_FIELDS.length })}</p>
            <p id="rpg-character-question" className="rpg-character-question">{t(`create.question.${field}`, { name: summary.character })}</p>
            <p className="rpg-webmcp-hint"><AozuIcon name="book" />{t('create.webmcpSync')}</p>
          </div>
          <label className="rpg-answer" htmlFor={`profile-${field}`}>
            <span>{t(`create.profile.${field}`)}</span>
            {field === 'backstory' || field === 'setting'
              ? <textarea id={`profile-${field}`} key={field} autoFocus rows={2} value={profile[field]} placeholder={t(`create.profilePlaceholder.${field}`)} onChange={(event) => changeProfile(field, event.target.value)} aria-describedby="rpg-character-question" />
              : <input id={`profile-${field}`} key={field} autoFocus value={profile[field]} placeholder={t(`create.profilePlaceholder.${field}`)} onChange={(event) => changeProfile(field, event.target.value)} aria-describedby="rpg-character-question" />}
          </label>
          <div className="rpg-dialogue-actions">
            {step > 0 && <Button type="button" variant="outline" disabled={busy} onClick={() => { setError(false); setStep(step - 1) }}>{t('create.previous')}</Button>}
            <Button type="submit" disabled={busy || !profile[field].trim()}>
              {busy ? t('create.savingAnswer') : t(isLastQuestion ? 'create.submit' : 'create.next')}
            </Button>
          </div>
        </div>
        {error && <p role="alert" className="rpg-dialogue-error">{t('create.error')}</p>}
      </form>
    </section>
  </main>
}
