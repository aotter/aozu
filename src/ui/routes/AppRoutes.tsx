import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'

import type { Application } from '@/bootstrap.ts'
import type { StagedCandidatePreview } from '@/core/application/candidate.ts'
import { WORKSPACE_DESTINATIONS, type WorkspaceDestination } from '@/core/application/workspace.ts'
import { AppHeader } from '@/ui/AppHeader'
import { AppMenu } from '@/ui/AppMenu'
import { CandidateReviewPage } from '@/ui/pages/CandidateReviewPage'
import { CharacterDraftPage } from '@/ui/pages/CharacterDraftPage'
import { CompanionPage } from '@/ui/pages/CompanionPage'
import { CompanionCreationPage } from '@/ui/pages/CompanionCreationPage'
import { StarterDraftPage } from '@/ui/pages/StarterDraftPage'
import { StartPage } from '@/ui/pages/StartPage'
import { StatusPage } from '@/ui/pages/StatusPage'

type FlowReturnTo = '/start' | '/companion'

export function AppRoutes({ application }: { application: Application }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [startup, setStartup] = useState<Awaited<ReturnType<Application['loadStartup']>>>()
  const [loadError, setLoadError] = useState(false)
  const [preview, setPreview] = useState<StagedCandidatePreview>()
  const refresh = useCallback(async () => {
    const next = await application.loadStartup()
    flushSync(() => setStartup(next))
  }, [application])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- IndexedDB is the external startup source.
    void refresh().catch((error) => {
      console.error('Companion startup failed', error)
      setLoadError(true)
    })
  }, [location.pathname, refresh])

  useEffect(() => {
    const onUpdate = () => void refresh()
    window.addEventListener('companion-updated', onUpdate)
    return () => window.removeEventListener('companion-updated', onUpdate)
  }, [refresh])

  useEffect(() => {
    const onCandidate = (event: Event) => {
      setPreview((event as CustomEvent<StagedCandidatePreview>).detail)
      navigate('/review', { state: { returnTo: location.pathname === '/companion' ? '/companion' : '/start' } })
    }
    window.addEventListener('experience-candidate-staged', onCandidate)
    return () => window.removeEventListener('experience-candidate-staged', onCandidate)
  }, [location.pathname, navigate])

  useEffect(() => {
    const onNavigate = (event: Event) => {
      const destination = (event as CustomEvent<{ destination: WorkspaceDestination }>).detail.destination
      if (destination === 'character-review') {
        void application.openCharacterDraft()
          .then(application.prepareCharacter)
          .then((next) => {
            setPreview(next)
            navigate('/review', { state: { returnTo: location.pathname === '/companion' ? '/companion' : '/start' } })
          })
        return
      }
      navigate(WORKSPACE_DESTINATIONS[destination], {
        state: destination.startsWith('character-') || destination === 'experience-review' ? { returnTo: '/start' } : undefined,
      })
    }
    window.addEventListener('companion-navigate', onNavigate)
    return () => window.removeEventListener('companion-navigate', onNavigate)
  }, [application, location.pathname, navigate])

  if (loadError) return <><AppHeader webmcpAvailable={false} /><StatusPage>{t('startup.error')}</StatusPage></>
  if (!startup) return <><AppHeader webmcpAvailable={false} /><StatusPage>{t('startup.loading')}</StatusPage></>

  const flowReturnTo = (location.state as { returnTo?: FlowReturnTo } | null)?.returnTo
  const characterExit = flowReturnTo === '/companion' ? '/companion' : '/create'
  const closeFlow = () => navigate(flowReturnTo ?? '/start', { replace: true })
  const review = preview ?? startup.pendingReview ?? undefined
  const prepareReview = async (task: Promise<StagedCandidatePreview>) => {
    setPreview(await task)
    navigate('/review', { state: location.state })
  }
  const characterDraftPage = <CharacterDraftPage
    openDraft={application.openCharacterDraft}
    updateDraft={application.updateCharacterDraft}
    saveAsset={application.saveCharacterAsset}
    setVariantTransform={application.setCharacterVariantTransform}
    onReview={(draft) => prepareReview(application.prepareCharacter(draft))}
  />
  const showBack = location.pathname !== '/' && location.pathname !== '/start'
  const goBack = () => {
    if (location.pathname === '/review' && review) {
      setPreview(undefined)
      closeFlow()
      return
    }
    closeFlow()
  }
  const headerTitle = location.pathname === '/companion' && startup.status === 'main'
    ? startup.companion.name
    : location.pathname === '/review' ? review?.name : undefined
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
      pendingReview={startup.pendingReview}
      onResumeReview={() => navigate('/review', { state: { returnTo: '/start' } })}
      authoringDraft={startup.authoringDraft}
      onResumeDraft={(destination) => navigate(destination, { state: { returnTo: '/start' } })}
    />} />
    <Route path="/starter" element={<StarterDraftPage
      loadStarters={application.listStarters}
      startCreation={application.startCreation}
      onSelected={() => navigate('/character/expressions', { replace: true, state: { returnTo: '/start' } })}
    />} />
    <Route path="/character" element={characterDraftPage} />
    <Route path="/character/:step" element={characterDraftPage} />
    <Route path="/create" element={<CompanionCreationPage
      loadSummary={application.inspectCreation}
      onCreate={async () => {
        await application.createCompanion()
        await refresh()
        navigate('/companion', { replace: true })
      }}
    />} />
    <Route path="/review" element={review ? <CandidateReviewPage
      preview={review}
      onApprove={async () => {
        if (review.source === 'character') await application.approveCharacterDraft(characterExit === '/create')
        else await application.approveCandidate(review.bundleId, true)
        setPreview(undefined)
        await refresh()
        navigate(review.source === 'character' ? characterExit : '/companion', { replace: true })
      }}
      onCancel={async () => {
        setPreview(undefined)
        await refresh()
        closeFlow()
      }}
      onDiscard={review.source === 'character' ? undefined : async () => {
        await application.discardPendingReview(review.bundleId)
        setPreview(undefined)
        await refresh()
        navigate('/start', { replace: true })
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
