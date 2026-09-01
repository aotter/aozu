export type AdventureMode = 'room' | 'forest'
export type AdventureScores = Record<AdventureMode, number>

export const ADVENTURE_SCORE_KEY = 'aozu:adventure-scores'
export const EMPTY_ADVENTURE_SCORES: AdventureScores = { room: 0, forest: 0 }

export function parseAdventureScores(value: string | null): AdventureScores {
  if (!value) return { ...EMPTY_ADVENTURE_SCORES }
  try {
    const parsed = JSON.parse(value) as Partial<AdventureScores>
    return {
      room: Number.isFinite(parsed.room) ? Math.max(0, Math.floor(parsed.room!)) : 0,
      forest: Number.isFinite(parsed.forest) ? Math.max(0, Math.floor(parsed.forest!)) : 0,
    }
  } catch {
    return { ...EMPTY_ADVENTURE_SCORES }
  }
}

export function recordAdventureScore(storage: Pick<Storage, 'getItem' | 'setItem'>, mode: AdventureMode, score: number) {
  const scores = parseAdventureScores(storage.getItem(ADVENTURE_SCORE_KEY))
  scores[mode] = Math.max(scores[mode], Math.max(0, Math.floor(score)))
  storage.setItem(ADVENTURE_SCORE_KEY, JSON.stringify(scores))
  return scores
}
