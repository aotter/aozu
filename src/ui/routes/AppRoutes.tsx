import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'

import type { Application } from '@/bootstrap.ts'
import type { CompanionStartup } from '@/core/application/companion.ts'
import type { StagedCandidatePreview } from '@/core/application/candidate.ts'
import { AppHeader } from '@/ui/AppHeader'
import { AppMenu } from '@/ui/AppMenu'
import { CandidateReviewPage } from '@/ui/pages/CandidateReviewPage'
import { CharacterDraftPage } from '@/ui/pages/CharacterDraftPage'
import { CompanionPage } from '@/ui/pages/CompanionPage'
import { PresetDraftPage } from '@/ui/pages/PresetDraftPage'
import { StartPage } from '@/ui/pages/StartPage'
import { StatusPage } from '@/ui/pages/StatusPage'

type FlowReturnTo = '/start' | '/companion'

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
      if (!location.pathname.startsWith('/character')) navigate('/character', {
        state: { returnTo: location.pathname === '/companion' ? '/companion' : '/start' },
      })
    }
    window.addEventListener('character-draft-updated', onDraftUpdate)
    return () => window.removeEventListener('character-draft-updated', onDraftUpdate)
  }, [location.pathname, navigate])

  if (loadError) return <><AppHeader webmcpAvailable={false} /><StatusPage>{t('startup.error')}</StatusPage></>
  if (!startup) return <><AppHeader webmcpAvailable={false} /><StatusPage>{t('startup.loading')}</StatusPage></>

  const flowReturnTo = (location.state as { returnTo?: FlowReturnTo } | null)?.returnTo
  const closeFlow = () => navigate(flowReturnTo ?? '/start', { replace: true })
  const prepareReview = async (task: Promise<StagedCandidatePreview>) => {
    setPreview(await task)
    navigate('/review')
  }
  const characterDraftPage = <CharacterDraftPage
    openDraft={application.openCharacterDraft}
    updateDraft={application.updateCharacterDraft}
    saveAsset={application.saveCharacterAsset}
    onReview={(draft) => prepareReview(application.prepareCharacter(draft))}
  />
  const showBack = location.pathname !== '/' && location.pathname !== '/start'
  const goBack = () => {
    if (location.pathname === '/review' && preview) {
      setPreview(undefined)
      navigate(-1)
      return
    }
    closeFlow()
  }
  const headerTitle = location.pathname === '/companion' && startup.status === 'main'
    ? startup.companion.name
    : location.pathname === '/review' ? preview?.name : undefined
  const headerActions = location.pathname === '/companion' && startup.status === 'main' ? <AppMenu
    exportData={application.exportData}
    prepareImport={(blob) => prepareReview(application.prepareImport(blob))}
    onCreateCharacter={() => navigate('/character', { state: { returnTo: '/companion' } })}
    onOpenStart={() => navigate('/start')}
  /> : undefined

  return <>
    <AppHeader webmcpAvailable={startup.webmcpAvailable} title={headerTitle} onBack={showBack ? goBack : undefined} actions={headerActions} />
    <Routes>
    <Route index element={<Navigate to="/start" replace />} />
    <Route path="/start" element={<StartPage
      savedCompanions={startup.savedCompanions}
      onOpenCompanion={async (bundleId) => {
        await application.activateCompanion(bundleId)
        await refresh()
        navigate('/companion')
      }}
      onDeleteCompanion={async (bundleId) => {
        await application.deleteCompanion(bundleId)
        await refresh()
      }}
      onCreatePreset={() => {
        setPresetSeed(application.createPresetSeed())
        navigate('/preset', { state: { returnTo: '/start' } })
      }}
      onCreateCharacter={() => navigate('/character', { state: { returnTo: '/start' } })}
      prepareImport={(blob) => prepareReview(application.prepareImport(blob))}
    />} />
    <Route path="/preset" element={<PresetDraftPage
      seed={presetSeed}
      onReview={(customization) => prepareReview(application.preparePreset(customization))}
      onCancel={closeFlow}
    />} />
    <Route path="/character" element={characterDraftPage} />
    <Route path="/character/:step" element={characterDraftPage} />
    <Route path="/review" element={preview ? <CandidateReviewPage
      preview={preview}
      onApprove={async () => {
        await application.approveCandidate(preview.bundleId, true)
        if (preview.source === 'character') await application.clearCharacterDraft()
        setPreview(undefined)
        await refresh()
        navigate('/companion', { replace: true })
      }}
      onCancel={async () => {
        setPreview(undefined)
        navigate(-1)
      }}
    /> : <Navigate to="/start" replace />} />
    <Route path="/companion" element={startup.status === 'main' ? <CompanionPage
      companionName={startup.companion.name}
      stage={startup.stage}
      dialogue={startup.dialogue}
      pendingTurns={startup.pendingTurns}
      character={startup.character}
      scene={startup.scene}
      onAction={async (actionId) => {
        await application.submitAction(actionId, startup.stage.revision)
        await refresh()
      }}
      onText={async (text) => {
        await application.submitText(text, startup.stage.revision)
        await refresh()
      }}
    /> : <Navigate to="/start" replace />} />
    <Route path="*" element={<Navigate to="/start" replace />} />
    </Routes>
  </>
}
