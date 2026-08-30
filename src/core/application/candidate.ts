import type { BundleActivationRepository } from './ports.ts'

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

export const approveCandidate = (
  bundles: BundleActivationRepository,
  bundleId: string,
  approved: true,
) => bundles.activate(bundleId, approved)
