export const WORKSPACE_DESTINATIONS = {
  start: '/start',
  starter: '/starter',
  'character-expressions': '/character/expressions',
  'character-outfits': '/character/outfits',
  'character-props': '/character/props',
  'character-review': '/review',
  create: '/create',
  'experience-review': '/review',
  play: '/companion',
} as const

export type WorkspaceDestination = keyof typeof WORKSPACE_DESTINATIONS

const DRAFT_DESTINATIONS = new Set<WorkspaceDestination>([
  'character-expressions', 'character-outfits', 'character-props', 'character-review', 'create', 'experience-review',
])

export const activeDraftId = (pathname: string) => {
  const match = /^\/drafts\/([^/]+)(?:\/|$)/.exec(pathname)
  if (!match) return null
  try { return decodeURIComponent(match[1]!) } catch { return null }
}

export const workspacePath = (destination: WorkspaceDestination, draftId?: string | null) =>
  draftId && DRAFT_DESTINATIONS.has(destination)
    ? `/drafts/${encodeURIComponent(draftId)}${WORKSPACE_DESTINATIONS[destination]}`
    : WORKSPACE_DESTINATIONS[destination]

export const workspacePhase = (pathname: string) => {
  const path = activeDraftId(pathname) ? pathname.replace(/^\/drafts\/[^/]+/, '') : pathname
  if (path.startsWith('/character')) return 'character'
  if (path === '/starter') return 'starter'
  if (path === '/review') return 'review'
  if (path === '/create') return 'create'
  if (path === '/companion') return 'play'
  return 'start'
}

export function workspaceNavigation({ characterReady, experienceReady, pendingReview, activeCompanion }: {
  characterReady: boolean
  experienceReady: boolean
  pendingReview: boolean
  activeCompanion: boolean
}) {
  const allowed = new Set<WorkspaceDestination>([
    'start', 'starter', 'character-expressions', 'character-outfits', 'character-props',
  ])
  if (characterReady) allowed.add('character-review')
  if (experienceReady) allowed.add('create')
  if (pendingReview) allowed.add('experience-review')
  if (activeCompanion) allowed.add('play')
  return [...allowed].map((id) => ({ id, path: WORKSPACE_DESTINATIONS[id] }))
}
