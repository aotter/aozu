export type CharacterWorkspaceChange = { characterId: string; revision: number | null }

export function createCharacterWorkspaceEvents(channel: BroadcastChannel | null) {
  const listeners = new Set<(change: CharacterWorkspaceChange) => void>()
  const receive = ({ data }: MessageEvent<unknown>) => {
    if (!data || typeof data !== 'object') return
    const { characterId, revision } = data as Partial<CharacterWorkspaceChange>
    if (typeof characterId !== 'string' || !(revision === null || (typeof revision === 'number' && Number.isInteger(revision)))) return
    for (const listener of listeners) listener({ characterId, revision })
  }
  channel?.addEventListener('message', receive)

  return {
    publish(change: CharacterWorkspaceChange) { channel?.postMessage(change) },
    subscribe(listener: (change: CharacterWorkspaceChange) => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    close() {
      channel?.removeEventListener('message', receive)
      channel?.close()
    },
  }
}
