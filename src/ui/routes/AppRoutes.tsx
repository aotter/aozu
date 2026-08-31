import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'

import type { Application } from '@/bootstrap.ts'
import type { CompanionStartup } from '@/core/application/companion.ts'
import type { StagedCandidatePreview } from '@/core/application/candidate.ts'
import { CandidateReviewPage } from '@/ui/pages/CandidateReviewPage'
import { CharacterDraftPage } from '@/ui/pages/CharacterDraftPage'
import { CompanionPage } from '@/ui/pages/CompanionPage'
import { PresetDraftPage } from '@/ui/pages/PresetDraftPage'
import { StartPage } from '@/ui/pages/StartPage'
import { StatusPage } from '@/ui/pages/StatusPage'

export function AppRoutes({ application }: { application: Application }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [startup, setStartup] = useState<CompanionStartup>()
  const [loadError, setLoadError] = useState(false)
  const [preview, setPreview] = useState<StagedCandidatePreview>()
  const [presetSeed, setPresetSeed] = useState(application.createPresetSeed)
  const refresh = useCallback(async () => setStartup(await application.loadStartup()), [application])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- IndexedDB is the external startup source.
    void refresh().catch((error) => {
      console.error('Companion startup failed', error)
      setLoadError(true)
    })
  }, [refresh])

  useEffect(() => {
    const onUpdate = () => void refresh()
    window.addEventListener('companion-updated', onUpdate)
    return () => window.removeEventListener('companion-updated', onUpdate)
  }, [refresh])

  useEffect(() => {
    const onDraftUpdate = () => {
      if (!location.pathname.startsWith('/character/')) navigate('/character/identity')
    }
    window.addEventListener('character-draft-updated', onDraftUpdate)
    return () => window.removeEventListener('character-draft-updated', onDraftUpdate)
  }, [location.pathname, navigate])

  if (loadError) return <StatusPage>{t('startup.error')}</StatusPage>
  if (!startup) return <StatusPage>{t('startup.loading')}</StatusPage>

  const homePath = startup.status === 'main' ? '/companion' : '/start'
  const prepareReview = async (task: Promise<StagedCandidatePreview>) => {
    setPreview(await task)
    navigate('/review')
  }

  return <Routes>
    <Route index element={<Navigate to={homePath} replace />} />
    <Route path="/start" element={<StartPage
      webmcpAvailable={startup.webmcpAvailable}
      savedCompanions={startup.savedCompanions}
      onOpenCompanion={async (bundleId) => {
        await application.activateCompanion(bundleId)
        await refresh()
        navigate('/companion')
      }}
      onCreatePreset={() => {
        setPresetSeed(application.createPresetSeed())
        navigate('/preset')
      }}
      onCreateCharacter={() => navigate('/character/identity')}
      prepareImport={(blob) => prepareReview(application.prepareImport(blob))}
    />} />
    <Route path="/preset" element={<PresetDraftPage
      seed={presetSeed}
      webmcpAvailable={startup.webmcpAvailable}
      onReview={(customization) => prepareReview(application.preparePreset(customization))}
      onCancel={() => navigate(homePath)}
    />} />
    <Route path="/character" element={<Navigate to="/character/identity" replace />} />
    <Route path="/character/:step" element={<CharacterDraftPage
      webmcpAvailable={startup.webmcpAvailable}
      openDraft={application.openCharacterDraft}
      updateDraft={application.updateCharacterDraft}
      saveAsset={application.saveCharacterAsset}
      onReview={(draft) => prepareReview(application.prepareCharacter(draft))}
      onCancel={() => navigate(homePath)}
    />} />
    <Route path="/review" element={preview ? <CandidateReviewPage
      preview={preview}
      webmcpAvailable={startup.webmcpAvailable}
      onApprove={async () => {
        await application.approveCandidate(preview.bundleId, true)
        if (preview.source === 'character') await application.clearCharacterDraft()
        setPreview(undefined)
        await refresh()
        navigate('/companion', { replace: true })
      }}
      onCancel={async () => {
        const path = preview.source === 'character' ? '/character/review' : homePath
        setPreview(undefined)
        navigate(path)
      }}
    /> : <Navigate to={homePath} replace />} />
    <Route path="/companion" element={startup.status === 'main' ? <CompanionPage
      companionName={startup.companion.name}
      stage={startup.stage}
      dialogue={startup.dialogue}
      pendingTurns={startup.pendingTurns}
      character={startup.character}
      webmcpAvailable={startup.webmcpAvailable}
      exportData={application.exportData}
      prepareImport={(blob) => prepareReview(application.prepareImport(blob))}
      onCreateCharacter={() => navigate('/character/identity')}
      onOpenStart={() => navigate('/start')}
      onAction={async (actionId) => {
        await application.submitAction(actionId, startup.stage.revision)
        await refresh()
      }}
      onText={async (text) => {
        await application.submitText(text, startup.stage.revision)
        await refresh()
      }}
    /> : <Navigate to="/start" replace />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}
