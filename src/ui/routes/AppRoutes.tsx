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
import { StarterDraftPage } from '@/ui/pages/StarterDraftPage'
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

  useEffect(() => {
    const onCandidate = (event: Event) => {
      setPreview((event as CustomEvent<StagedCandidatePreview>).detail)
      navigate('/review', { state: { returnTo: location.pathname === '/companion' ? '/companion' : '/start' } })
    }
    window.addEventListener('experience-candidate-staged', onCandidate)
    return () => window.removeEventListener('experience-candidate-staged', onCandidate)
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
      onChooseStarter={() => navigate('/starter', { state: { returnTo: '/start' } })}
      prepareImport={(blob) => prepareReview(application.prepareImport(blob))}
    />} />
    <Route path="/starter" element={<StarterDraftPage
      loadStarters={application.listStarters}
      startCreation={application.startCreation}
      onSelected={() => navigate('/character/expressions', { replace: true, state: { returnTo: '/start' } })}
    />} />
    <Route path="/character" element={characterDraftPage} />
    <Route path="/character/:step" element={characterDraftPage} />
    <Route path="/review" element={preview ? <CandidateReviewPage
      preview={preview}
      onApprove={async () => {
        if (preview.source === 'character') await application.approveCharacterDraft()
        else await application.approveCandidate(preview.bundleId, true)
        setPreview(undefined)
        await refresh()
        navigate(preview.source === 'character' ? '/start' : '/companion', { replace: true })
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
