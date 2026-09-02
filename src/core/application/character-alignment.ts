import {
  CHARACTER_RIG,
  IDENTITY_CHARACTER_TRANSFORM,
  type CharacterVariantGroup,
  type CharacterVariantTransform,
} from '../domain/character.ts'
import type { CharacterEditableRegion } from './character-creation.ts'

export interface CharacterAlphaMask {
  width: number
  height: number
  alpha: Uint8Array
}

export interface CharacterVisualSample {
  width: number
  height: number
  rgba: Uint8ClampedArray
}

type Bounds = { x: number; y: number; width: number; height: number }
type MaskStats = { bounds?: Bounds; visiblePixels: number; edgeTouchPixels: number; center?: { x: number; y: number } }

const round = (value: number) => Math.round(value * 10_000) / 10_000

const characterEditWeight = (region: CharacterEditableRegion, x: number, y: number) => {
  const distance = region.shape.kind === 'rectangle'
    ? Math.min(x - region.shape.x, region.shape.x + region.shape.width - x, y - region.shape.y, region.shape.y + region.shape.height - y)
    : (1 - Math.hypot((x - region.shape.cx) / region.shape.rx, (y - region.shape.cy) / region.shape.ry))
      * Math.min(region.shape.rx, region.shape.ry)
      * (region.shape.kind === 'outside-ellipse' ? -1 : 1)
  return Math.max(0, Math.min(1, distance / 4))
}

export function measureProtectedRegionDelta(
  reference: CharacterVisualSample,
  candidate: CharacterVisualSample,
  region: CharacterEditableRegion,
) {
  if (reference.width !== candidate.width || reference.height !== candidate.height) return null
  let changedPixels = 0
  let comparedPixels = 0
  for (let y = 0; y < reference.height; y++) for (let x = 0; x < reference.width; x++) {
    const rigX = (x + 0.5) * CHARACTER_RIG.canvas.width / reference.width
    const rigY = (y + 0.5) * CHARACTER_RIG.canvas.height / reference.height
    if (characterEditWeight(region, rigX, rigY) > 0) continue
    const index = (y * reference.width + x) * 4
    comparedPixels++
    if ([0, 1, 2, 3].some((channel) => reference.rgba[index + channel] !== candidate.rgba[index + channel])) changedPixels++
  }
  return {
    protectedChangeRatio: round(comparedPixels ? changedPixels / comparedPixels : 0),
    changedPixels,
    comparedPixels,
    sample: { width: reference.width, height: reference.height },
  }
}

export function stitchCharacterEditPixels(
  reference: CharacterVisualSample,
  candidate: CharacterVisualSample,
  region: CharacterEditableRegion,
): CharacterVisualSample {
  if (reference.width !== candidate.width || reference.height !== candidate.height) throw new Error('Character edit images must use the same canvas')
  const rgba = new Uint8ClampedArray(reference.rgba)
  for (let y = 0; y < reference.height; y++) for (let x = 0; x < reference.width; x++) {
    const weight = characterEditWeight(
      region,
      (x + 0.5) * CHARACTER_RIG.canvas.width / reference.width,
      (y + 0.5) * CHARACTER_RIG.canvas.height / reference.height,
    )
    if (!weight) continue
    const index = (y * reference.width + x) * 4
    if (weight === 1) {
      rgba.set(candidate.rgba.subarray(index, index + 4), index)
      continue
    }
    const referenceAlpha = reference.rgba[index + 3]! / 255
    const candidateAlpha = candidate.rgba[index + 3]! / 255
    const alpha = referenceAlpha * (1 - weight) + candidateAlpha * weight
    for (let channel = 0; channel < 3; channel++) rgba[index + channel] = alpha
      ? Math.round((reference.rgba[index + channel]! * referenceAlpha * (1 - weight) + candidate.rgba[index + channel]! * candidateAlpha * weight) / alpha)
      : 0
    rgba[index + 3] = Math.round(alpha * 255)
  }
  return { width: reference.width, height: reference.height, rgba }
}

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

const correlation = (count: number, sumA: number, sumB: number, sumAA: number, sumBB: number, sumAB: number) => {
  const denominator = Math.sqrt((count * sumAA - sumA * sumA) * (count * sumBB - sumB * sumB))
  return denominator > 0 ? (count * sumAB - sumA * sumB) / denominator : -1
}

const visualChannels = ({ width, height, rgba }: CharacterVisualSample) => {
  const gray = new Float32Array(width * height)
  const alpha = new Uint8Array(width * height)
  for (let pixel = 0, source = 0; pixel < gray.length; pixel++, source += 4) {
    gray[pixel] = rgba[source]! * 0.2126 + rgba[source + 1]! * 0.7152 + rgba[source + 2]! * 0.0722
    alpha[pixel] = rgba[source + 3]!
  }
  const edge = new Float32Array(gray.length)
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const index = y * width + x
    edge[index] = Math.abs(gray[index + 1]! - gray[index - 1]!) + Math.abs(gray[index + width]! - gray[index - width]!)
  }
  return { gray, alpha, edge }
}

