import { ChevronDownIcon, FileImageIcon, LightbulbIcon, ScanFaceIcon, WandSparklesIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ExperienceDraft, StarterCharacterSelection, StarterStorySelection, ValidatedStarterPackage } from '@/core/domain/starter.ts'
import { localizedText } from '@/ui/localizedText'

const references = [
  { id: 'otter', name: '布丁獺 / Pudding Otter', image: '/assets/aozu-references/portrait-otter-v1.jpg' },
  { id: 'seal', name: '泡泡海豹 / Bubble Seal', image: '/assets/aozu-references/portrait-seal-v1.jpg' },
  { id: 'whale', name: '夜航鯨 / Night Whale', image: '/assets/aozu-references/portrait-whale-v1.jpg' },
  { id: 'weasel', name: '琥珀鼬 / Amber Weasel', image: '/assets/aozu-references/portrait-weasel-v1.jpg' },
  { id: 'mikan', name: '蜜柑 / Mikan', image: '/assets/aozu-references/portrait-mikan-v1.jpg' },
  { id: 'spac1', name: 'Spac1', image: '/assets/aozu-references/portrait-spac1-v1.jpg' },
  { id: 'xixi', name: '嘻嘻 / Xixi', image: '/assets/aozu-references/portrait-xixi-v1.jpg' },
] as const

export function StarterDraftPage({ loadStarters, startCreation, onSelected }: {
  loadStarters(): Promise<ValidatedStarterPackage[]>
  startCreation(character: StarterCharacterSelection, story: StarterStorySelection): Promise<ExperienceDraft>
  onSelected(draft: ExperienceDraft, targetPart: 'body' | 'head'): void
}) {
  const { t, i18n } = useTranslation()
  const [packages, setPackages] = useState<ValidatedStarterPackage[]>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [referenceId, setReferenceId] = useState<(typeof references)[number]['id']>('otter')
  const [referencePart, setReferencePart] = useState<'body' | 'head'>('body')
  const [targetPart, setTargetPart] = useState<'body' | 'head'>('body')

  useEffect(() => {
    let live = true
    void loadStarters().then((loaded) => { if (live) setPackages(loaded) }).catch(() => live && setError(true))
    return () => { live = false }
  }, [loadStarters])

  if (!packages && !error) return <main className="parchment-screen"><p>{t('startup.loading')}</p></main>

  const aozu = packages?.find(({ starter }) => starter.id === 'aozu-origin')
  const direction = aozu?.starter.directions[0]
  const story: StarterStorySelection = aozu && direction ? {
    starterId: aozu.starter.id,
    starterVersion: aozu.starter.version,
    directionId: direction.id,
  } : null
  const activeReference = references.find(({ id }) => id === referenceId)!
  const begin = async (character: StarterCharacterSelection) => {
    if (!story) return setError(true)
    setBusy(true); setError(false)
    try { onSelected(await startCreation(character, story), targetPart) } catch { setError(true) } finally { setBusy(false) }
  }

  return <main className="parchment-screen forge-parchment">
    <header className="forge-heading">
      <span className="forge-step">01</span>
      <div><p className="eyebrow"><ScanFaceIcon />{t('starter.eyebrow')}</p><h1>{t('starter.title')}</h1><p>{t('starter.description')}</p></div>
    </header>

    <details className="reference-drawer stitched-panel">
      <summary><span><LightbulbIcon />{t('starter.references.title')}</span><ChevronDownIcon className="drawer-chevron" /></summary>
      <p>{t('starter.references.description')}</p>
      <div className="fit-part-switch" aria-label={t('starter.references.part')}>
        <button type="button" aria-pressed={referencePart === 'body'} onClick={() => setReferencePart('body')}>{t('starter.references.body')}</button>
        <button type="button" aria-pressed={referencePart === 'head'} onClick={() => setReferencePart('head')}>{t('starter.references.head')}</button>
      </div>
      <div className="reference-strip">
        {references.map((reference) => <button key={reference.id} type="button" aria-pressed={referenceId === reference.id} onClick={() => setReferenceId(reference.id)}>
          <img src={reference.image} alt="" /><span>{localizedText(reference.name, i18n.resolvedLanguage ?? i18n.language)}</span>
        </button>)}
      </div>
      <p className="reference-note">{t('starter.references.selected', { name: localizedText(activeReference.name, i18n.resolvedLanguage ?? i18n.language), part: t(`starter.references.${referencePart}`) })}</p>
    </details>

    <section className="forge-workspace stitched-panel">
      <div className="forge-preview">
        <div className="forge-blank-rig" role="img" aria-label={t('starter.blankCharacter')}>
          <img src={`/assets/aozu-ui/webmcp-${targetPart}-command-v1.png`} alt="" />
        </div>
        <span className="stitch-label">{t('starter.rigLabel')}</span>
      </div>

      <div className="forge-methods">
        <h2>{t('starter.methodTitle')}</h2>
        <p>{t('starter.methodDescription')}</p>
        <div className="forge-step-block">
          <b>01 · {t('starter.targetPart')}</b>
          <div className="command-part-grid" aria-label={t('starter.targetPart')}>
            <button type="button" aria-pressed={targetPart === 'body'} onClick={() => setTargetPart('body')}>
              <img src="/assets/aozu-ui/webmcp-body-command-v1.png" alt="" /><span>{t('starter.targetBody')}</span>
            </button>
            <button type="button" aria-pressed={targetPart === 'head'} onClick={() => setTargetPart('head')}>
              <img src="/assets/aozu-ui/webmcp-head-command-v1.png" alt="" /><span>{t('starter.targetHead')}</span>
            </button>
          </div>
        </div>
        <div className="webmcp-brief">
          <b>02 · {t('starter.instructionTitle')}</b>
          <p>{t(`starter.instructions.${targetPart}`)}</p>
        </div>
        <button type="button" className="forge-method" disabled={busy || !story} onClick={() => void begin(null)}>
          <FileImageIcon /><span><b>{t('starter.importCharacter')}</b><small>{t('starter.importCharacterDescription')}</small></span>
        </button>
        <button type="button" className="forge-method is-agent" disabled={busy || !story} onClick={() => void begin(null)}>
          <WandSparklesIcon /><span><b>{t('starter.generateCharacter')}</b><small>{t('starter.generateCharacterDescription')}</small></span>
        </button>
        <p className="contract-note">WebMCP: inspect_workspace → inspect_character_contract → submit_character_asset_candidate</p>
        {error && <p role="alert" className="form-error">{t('starter.error')}</p>}
      </div>
    </section>
  </main>
}
