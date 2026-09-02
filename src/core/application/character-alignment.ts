import {
  CHARACTER_RIG,
  IDENTITY_CHARACTER_TRANSFORM,
  type CharacterVariantGroup,
  type CharacterVariantTransform,
} from '../domain/character.ts'

export interface CharacterAlphaMask {
  width: number
  height: number
  alpha: Uint8Array
}

type Bounds = { x: number; y: number; width: number; height: number }
type MaskStats = { bounds?: Bounds; visiblePixels: number; edgeTouchPixels: number; center?: { x: number; y: number } }

const round = (value: number) => Math.round(value * 10_000) / 10_000

const maskStats = (mask: CharacterAlphaMask): MaskStats => {
  let minX = mask.width
  let minY = mask.height
  let maxX = -1
  let maxY = -1
  let visiblePixels = 0
  let edgeTouchPixels = 0
  let sumX = 0
  let sumY = 0
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.alpha[y * mask.width + x]! <= 16) continue
      visiblePixels++
      sumX += x
      sumY += y
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      if (x === 0 || y === 0 || x === mask.width - 1 || y === mask.height - 1) edgeTouchPixels++
    }
  }
  return {
    visiblePixels,
    edgeTouchPixels,
    ...(visiblePixels ? {
      bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
      center: { x: sumX / visiblePixels, y: sumY / visiblePixels },
    } : {}),
  }
}

const transformMask = (mask: CharacterAlphaMask, transform: CharacterVariantTransform): CharacterAlphaMask => {
  if (transform.x === 0 && transform.y === 0 && transform.scale === 1) return mask
  const alpha = new Uint8Array(mask.width * mask.height)
  for (let y = 0; y < mask.height; y++) {
    const sourceY = Math.round((y - transform.y) / transform.scale)
    if (sourceY < 0 || sourceY >= mask.height) continue
    for (let x = 0; x < mask.width; x++) {
      const sourceX = Math.round((x - transform.x) / transform.scale)
      if (sourceX >= 0 && sourceX < mask.width) alpha[y * mask.width + x] = mask.alpha[sourceY * mask.width + sourceX]!
    }
  }
  return { ...mask, alpha }
}

const compareMasks = (reference: CharacterAlphaMask, candidate: CharacterAlphaMask) => {
  let intersection = 0
  let union = 0
  let referencePixels = 0
  let candidatePixels = 0
  for (let index = 0; index < reference.alpha.length; index++) {
    const expected = reference.alpha[index]! > 16
    const actual = candidate.alpha[index]! > 16
    if (expected) referencePixels++
    if (actual) candidatePixels++
    if (expected && actual) intersection++
    if (expected || actual) union++
  }
  const referenceStats = maskStats(reference)
  const candidateStats = maskStats(candidate)
  return {
    iou: round(union ? intersection / union : 0),
    referenceCoverage: round(referencePixels ? intersection / referencePixels : 0),
    candidateCoverage: round(candidatePixels ? intersection / candidatePixels : 0),
    centerDelta: referenceStats.center && candidateStats.center ? {
      x: round(candidateStats.center.x - referenceStats.center.x),
      y: round(candidateStats.center.y - referenceStats.center.y),
    } : null,
    footLineDelta: referenceStats.bounds && candidateStats.bounds
      ? candidateStats.bounds.y + candidateStats.bounds.height - referenceStats.bounds.y - referenceStats.bounds.height
      : null,
    referenceBounds: referenceStats.bounds,
    candidateBounds: candidateStats.bounds,
    edgeTouchPixels: candidateStats.edgeTouchPixels,
  }
}

const suggestedTransform = (reference: CharacterAlphaMask, candidate: CharacterAlphaMask): CharacterVariantTransform | null => {
  const expected = maskStats(reference).bounds
  const actual = maskStats(candidate).bounds
  if (!expected || !actual) return null
  const scale = Math.min(expected.width / actual.width, expected.height / actual.height)
  return {
    scale: round(scale),
    x: round(expected.x - actual.x * scale),
    y: round(expected.y - actual.y * scale),
  }
}

