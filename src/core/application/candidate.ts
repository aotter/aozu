import type { BundleActivationRepository } from './ports.ts'
import type { ResolvedCharacterLayer } from '../domain/character.ts'

export type StagedCandidatePreview =
  | {
      source: 'preset'
      bundleId: string
      name: string
      stageCount: number
      initialTitle: string
    }
  | {
      source: 'import'
      bundleId: string
      name: string
      entryCount: number
      assetCount: number
    }
  | {
      source: 'character'
      bundleId: string
      name: string
      appearanceCount: number
      layers: Array<ResolvedCharacterLayer & { blob: Blob }>
    }

export const approveCandidate = (
  bundles: BundleActivationRepository,
  bundleId: string,
  approved: true,
) => bundles.activate(bundleId, approved)
