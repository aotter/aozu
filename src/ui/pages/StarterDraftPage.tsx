import { BotIcon, CircleHelpIcon, ImagePlusIcon, ScanFaceIcon, ScrollTextIcon, SparklesIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { resolveStarterSceneLayers } from '@/core/application/scene.ts'
import type {
  ExperienceDraft,
  StarterCharacterSelection,
  StarterStorySelection,
  ValidatedStarterPackage,
} from '@/core/domain/starter.ts'
import { SceneRenderer } from '@/ui/SceneRenderer'
import { Button } from '@/ui/components/ui/button'

const selected = (
  value: StarterCharacterSelection | StarterStorySelection,
  starterId: string,
  starterVersion: number,
  resourceId: string,
) => Boolean(value && value.starterId === starterId && value.starterVersion === starterVersion &&
  ('stateId' in value ? value.stateId : value.directionId) === resourceId)

export function StarterDraftPage({ loadStarters, startCreation, onSelected }: {
  loadStarters(): Promise<ValidatedStarterPackage[]>
  startCreation(character: StarterCharacterSelection, story: StarterStorySelection): Promise<ExperienceDraft>
  onSelected(draft: ExperienceDraft): void
}) {
  const { t } = useTranslation()
  const [packages, setPackages] = useState<ValidatedStarterPackage[]>()
  const [character, setCharacter] = useState<StarterCharacterSelection>(null)
  const [story, setStory] = useState<StarterStorySelection>(null)
  const [referenceView, setReferenceView] = useState<'body' | 'head'>('body')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let live = true
    void loadStarters().then((loaded) => { if (live) setPackages(loaded) }).catch(() => live && setError(true))
    return () => { live = false }
  }, [loadStarters])

  if (!packages && !error) return <main className="mx-auto w-full max-w-4xl px-4 py-10"><p>{t('startup.loading')}</p></main>

  const begin = async () => {
    setBusy(true); setError(false)
    try {
      onSelected(await startCreation(character, story))
    } catch { setError(true) } finally { setBusy(false) }
  }

  const storyOptions = packages?.flatMap((loaded) => loaded.starter.directions.map((direction) => ({ loaded, direction }))) ?? []
  const selectedStory = storyOptions.find(({ loaded, direction }) => selected(story, loaded.starter.id, loaded.starter.version, direction.id))

  return <main className="starter-page mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
    <header className="starter-intro">
      <div>
        <p className="forge-kicker"><SparklesIcon aria-hidden="true" /> CHARACTER BLUEPRINT</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">{t('starter.title')}</h1>
        <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">{t('starter.description')}</p>
      </div>

      <details className="reference-drawer">
        <summary><CircleHelpIcon aria-hidden="true" /><span>{t('starter.referenceTitle')}</span></summary>
        <div className="reference-drawer-content">
          <div className="reference-drawer-heading">
            <p>{t('starter.referenceHint')}</p>
            <div className="reference-view-switch" role="group" aria-label={t('starter.referenceTitle')}>
              <button type="button" aria-pressed={referenceView === 'body'} onClick={() => setReferenceView('body')}><ScanFaceIcon aria-hidden="true" />{t('starter.bodyView')}</button>
              <button type="button" aria-pressed={referenceView === 'head'} onClick={() => setReferenceView('head')}><ScanFaceIcon aria-hidden="true" />{t('starter.headView')}</button>
            </div>
          </div>
          <div className="reference-placeholder" role="img" aria-label={t(referenceView === 'body' ? 'starter.bodyView' : 'starter.headView')}>
            <img src={referenceView === 'body' ? '/assets/placeholders/companion-body.png' : '/assets/placeholders/companion-head.png'} alt="" />
          </div>
        </div>
      </details>
    </header>

    <div className="starter-workspace mt-8">
      <section className="blueprint-panel character-blueprint" aria-labelledby="character-title">
        <div className="blueprint-heading">
          <span className="blueprint-number">01</span>
          <div><h2 id="character-title" className="font-heading text-2xl font-medium">{t('starter.characterTitle')}</h2><p>{t('starter.characterDescription')}</p></div>
        </div>

        <div className="character-methods">
          <button type="button" aria-pressed={character === null} onClick={() => setCharacter(null)} className="blank-character-card">
            <div className="blank-character-renderer" role="img" aria-label={t('starter.blankCharacter')}>
              <img src="/assets/placeholders/companion-body.png" alt="" />
            </div>
            <span className="method-copy">
              <strong>{t('starter.blankMethodTitle')}</strong>
              <small>{t('starter.blankMethodDescription')}</small>
            </span>
          </button>

          <div className="webmcp-method">
            <div className="webmcp-orbit" aria-hidden="true"><BotIcon /><span /></div>
            <div>
              <h3>{t('starter.webmcpTitle')}</h3>
              <p>{t('starter.webmcpDescription')}</p>
            </div>
            <ol className="webmcp-steps">
              <li><SparklesIcon aria-hidden="true" /><span>{t('starter.webmcpStepPrompt')}</span></li>
              <li><ImagePlusIcon aria-hidden="true" /><span>{t('starter.webmcpStepImport')}</span></li>
              <li><ScanFaceIcon aria-hidden="true" /><span>{t('starter.webmcpStepFit')}</span></li>
            </ol>
          </div>
        </div>

      </section>

      <section className="blueprint-panel story-blueprint" aria-labelledby="story-title">
        <div className="blueprint-heading">
          <span className="blueprint-number">02</span>
          <div><h2 id="story-title" className="font-heading text-2xl font-medium">{t('starter.storyTitle')}</h2><p>{t('starter.storyDescription')}</p></div>
        </div>
        <div className="story-options">
        <button type="button" aria-pressed={story === null} onClick={() => setStory(null)}
          className="story-card blank-story-card">
          <div className="blank-story-map" aria-hidden="true"><ScrollTextIcon /></div>
          <strong>{t('starter.blankStory')}</strong>
          <span>{t('starter.blankStoryDescription')}</span>
        </button>
        {storyOptions.map(({ loaded, direction }) => {
          const active = selected(story, loaded.starter.id, loaded.starter.version, direction.id)
          return <button key={`${loaded.starter.id}@${loaded.starter.version}:${direction.id}`} type="button" aria-pressed={active}
            onClick={() => setStory({ starterId: loaded.starter.id, starterVersion: loaded.starter.version, directionId: direction.id })}
            className="story-card">
            <SceneRenderer label={direction.name} layers={resolveStarterSceneLayers(loaded, direction.id)} />
            <strong>{direction.name}</strong>
            <span>{direction.summary}</span>
          </button>
        })}
        </div>
      </section>
    </div>

    <section className="creation-summary" aria-labelledby="selection-title">
      <div>
        <p className="forge-kicker"><ScrollTextIcon aria-hidden="true" /> {t('starter.selectionTitle')}</p>
        <dl>
          <div><dt>{t('starter.characterSelection')}</dt><dd>{t('starter.blankCharacter')}</dd></div>
          <div><dt>{t('starter.storySelection')}</dt><dd>{selectedStory?.direction.name ?? t('starter.blankStory')}</dd></div>
        </dl>
      </div>
      <Button disabled={busy || !packages} onClick={() => void begin()}>{busy ? t('starter.choosing') : t('starter.continue')}</Button>
      {error && <p role="alert" className="text-sm text-destructive">{t('starter.error')}</p>}
    </section>
  </main>
}
