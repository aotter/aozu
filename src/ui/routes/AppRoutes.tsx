import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router'

import type { Application } from '@/bootstrap.ts'
import { AppHeader } from '@/ui/AppHeader'
import { CharacterDraftPage } from '@/ui/pages/CharacterDraftPage'
import { CharacterLibraryPage } from '@/ui/pages/CharacterLibraryPage'
import { StatusPage } from '@/ui/pages/StatusPage'

function CharacterEditor({ application, refresh }: { application: Application; refresh(): Promise<void> }) {
  const { characterId } = useParams()
  const openCharacter = useCallback(() => application.openCharacterDraft(characterId ?? ''), [application, characterId])
  if (!characterId) return <Navigate to="/characters" replace />
  return <CharacterDraftPage
    openDraft={openCharacter}
    updateDraft={application.updateCharacterDraft}
    saveAsset={application.saveCharacterAsset}
    setVariantTransform={application.setCharacterVariantTransform}
    autoFitVariant={application.autoFitCharacterVariant}
    compileAtlas={application.compileCharacterAtlas}
    exportDraft={() => application.exportCharacterDraft(characterId)}
    onPublish={async (draft) => {
      const saved = await application.updateCharacterDraft(draft)
      await application.prepareCharacter(saved)
      const published = await application.approveCharacterDraft(saved.id)
      await refresh()
      return published
    }}
  />
}

export function AppRoutes({ application }: { application: Application }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [webmcp, setWebmcp] = useState(application.webmcp.getState())
  const [library, setLibrary] = useState<Awaited<ReturnType<Application['loadCharacterLibrary']>>>()
  const [loadError, setLoadError] = useState(false)
  const refresh = useCallback(async () => {
    setLibrary(await application.loadCharacterLibrary())
    setLoadError(false)
  }, [application])

  useEffect(() => {
    const disconnect = application.webmcp.setNavigate((path) => navigate(path))
    const unsubscribe = application.webmcp.subscribe(setWebmcp)
    return () => { unsubscribe(); disconnect() }
  }, [application, navigate])
  useEffect(() => {
    let live = true
    void application.loadCharacterLibrary()
      .then((next) => { if (live) setLibrary(next) })
      .catch(() => { if (live) setLoadError(true) })
    return () => { live = false }
  }, [application])
  useEffect(() => {
    const update = () => void refresh()
    window.addEventListener('character-draft-updated', update)
    return () => window.removeEventListener('character-draft-updated', update)
  }, [refresh])

  if (loadError) return <><AppHeader webmcp={webmcp} /><StatusPage>{t('startup.error')}</StatusPage></>
  if (!library) return <><AppHeader webmcp={webmcp} /><StatusPage>{t('startup.loading')}</StatusPage></>

  const editing = /^\/characters\/[^/]+/.test(location.pathname)
  const characterId = editing ? decodeURIComponent(location.pathname.split('/')[2] ?? '') : undefined
  const character = library.characters.find(({ id }) => id === characterId)
  return <>
    <AppHeader
      webmcp={webmcp}
      title={character?.name}
      onBack={editing ? () => navigate('/characters') : undefined}
    />
    <Routes>
      <Route index element={<Navigate to="/characters" replace />} />
      <Route path="/characters" element={<CharacterLibraryPage
        characters={library.characters}
        loadStarters={application.listStarters}
        createCharacter={application.createCharacter}
        openCharacter={(id) => navigate(`/characters/${encodeURIComponent(id)}/expressions`)}
        deleteCharacter={application.deleteCharacter}
        exportCharacter={application.exportCharacterDraft}
        importCharacter={async (blob) => {
          const imported = await application.prepareImport(blob)
          await refresh()
          navigate(`/characters/${encodeURIComponent(imported.draftId)}/expressions`)
        }}
        refresh={refresh}
      />} />
      <Route path="/characters/:characterId" element={<Navigate to="expressions" replace />} />
      <Route path="/characters/:characterId/:step" element={<CharacterEditor application={application} refresh={refresh} />} />
      <Route path="/characters/:characterId/:step/:variantId" element={<CharacterEditor application={application} refresh={refresh} />} />
      <Route path="*" element={<Navigate to="/characters" replace />} />
    </Routes>
  </>
}
