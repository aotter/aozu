export type ActiveCompanion = Readonly<{
  id: string
  name: string
}>

export interface ProgressSummary {
  id: string
  label: string
  value: string | number
  max?: number
}

export interface StageProjection {
  stageId: string
  revision: number
  status: 'active' | 'completed' | 'blocked'
  agentFallback: boolean
  title: string
  narrative: string
  scene?: {
    compositionId: string
    characterStateId?: string
  }
  actions: Array<{ id: string; label: string }>
  progress: ProgressSummary[]
}