export function suggestCharacterVisualRegistration(
  body: CharacterVisualSample,
  candidate: CharacterVisualSample,
  current: CharacterVariantTransform = IDENTITY_CHARACTER_TRANSFORM,
) {
  // ponytail: this coarse visual correlation only suggests transforms; add semantic landmarks if cross-style failures persist.
  if (body.width !== candidate.width || body.height !== candidate.height) return null
  const reference = visualChannels(body)
  const source = visualChannels(candidate)
  const points: Array<{ x: number; y: number; gray: number; edge: number }> = []
  let minX = candidate.width
  let minY = candidate.height
  let maxX = -1
  for (let y = 0; y < candidate.height; y++) for (let x = 0; x < candidate.width; x++) if (source.alpha[y * candidate.width + x]! > 32) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x)
  }
  for (let y = 1; y < candidate.height - 1; y += 2) for (let x = 1; x < candidate.width - 1; x += 2) {
    const index = y * candidate.width + x
    if (source.alpha[index]! <= 32) continue
    points.push({ x, y, gray: source.gray[index]!, edge: source.edge[index]! })
  }
  if (points.length < 64) return null
  let bodyMinX = body.width
  let bodyMaxX = -1
  for (let y = 0; y < body.height; y++) for (let x = 0; x < body.width; x++) if (reference.alpha[y * body.width + x]! > 32) {
    bodyMinX = Math.min(bodyMinX, x); bodyMaxX = Math.max(bodyMaxX, x)
  }
  if (bodyMaxX < bodyMinX) return null
  const ratioX = body.width / CHARACTER_RIG.canvas.width
  const ratioY = body.height / CHARACTER_RIG.canvas.height
  const score = (transform: CharacterVariantTransform) => {
    let count = 0
    let grayA = 0; let grayB = 0; let grayAA = 0; let grayBB = 0; let grayAB = 0
    let edgeA = 0; let edgeB = 0; let edgeAA = 0; let edgeBB = 0; let edgeAB = 0
    for (const point of points) {
      const x = Math.round(transform.x * ratioX + point.x * transform.scale)
      const y = Math.round(transform.y * ratioY + point.y * transform.scale)
      if (x < 0 || y < 0 || x >= body.width || y >= body.height) continue
      const index = y * body.width + x
      const bodyGray = reference.gray[index]!
      const bodyEdge = reference.edge[index]!
      count++; grayA += point.gray; grayB += bodyGray; grayAA += point.gray * point.gray; grayBB += bodyGray * bodyGray; grayAB += point.gray * bodyGray
      edgeA += point.edge; edgeB += bodyEdge; edgeAA += point.edge * point.edge; edgeBB += bodyEdge * bodyEdge; edgeAB += point.edge * bodyEdge
    }
    if (count < points.length * 0.8) return -1
    return correlation(count, grayA, grayB, grayAA, grayBB, grayAB) * 0.65
      + correlation(count, edgeA, edgeB, edgeAA, edgeBB, edgeAB) * 0.35
  }
  const sourceCenterX = (minX + maxX) / 2
  const bodyCenterX = (bodyMinX + bodyMaxX) / 2
  let best = { transform: current, score: score(current) }
  const evaluate = (scale: number, centerX: number, topY: number) => {
    const transform = {
      scale: round(scale),
      x: round((centerX - sourceCenterX * scale) / ratioX),
      y: round((topY - minY * scale) / ratioY),
    }
    const value = score(transform)
    if (value > best.score) best = { transform, score: value }
  }
  for (let scale = 0.25; scale <= 1.0001; scale += 0.05) {
    for (let center = bodyCenterX - 8; center <= bodyCenterX + 8; center += 2) {
      for (let top = 0; top <= body.height / 3; top += 2) evaluate(scale, center, top)
    }
  }
  const coarse = best.transform
  const coarseCenter = coarse.x * ratioX + sourceCenterX * coarse.scale
  const coarseTop = coarse.y * ratioY + minY * coarse.scale
  for (let scale = Math.max(0.25, coarse.scale - 0.04); scale <= Math.min(1, coarse.scale + 0.0401); scale += 0.01) {
    for (let center = coarseCenter - 2; center <= coarseCenter + 2; center += 0.5) {
      for (let top = coarseTop - 2; top <= coarseTop + 2; top += 0.5) evaluate(scale, center, top)
    }
  }
  const currentScore = score(current)
  const improvement = best.score - currentScore
  return {
    method: 'native-grayscale-edge-correlation' as const,
    score: round(best.score),
    currentScore: round(currentScore),
    improvement: round(improvement),
    suggestedTransform: best.score >= 0.4 && improvement >= 0.08 ? best.transform : null,
  }
}
