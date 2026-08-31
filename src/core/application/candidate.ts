import type { BundleActivationRepository } from './ports.ts'
import type { ResolvedCharacterLayer } from '../domain/character.ts'
import type { ExperienceCandidatePreviewSnapshot } from '../domain/starter.ts'

export type StagedCandidatePreview =
  | ExperienceCandidatePreviewSnapshot
  | {
      source: 'import'
      bundleId: string
      name: string
      entryCount: number
      assetCount: number
    }
  | {
      source: 'character'
      name: string
      appearanceCount: number
      layers: Array<ResolvedCharacterLayer & { blob: Blob }>
    }

export const approveCandidate = (
  bundles: BundleActivationRepository,
  bundleId: string,
  approved: true,
) => bundles.activate(bundleId, approved)
