import type { RuntimePlan } from '@aotter/mantle-runtime'

import { bindMantleWebMcpTools, type MantleToolInvoker } from './tools.ts'

export type WebMcpStatus = 'unsupported' | 'registering' | 'ready' | 'failed'
export type WebMcpState = { status: WebMcpStatus; toolCount: number; error?: string }

const navigationEffect = (value: unknown) => {
  if (!value || typeof value !== 'object') return null
  const navigation = (value as { effects?: { navigation?: unknown } }).effects?.navigation
  if (!navigation || typeof navigation !== 'object') return null
  const { path, mode } = navigation as { path?: unknown; mode?: unknown }
  return typeof path === 'string' && path.startsWith('/characters') && mode === 'push' ? path : null
}

export function createWebMcpController(
  document: Document,
  plan: RuntimePlan,
  triggers: readonly string[],
  invoke: MantleToolInvoker,
) {
  let state: WebMcpState = { status: (document as Document & { modelContext?: unknown }).modelContext ? 'registering' : 'unsupported', toolCount: triggers.length }
  let navigate: ((path: string) => void) | undefined
  let pendingPath: string | undefined
  let disposeBinding: (() => void) | null = null
  const listeners = new Set<(state: WebMcpState) => void>()
  const update = (next: WebMcpState) => {
    state = next
    for (const listener of listeners) listener(state)
  }
  const dispose = () => {
    disposeBinding?.()
    disposeBinding = null
    document.defaultView?.removeEventListener('pagehide', dispose)
  }
  const ready = state.status === 'unsupported' ? Promise.resolve() : bindMantleWebMcpTools(
    document,
    plan,
    invoke,
    new Set(triggers),
    (result) => {
      const path = navigationEffect(result)
      if (path && document.defaultView?.location.pathname !== path) {
        if (navigate) navigate(path)
        else pendingPath = path
      }
    },
  ).then((bound) => {
    disposeBinding = bound
    update({ status: bound ? 'ready' : 'unsupported', toolCount: triggers.length })
  }).catch((error: unknown) => {
    update({ status: 'failed', toolCount: triggers.length, error: error instanceof Error ? error.message : String(error) })
  })
  document.defaultView?.addEventListener('pagehide', dispose)

  return {
    ready,
    getState: () => state,
    subscribe(listener: (state: WebMcpState) => void) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },
    setNavigate(next: (path: string) => void) {
      navigate = next
      if (pendingPath && document.defaultView?.location.pathname !== pendingPath) next(pendingPath)
      pendingPath = undefined
      return () => { if (navigate === next) navigate = undefined }
    },
    dispose,
  }
}
