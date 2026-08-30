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
  title: string
  narrative: string
  scene?: {
    backgroundAssetId?: string
    characterStateId?: string
  }
  actions: Array<{ id: string; label: string }>
  progress: ProgressSummary[]
}
