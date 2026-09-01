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

export const workspacePhase = (pathname: string) => {
  if (pathname.startsWith('/character')) return 'character'
  if (pathname === '/starter') return 'starter'
  if (pathname === '/review') return 'review'
  if (pathname === '/create') return 'create'
  if (pathname === '/companion') return 'play'
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