export function measureCharacterMaskAlignment(
  group: CharacterVariantGroup,
  reference: CharacterAlphaMask | null,
  candidate: CharacterAlphaMask,
  transform: CharacterVariantTransform = IDENTITY_CHARACTER_TRANSFORM,
  referenceTransform: CharacterVariantTransform = IDENTITY_CHARACTER_TRANSFORM,
) {
  if (candidate.width !== CHARACTER_RIG.canvas.width || candidate.height !== CHARACTER_RIG.canvas.height) {
    return { status: 'invalid' as const, diagnostics: [{ code: 'INVALID_CANVAS', severity: 'error' as const, message: 'Candidate mask must use the 512×768 rig canvas.' }] }
  }
  const rawStats = maskStats(candidate)
  if (rawStats.edgeTouchPixels && group !== 'prop') {
    return {
      status: 'invalid' as const,
      diagnostics: [{ code: 'ALPHA_TOUCHES_CANVAS_EDGE', severity: 'error' as const, message: `${rawStats.edgeTouchPixels} visible alpha pixels touch the canvas edge.` }],
    }
  }
  if (group === 'prop' || group === 'body') {
    return {
      status: group === 'prop' ? 'unverified' as const : 'aligned' as const,
      metrics: { candidateBounds: rawStats.bounds, edgeTouchPixels: rawStats.edgeTouchPixels },
      diagnostics: rawStats.edgeTouchPixels ? [{ code: 'ALPHA_TOUCHES_CANVAS_EDGE', severity: 'warning' as const, message: `${rawStats.edgeTouchPixels} visible alpha pixels touch the canvas edge; verify that this is intentional.` }] : [],
    }
  }
  if (!reference) return {
    status: 'unverified' as const,
    metrics: { candidateBounds: rawStats.bounds, edgeTouchPixels: rawStats.edgeTouchPixels },
    diagnostics: [{ code: 'REGISTRATION_REQUIRED', severity: 'warning' as const, message: 'Establish the first whole-head registration visually before auto-fitting later expressions.' }],
  }
  const expected = transformMask(reference, referenceTransform)
  const current = compareMasks(expected, transformMask(candidate, transform))
  const suggestion = suggestedTransform(expected, candidate)
  const suggested = suggestion ? compareMasks(expected, transformMask(candidate, suggestion)) : current
  const best = suggested.iou > current.iou ? suggested : current
  const structurallyValid = group === 'expression'
    ? best.iou >= 0.65 && best.referenceCoverage >= 0.75 && best.candidateCoverage >= 0.75
    : best.iou >= 0.6 && best.referenceCoverage >= 0.7 && best.candidateCoverage >= 0.65
  if (!structurallyValid) {
    return {
      status: 'invalid' as const,
      metrics: current,
      suggestedMetrics: suggested,
      suggestedTransform: suggestion,
      diagnostics: [{
        code: group === 'expression' ? 'EXPRESSION_MUST_INCLUDE_COMPLETE_HEAD' : 'OUTFIT_MUST_INCLUDE_COMPLETE_CHARACTER',
        severity: 'error' as const,
        message: group === 'expression'
          ? 'Expression must be a complete whole-head replacement aligned to the canonical head.'
          : 'Outfit must be a complete dressed character-skin replacement, not a clothing-only overlay.',
      }],
    }
  }
  const centered = current.centerDelta && Math.abs(current.centerDelta.x) <= 12 && Math.abs(current.centerDelta.y) <= 12
  const aligned = group === 'outfit'
    ? current.iou >= 0.8 && current.referenceCoverage >= 0.85 && current.candidateCoverage >= 0.8 && Math.abs(current.footLineDelta ?? Infinity) <= 12
    : current.iou >= 0.85 && centered
  return {
    status: aligned ? 'aligned' as const : 'misaligned' as const,
    metrics: current,
    suggestedMetrics: suggested,
    suggestedTransform: suggestion,
    diagnostics: aligned ? [] : [{ code: 'ALIGNMENT_DRIFT', severity: 'warning' as const, message: 'Candidate structure is valid but its registration drifts from the canonical reference.' }],
  }
}

export function highConfidenceCharacterAutoFit(
  alignment: ReturnType<typeof measureCharacterMaskAlignment> | null | undefined,
): CharacterVariantTransform | null {
  if (alignment?.status !== 'misaligned' || !alignment.suggestedTransform || !('suggestedMetrics' in alignment)) return null
  const metrics = alignment.suggestedMetrics
  const centered = metrics.centerDelta && Math.abs(metrics.centerDelta.x) <= 4 && Math.abs(metrics.centerDelta.y) <= 4
  return centered && metrics.iou >= 0.85 && metrics.referenceCoverage >= 0.85 && metrics.candidateCoverage >= 0.85 && metrics.edgeTouchPixels === 0
    ? alignment.suggestedTransform : null
}
