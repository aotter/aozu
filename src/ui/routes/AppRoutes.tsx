import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router'

import type { Application } from '@/bootstrap.ts'
import { AppHeader } from '@/ui/AppHeader'
import { CharacterDraftPage } from '@/ui/pages/CharacterDraftPage'
import { CharacterLibraryPage } from '@/ui/pages/CharacterLibraryPage'
import { StatusPage } from '@/ui/pages/StatusPage'

function CharacterEditor({ application, refresh, savedRevision }: { application: Application; refresh(): Promise<void>; savedRevision?: number }) {
  const navigate = useNavigate()
  const { characterId, step } = useParams()
  if (!characterId) return <Navigate to="/characters" replace />
  return <CharacterDraftPage
    editor={application.editor}
    savedRevision={savedRevision}
    autoFitVariant={application.autoFitCharacterVariant}
    fitSuggestion={application.characterFitSuggestion}
    compileAtlas={application.compileCharacterAtlas}
    exportCharacter={() => application.exportCharacter(characterId)}
    replaceAsset={(target, blob) => application.replaceCharacterAsset(characterId, target, blob)}
    deleteCharacter={async () => {
      await application.deleteCharacter(characterId)
      await refresh()
      navigate('/characters')
    }}
    saveAs={async () => {
      const saved = await application.saveCharacterAs()
      await refresh()
      navigate(`/characters/${encodeURIComponent(saved.id)}/${step ?? 'expressions'}`)
      return saved
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
  const creatingFirstCharacter = useRef(false)
  useLayoutEffect(() => { document.getElementById('root')?.scrollTo(0, 0) }, [location.pathname])
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
  // Every persisted Character revision refreshes the library listing (names, ordering).
  useEffect(() => application.editor.store.subscribe((state, previous) => {
    if (state.persistedRevision !== previous.persistedRevision) void refresh()
  }), [application, refresh])
  useEffect(() => application.subscribeCharacterChanges(() => { void refresh() }), [application, refresh])
  useEffect(() => {
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => document.removeEventListener('visibilitychange', refreshWhenVisible)
  }, [refresh])
  useEffect(() => {
    if (!library || library.characters.length > 0 || location.pathname !== '/characters' || creatingFirstCharacter.current) return
    creatingFirstCharacter.current = true
    void application.createCharacter(null)
      .then(async (character) => {
        await refresh()
        navigate(`/characters/${encodeURIComponent(character.id)}/expressions`, { replace: true })
      })
      .catch(() => {
        creatingFirstCharacter.current = false
        setLoadError(true)
      })
  }, [application, library, location.pathname, navigate, refresh])

  if (loadError) return <><AppHeader webmcp={webmcp} /><StatusPage>{t('startup.error')}</StatusPage></>
  if (!library) return <><AppHeader webmcp={webmcp} /><StatusPage>{t('startup.loading')}</StatusPage></>
  if (library.characters.length === 0 && location.pathname === '/characters') return <><AppHeader webmcp={webmcp} /><StatusPage>{t('startup.loading')}</StatusPage></>

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
        createCharacter={() => application.createCharacter(null)}
        openCharacter={(id) => navigate(`/characters/${encodeURIComponent(id)}/expressions`)}
        importCharacter={async (blob) => {
          const imported = await application.importCharacter(blob)
          await refresh()
          navigate(`/characters/${encodeURIComponent(imported.id)}/expressions`)
        }}
        refresh={refresh}
      />} />
      <Route path="/characters/:characterId" element={<Navigate to="expressions" replace />} />
      <Route path="/characters/:characterId/:step" element={<CharacterEditor application={application} refresh={refresh} savedRevision={character?.revision} />} />
      <Route path="/characters/:characterId/:step/:variantId" element={<CharacterEditor application={application} refresh={refresh} savedRevision={character?.revision} />} />
      <Route path="*" element={<Navigate to="/characters" replace />} />
    </Routes>
  </>
}
