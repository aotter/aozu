import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'

import type { Application } from '@/bootstrap.ts'
import type { StagedCandidatePreview } from '@/core/application/candidate.ts'
import { activeDraftId, workspacePath, type WorkspaceDestination } from '@/core/application/workspace.ts'
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
  const draftId = activeDraftId(location.pathname)
  const [startup, setStartup] = useState<Awaited<ReturnType<Application['loadStartup']>>>()
  const [loadError, setLoadError] = useState(false)
  const [preview, setPreview] = useState<StagedCandidatePreview>()
  const refresh = useCallback(async () => {
    const next = await application.loadStartup()
    flushSync(() => setStartup(next))
  }, [application])

  useEffect(() => {
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
      const next = (event as CustomEvent<StagedCandidatePreview>).detail
      setPreview(next)
      const targetDraftId = next.source === 'experience' ? next.draftId : draftId
      navigate(workspacePath('experience-review', targetDraftId), { state: { returnTo: location.pathname === '/companion' ? '/companion' : '/start' } })
    }
    window.addEventListener('experience-candidate-staged', onCandidate)
    return () => window.removeEventListener('experience-candidate-staged', onCandidate)
  }, [draftId, location.pathname, navigate])

  useEffect(() => {
    const onNavigate = (event: Event) => {
      const { destination, draftId: targetDraftId } = (event as CustomEvent<{ destination: WorkspaceDestination; draftId?: string }>).detail
      if (destination === 'character-review') {
        if (!targetDraftId) return
        void application.openCharacterDraft(targetDraftId).then(application.prepareCharacter).then((next) => {
          setPreview(next)
          navigate(workspacePath('character-review', targetDraftId), { state: { returnTo: location.pathname === '/companion' ? '/companion' : '/start' } })
        })
        return
      }
      navigate(workspacePath(destination, targetDraftId), {
        state: destination.startsWith('character-') || destination === 'experience-review' ? { returnTo: '/start' } : undefined,
      })
    }
    window.addEventListener('companion-navigate', onNavigate)
    return () => window.removeEventListener('companion-navigate', onNavigate)
  }, [application, location.pathname, navigate])

  useEffect(() => {
    const pendingHere = startup?.pendingReview?.source === 'experience' && startup.pendingReview.draftId === draftId
    const previewHere = preview?.source !== 'import' && preview?.draftId === draftId
    if (!draftId || !location.pathname.endsWith('/review') || previewHere || (startup?.pendingReview && pendingHere)) return
    let live = true
    void application.openCharacterDraft(draftId).then(application.prepareCharacter).then((next) => { if (live) setPreview(next) })
      .catch(() => { if (live) navigate('/start', { replace: true }) })
    return () => { live = false }
  }, [application, draftId, location.pathname, navigate, preview, startup?.pendingReview])

  if (loadError) return <><AppHeader webmcpAvailable={false} /><StatusPage>{t('startup.error')}</StatusPage></>
  if (!startup) return <><AppHeader webmcpAvailable={false} /><StatusPage>{t('startup.loading')}</StatusPage></>

  const flowReturnTo = (location.state as { returnTo?: FlowReturnTo } | null)?.returnTo
  const characterExit = flowReturnTo === '/companion' ? '/companion' : workspacePath('create', draftId)
  const closeFlow = () => navigate(flowReturnTo ?? '/start', { replace: true })
  const storedReview = startup.pendingReview?.source === 'import'
    ? (draftId ? undefined : startup.pendingReview)
    : startup.pendingReview?.draftId === draftId ? startup.pendingReview : undefined
  const previewHere = preview?.source === 'import' ? (draftId ? undefined : preview)
    : preview?.draftId === draftId ? preview : undefined
  const review = previewHere ?? storedReview
  const prepareCharacterReview = async (task: Promise<StagedCandidatePreview>) => {
    setPreview(await task)
    navigate(workspacePath('character-review', draftId), { state: location.state })
  }
  const characterDraftPage = draftId ? <CharacterDraftPage
    openDraft={() => application.openCharacterDraft(draftId)}
    updateDraft={application.updateCharacterDraft}
    saveAsset={application.saveCharacterAsset}
    setVariantTransform={application.setCharacterVariantTransform}
    autoFitVariant={application.autoFitCharacterVariant}
    compileAtlas={application.compileCharacterAtlas}
    exportDraft={() => application.exportCharacterDraft(draftId)}
    onReview={(draft) => prepareCharacterReview(application.prepareCharacter(draft))}
  /> : <Navigate to="/start" replace />
  const showBack = location.pathname !== '/' && location.pathname !== '/start'
  const goBack = () => {
    if (location.pathname.endsWith('/review') && review) setPreview(undefined)
    closeFlow()
  }
  const headerTitle = location.pathname === '/companion' && startup.status === 'main'
    ? startup.companion.name
    : location.pathname.endsWith('/review') ? review?.name : undefined
  const importCandidate = async (blob: Blob, returnTo: FlowReturnTo) => {
    setPreview(await application.prepareImport(blob))
    navigate('/review', { state: { returnTo } })
  }
  const headerActions = location.pathname === '/companion' && startup.status === 'main' ? <AppMenu
    exportData={application.exportData}
    prepareImport={(blob) => importCandidate(blob, '/companion')}
    onCreateCharacter={() => navigate('/starter', { state: { returnTo: '/companion' } })}
    onOpenStart={() => navigate('/start')}
  /> : undefined

  return <>
    <AppHeader webmcpAvailable={startup.webmcpAvailable} title={headerTitle} onBack={showBack ? goBack : undefined} actions={headerActions} />
    <Routes>
    <Route index element={<Navigate to="/start" replace />} />
    <Route path="/start" element={<StartPage
      savedCompanions={startup.savedCompanions}
      onOpenCompanion={async (bundleId) => { await application.activateCompanion(bundleId); await refresh(); navigate('/companion') }}
      onDeleteCompanion={async (bundleId) => { await application.deleteCompanion(bundleId); await refresh() }}
      onChooseStarter={() => navigate('/starter', { state: { returnTo: '/start' } })}
      prepareImport={(blob) => importCandidate(blob, '/start')}
      pendingReview={startup.pendingReview}
      onResumeReview={() => navigate(startup.pendingReview?.source === 'experience'
        ? workspacePath('experience-review', startup.pendingReview.draftId)
        : '/review', { state: { returnTo: '/start' } })}
      authoringDrafts={startup.authoringDrafts}
      exportCharacterDraft={application.exportCharacterDraft}
      onDeleteDraft={async (targetDraftId) => { await application.deleteAuthoringDraft(targetDraftId); await refresh() }}
      onResumeDraft={(destination) => navigate(destination, { state: { returnTo: '/start' } })}
    />} />
    <Route path="/starter" element={<StarterDraftPage
      loadStarters={application.listStarters}
      startCreation={application.startCreation}
      onSelected={(draft) => navigate(workspacePath('character-expressions', draft.id), { replace: true, state: { returnTo: flowReturnTo ?? '/start' } })}
    />} />
    <Route path="/drafts/:draftId/character" element={characterDraftPage} />
    <Route path="/drafts/:draftId/character/:step" element={characterDraftPage} />
    <Route path="/drafts/:draftId/create" element={draftId ? <CompanionCreationPage
      loadSummary={() => application.inspectCreation(draftId)}
      onCreate={async () => { await application.createCompanion(draftId); await refresh(); navigate('/companion', { replace: true }) }}
    /> : <Navigate to="/start" replace />} />
    <Route path="/drafts/:draftId/review" element={review && draftId ? <CandidateReviewPage
      preview={review}
      onApprove={async () => {
        if (review.source === 'character') await application.approveCharacterDraft(draftId, characterExit.endsWith('/create'))
        else { await application.approveCandidate(review.bundleId, true); await application.deleteAuthoringDraft(draftId) }
        setPreview(undefined)
        await refresh()
        navigate(review.source === 'character' ? characterExit : '/companion', { replace: true })
      }}
      onCancel={async () => { setPreview(undefined); await refresh(); closeFlow() }}
      onDiscard={review.source === 'character' ? undefined : async () => {
        await application.discardPendingReview(review.bundleId); setPreview(undefined); await refresh(); navigate('/start', { replace: true })
      }}
    /> : draftId ? <StatusPage>{t('startup.loading')}</StatusPage> : <Navigate to="/start" replace />} />
    <Route path="/review" element={review?.source === 'import' ? <CandidateReviewPage
      preview={review}
      onApprove={async () => { await application.approveCandidate(review.bundleId, true); setPreview(undefined); await refresh(); navigate('/companion', { replace: true }) }}
      onCancel={async () => closeFlow()}
      onDiscard={async () => { await application.discardPendingReview(review.bundleId); setPreview(undefined); await refresh(); navigate('/start', { replace: true }) }}
    /> : <Navigate to="/start" replace />} />
    <Route path="/companion" element={startup.status === 'main' ? <CompanionPage
      companionName={startup.companion.name}
      stage={startup.stage}
      dialogue={startup.dialogue}
      pendingTurns={startup.pendingTurns}
      character={startup.character}
      characterAtlas={startup.characterAtlas}
      scene={startup.scene}
      onAction={async (actionId) => { await application.submitAction(actionId, startup.stage.revision); await refresh() }}
      onText={async (text) => { await application.submitText(text, startup.stage.revision); await refresh() }}
    /> : <Navigate to="/start" replace />} />
    <Route path="*" element={<Navigate to="/start" replace />} />
    </Routes>
  </>
}
