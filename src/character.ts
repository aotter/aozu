export const CHARACTER_PATHS = {
  pack: 'character/pack.json',
  state: 'character/state.json',
  seedJob: 'character/jobs/job_momo_canonical_01.json',
  seedCandidate:
    'character/candidates/cand_momo_canonical_01/candidate.json',
  seedAsset:
    'character/candidates/cand_momo_canonical_01/assets/canonical.png',
} as const

export type CharacterContract = {
  canvas: { width: 512; height: 768 }
  pose: 'fullbody-front-v1'
  footBaseline: number
  centerX: 256
  silhouetteBounds: [number, number, number, number]
  requiredExpressions: ['neutral', 'happy']
  renderOrder: [
    'background',
    'item-back',
    'character-skin',
    'item-front',
    'aura',
    'foreground',
  ]
  preserve: string[]
}

export type CharacterItem = {
  id: string
  part: 'headwear' | 'hand' | 'back' | 'aura'
  layers: Array<{
    id: string
    asset: string
    placement: 'item-back' | 'item-front' | 'aura'
    z: number
  }>
  conflictsWith: Array<{ item: string }>
  requires: Array<{ item: string } | { part: CharacterItem['part'] }>
  replaces: Array<{ item: string } | { part: CharacterItem['part'] }>
}

export type CharacterPack = {
  apiVersion: 'companion.local/v1alpha1'
  kind: 'CharacterPack'
  id: 'momo-v1'
  version: 1
  contract: CharacterContract
  identity: null | { canonicalAsset: string; canonicalSha256: string }
  outfits: Record<
    string,
    {
      label: string
      variants: Record<string, string>
      fallbackExpression: 'neutral'
    }
  >
  parts: Record<
    CharacterItem['part'],
    { required?: boolean; fallbackItem?: string; maxEquipped: number }
  >
  items: Record<string, CharacterItem>
}

export type CharacterState = {
  apiVersion: 'companion.local/v1alpha1'
  kind: 'CharacterState'
  packId: 'momo-v1'
  activeOutfit: string | null
  activeExpression: string | null
  equippedItemIds: string[]
  revision: number
}

export type AssetJob = {
  apiVersion: 'companion.local/v1alpha1'
  kind: 'AssetJob'
  id: string
  packId: 'momo-v1'
  workflow:
    | 'canonical-character'
    | 'expression-variant'
    | 'outfit-skin'
    | 'wearable-prop'
  prompt: string
  sourceCanonicalSha256: string | null
  target?: {
    outfitId?: string
    expressionId?: string
    part?: CharacterItem['part']
    itemId?: string
  }
  constraints: {
    canvas: [512, 768]
    pose: 'fullbody-front-v1'
    preserve: string[]
    transparentBackground: true
    outputLayers: Array<'skin' | 'back' | 'front' | 'aura'>
  }
  candidateCount: 1 | 2 | 3 | 4
  status:
    | 'proposed'
    | 'exported'
    | 'imported'
    | 'validating'
    | 'valid'
    | 'invalid'
    | 'reviewing'
    | 'approved'
    | 'rejected'
    | 'activated'
}

export type AssetJobProposal = {
  workflow: Exclude<AssetJob['workflow'], 'canonical-character'>
  prompt: string
  target: NonNullable<AssetJob['target']>
  candidateCount: 2 | 3 | 4
}

export function createAssetJob(pack: CharacterPack, proposal: AssetJobProposal) {
  if (!pack.identity) throw new Error('請先啟用 canonical character')
  if (proposal.prompt.length < 1 || proposal.prompt.length > 1000) {
    throw new Error('prompt 長度必須為 1–1000')
  }
  const { workflow, target } = proposal
  if (
    workflow === 'expression-variant' &&
    (!target.outfitId ||
      !pack.outfits[target.outfitId] ||
      !target.expressionId ||
      pack.outfits[target.outfitId].variants[target.expressionId])
  ) {
    throw new Error('expression target 無效或已存在')
  }
  if (
    workflow === 'outfit-skin' &&
    (!target.outfitId || pack.outfits[target.outfitId])
  ) {
    throw new Error('outfit target 無效或已存在')
  }
  if (
    workflow === 'wearable-prop' &&
    (!target.itemId || !target.part || pack.items[target.itemId])
  ) {
    throw new Error('wearable target 無效或已存在')
  }
  const outputLayers =
    workflow === 'wearable-prop'
      ? (['back', 'front'] as const)
      : (['skin'] as const)
  const id = `job_${crypto.randomUUID().replaceAll('-', '_')}`
  const job: AssetJob = {
    apiVersion: 'companion.local/v1alpha1',
    kind: 'AssetJob',
    id,
    packId: pack.id,
    workflow,
    prompt: proposal.prompt,
    sourceCanonicalSha256: pack.identity.canonicalSha256,
    target,
    constraints: {
      canvas: [pack.contract.canvas.width, pack.contract.canvas.height],
      pose: pack.contract.pose,
      preserve: pack.contract.preserve,
      transparentBackground: true,
      outputLayers: [...outputLayers],
    },
    candidateCount: proposal.candidateCount,
    status: 'proposed',
  }
  return {
    job,
    productionBrief: {
      workflow,
      request: proposal.prompt,
      canonicalAsset: pack.identity.canonicalAsset,
      canonicalSha256: pack.identity.canonicalSha256,
      target,
      canvas: job.constraints.canvas,
      pose: job.constraints.pose,
      preserve: job.constraints.preserve,
      outputLayers: job.constraints.outputLayers,
      candidateCount: job.candidateCount,
      constraints: [
        'Start from the canonical reference, never from a generated variant.',
        'Return one complete 512×768 image per declared layer.',
        'Use genuine transparent alpha; do not paint a checkerboard.',
        'Before packaging, inspect every generated file for exact dimensions and alpha; retry generation instead of uploading a known-invalid file.',
        'Do not resize, chroma-key, or remove a background to make invalid output pass.',
        workflow === 'wearable-prop'
          ? 'Return isolated prop pixels only; never include character pixels.'
          : 'Return one complete full-body character skin.',
        'No background, crop, extra object, text, or watermark.',
      ],
    },
  }
}

export type AssetCandidate = {
  apiVersion: 'companion.local/v1alpha1'
  kind: 'AssetCandidate'
  id: string
  jobId: string
  status: 'valid' | 'invalid' | 'approved' | 'rejected' | 'activated'
  assets: Array<{
    layerId: string
    path: string
    type: string
    size: number
    sha256: string
  }>
  validation: {
    dimensions: 'passed' | 'failed'
    alpha: 'passed' | 'failed'
    alignment: 'passed' | 'failed' | 'not-applicable'
    silhouetteBounds: [number, number, number, number]
    reasons: string[]
  }
}

export type CharacterDocument = {
  path: string
  value: CharacterPack | CharacterState | AssetJob | AssetCandidate
}

export type CharacterRenderLayer = {
  id: string
  asset: string
  placement: CharacterContract['renderOrder'][number]
  z: number
}

function requireOutfit(pack: CharacterPack, outfitId: string | null) {
  if (!outfitId || !pack.outfits[outfitId]) {
    throw new Error(`找不到 outfit：${outfitId ?? 'none'}`)
  }
  return pack.outfits[outfitId]
}

export function setCharacterOutfit(
  pack: CharacterPack,
  state: CharacterState,
  outfitId: string,
) {
  const outfit = requireOutfit(pack, outfitId)
  if (!outfit.variants.neutral) throw new Error(`outfit 缺少 neutral：${outfitId}`)
  return {
    ...state,
    activeOutfit: outfitId,
    activeExpression:
      state.activeExpression && outfit.variants[state.activeExpression]
        ? state.activeExpression
        : outfit.fallbackExpression,
    revision: state.revision + 1,
  }
}

export function setCharacterExpression(
  pack: CharacterPack,
  state: CharacterState,
  expressionId: string,
) {
  const outfit = requireOutfit(pack, state.activeOutfit)
  if (!outfit.variants[expressionId]) {
    throw new Error(
      `outfit ${state.activeOutfit} 不支援 expression：${expressionId}`,
    )
  }
  return {
    ...state,
    activeExpression: expressionId,
    revision: state.revision + 1,
  }
}

function matchesReference(
  item: CharacterItem,
  reference: { item: string } | { part: CharacterItem['part'] },
) {
  return 'item' in reference
    ? item.id === reference.item
    : item.part === reference.part
}

export function equipCharacterItem(
  pack: CharacterPack,
  state: CharacterState,
  itemId: string,
) {
  const item = pack.items[itemId]
  if (!item) throw new Error(`找不到 item：${itemId}`)
  const equipped = state.equippedItemIds
    .map((id) => pack.items[id])
    .filter((value): value is CharacterItem => Boolean(value))
    .filter(
      (equippedItem) =>
        !item.replaces.some((reference) =>
          matchesReference(equippedItem, reference),
        ),
    )
  if (
    equipped.some(
      (equippedItem) =>
        item.conflictsWith.some(({ item: id }) => id === equippedItem.id) ||
        equippedItem.conflictsWith.some(({ item: id }) => id === item.id),
    )
  ) {
    throw new Error(`item 衝突：${itemId}`)
  }
  if (
    item.requires.some((reference) =>
      'item' in reference
        ? !equipped.some((equippedItem) => equippedItem.id === reference.item)
        : !equipped.some((equippedItem) => equippedItem.part === reference.part),
    )
  ) {
    throw new Error(`item 缺少 requires：${itemId}`)
  }
  const part = pack.parts[item.part]
  if (equipped.filter((equippedItem) => equippedItem.part === item.part).length >= part.maxEquipped) {
    throw new Error(`part 已達 maxEquipped：${item.part}`)
  }
  return {
    ...state,
    equippedItemIds: [...equipped.map(({ id }) => id), itemId],
    revision: state.revision + 1,
  }
}

export function unequipCharacterItem(
  pack: CharacterPack,
  state: CharacterState,
  itemId: string,
) {
  const item = pack.items[itemId]
  if (!item) throw new Error(`找不到 item：${itemId}`)
  const equippedItemIds = state.equippedItemIds.filter((id) => id !== itemId)
  const part = pack.parts[item.part]
  if (
    part.required &&
    !equippedItemIds.some((id) => pack.items[id]?.part === item.part)
  ) {
    if (!part.fallbackItem || !pack.items[part.fallbackItem]) {
      throw new Error(`required part 缺少 fallback：${item.part}`)
    }
    equippedItemIds.push(part.fallbackItem)
  }
  return { ...state, equippedItemIds, revision: state.revision + 1 }
}

export function resolveCharacterLayers(
  pack: CharacterPack,
  state: CharacterState,
) {
  const outfit = requireOutfit(pack, state.activeOutfit)
  const expression =
    state.activeExpression && outfit.variants[state.activeExpression]
      ? state.activeExpression
      : outfit.fallbackExpression
  const skin = outfit.variants[expression]
  if (!skin) throw new Error(`outfit 缺少 fallback skin：${state.activeOutfit}`)
  const layers: CharacterRenderLayer[] = [
    {
      id: `skin:${state.activeOutfit}:${expression}`,
      asset: skin,
      placement: 'character-skin',
      z: 30,
    },
  ]
  for (const itemId of state.equippedItemIds) {
    const item = pack.items[itemId]
    if (!item) throw new Error(`equipped item 不存在：${itemId}`)
    for (const layer of item.layers) {
      const range =
        layer.placement === 'item-back'
          ? [10, 29]
          : layer.placement === 'item-front'
            ? [31, 49]
            : [50, 59]
      if (layer.z < range[0] || layer.z > range[1]) {
        throw new Error(`layer z 超出 ${layer.placement} 範圍：${layer.id}`)
      }
      layers.push({ ...layer })
    }
  }
  const ids = new Set(layers.map(({ id }) => id))
  if (ids.size !== layers.length) throw new Error('render layer id 重複')
  return layers.sort((a, b) => a.z - b.z)
}

export function runCharacterRuleSelfCheck() {
  const base: CharacterPack = {
    apiVersion: 'companion.local/v1alpha1',
    kind: 'CharacterPack',
    id: 'momo-v1',
    version: 1,
    contract: {
      canvas: { width: 512, height: 768 },
      pose: 'fullbody-front-v1',
      footBaseline: 736,
      centerX: 256,
      silhouetteBounds: [41, 22, 422, 737],
      requiredExpressions: ['neutral', 'happy'],
      renderOrder: [
        'background',
        'item-back',
        'character-skin',
        'item-front',
        'aura',
        'foreground',
      ],
      preserve: [],
    },
    identity: null,
    outfits: {
      default: {
        label: 'Default',
        variants: { neutral: 'default.png', happy: 'happy.png' },
        fallbackExpression: 'neutral',
      },
      winter: {
        label: 'Winter',
        variants: { neutral: 'winter.png' },
        fallbackExpression: 'neutral',
      },
    },
    parts: {
      headwear: { required: true, fallbackItem: 'base-cap', maxEquipped: 1 },
      hand: { maxEquipped: 1 },
      back: { maxEquipped: 1 },
      aura: { maxEquipped: 1 },
    },
    items: {
      'base-cap': {
        id: 'base-cap',
        part: 'headwear',
        layers: [],
        conflictsWith: [],
        requires: [],
        replaces: [{ part: 'headwear' }],
      },
      'witch-hat': {
        id: 'witch-hat',
        part: 'headwear',
        layers: [
          {
            id: 'hat-back',
            asset: 'hat-back.png',
            placement: 'item-back',
            z: 15,
          },
          {
            id: 'hat-front',
            asset: 'hat-front.png',
            placement: 'item-front',
            z: 35,
          },
        ],
        conflictsWith: [],
        requires: [],
        replaces: [{ part: 'headwear' }],
      },
      'rival-hat': {
        id: 'rival-hat',
        part: 'headwear',
        layers: [],
        conflictsWith: [{ item: 'witch-hat' }],
        requires: [],
        replaces: [],
      },
    },
  }
  let state: CharacterState = {
    apiVersion: 'companion.local/v1alpha1',
    kind: 'CharacterState',
    packId: 'momo-v1',
    activeOutfit: 'default',
    activeExpression: 'happy',
    equippedItemIds: ['base-cap'],
    revision: 1,
  }
  state = setCharacterOutfit(base, state, 'winter')
  if (state.activeExpression !== 'neutral') throw new Error('outfit fallback 失敗')
  try {
    setCharacterExpression(base, state, 'happy')
    throw new Error('缺少 expression 應被拒絕')
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('不支援')) throw error
  }
  state = equipCharacterItem(base, state, 'witch-hat')
  if (state.equippedItemIds.join() !== 'witch-hat') {
    throw new Error('part replacement 失敗')
  }
  const layers = resolveCharacterLayers(base, state)
  if (layers.map(({ id }) => id).join() !== 'hat-back,skin:winter:neutral,hat-front') {
    throw new Error('render order 失敗')
  }
  const beforeConflict = state
  try {
    equipCharacterItem(base, state, 'rival-hat')
    throw new Error('item conflict 應被拒絕')
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('衝突')) throw error
  }
  if (state !== beforeConflict || state.equippedItemIds.join() !== 'witch-hat') {
    throw new Error('item conflict 改動了原 state')
  }
  state = unequipCharacterItem(base, state, 'witch-hat')
  if (state.equippedItemIds.join() !== 'base-cap') {
    throw new Error('required fallback 失敗')
  }
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function inspectCharacterImage(blob: Blob) {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('無法建立角色資產 canvas')
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  let minX = canvas.width
  let minY = canvas.height
  let maxX = -1
  let maxY = -1
  let transparentPixels = 0

  for (let index = 3; index < pixels.length; index += 4) {
    const alpha = pixels[index]
    const pixelIndex = (index - 3) / 4
    const x = pixelIndex % canvas.width
    const y = Math.floor(pixelIndex / canvas.width)
    if (alpha === 0) transparentPixels += 1
    if (alpha > 0) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < 0) throw new Error('角色資產完全透明')
  let anchorMinX = canvas.width
  let anchorMaxX = -1
  const headBandBottom = minY + Math.ceil((maxY - minY) * 0.25)
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] === 0) continue
    const pixelIndex = (index - 3) / 4
    const y = Math.floor(pixelIndex / canvas.width)
    if (y > headBandBottom) continue
    const x = pixelIndex % canvas.width
    anchorMinX = Math.min(anchorMinX, x)
    anchorMaxX = Math.max(anchorMaxX, x)
  }

  return {
    width: canvas.width,
    height: canvas.height,
    hasTransparentPixels: transparentPixels > 0,
    silhouetteBounds: [minX, minY, maxX + 1, maxY + 1] as [
      number,
      number,
      number,
      number,
    ],
    anchorCenterX: (anchorMinX + anchorMaxX + 1) / 2,
    sha256: bytesToHex(
      new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())),
    ),
  }
}

export async function createSeedCharacterWorkspace(
  canonicalCandidate: Blob,
): Promise<{ documents: CharacterDocument[]; assetPath: string }> {
  const inspected = await inspectCharacterImage(canonicalCandidate)
  const validDimensions = inspected.width === 512 && inspected.height === 768
  const validAlpha = inspected.hasTransparentPixels
  const validAlignment = Math.abs(inspected.anchorCenterX - 256) <= 8
  const preserve = [
    'identity',
    'face',
    'bodyProportions',
    'pose',
    'cameraDistance',
    'lineStyle',
    'lightingDirection',
  ]
  const pack: CharacterPack = {
    apiVersion: 'companion.local/v1alpha1',
    kind: 'CharacterPack',
    id: 'momo-v1',
    version: 1,
    contract: {
      canvas: { width: 512, height: 768 },
      pose: 'fullbody-front-v1',
      footBaseline: inspected.silhouetteBounds[3] - 1,
      centerX: 256,
      silhouetteBounds: inspected.silhouetteBounds,
      requiredExpressions: ['neutral', 'happy'],
      renderOrder: [
        'background',
        'item-back',
        'character-skin',
        'item-front',
        'aura',
        'foreground',
      ],
      preserve,
    },
    identity: null,
    outfits: {},
    parts: {
      headwear: { maxEquipped: 1 },
      hand: { maxEquipped: 1 },
      back: { maxEquipped: 1 },
      aura: { maxEquipped: 1 },
    },
    items: {},
  }
  const state: CharacterState = {
    apiVersion: 'companion.local/v1alpha1',
    kind: 'CharacterState',
    packId: 'momo-v1',
    activeOutfit: null,
    activeExpression: null,
    equippedItemIds: [],
    revision: 1,
  }
  const job: AssetJob = {
    apiVersion: 'companion.local/v1alpha1',
    kind: 'AssetJob',
    id: 'job_momo_canonical_01',
    packId: 'momo-v1',
    workflow: 'canonical-character',
    prompt: 'Momo canonical full-body front-facing character candidate',
    sourceCanonicalSha256: null,
    constraints: {
      canvas: [512, 768],
      pose: 'fullbody-front-v1',
      preserve,
      transparentBackground: true,
      outputLayers: ['skin'],
    },
    candidateCount: 1,
    status: validDimensions && validAlpha && validAlignment ? 'valid' : 'invalid',
  }
  const candidate: AssetCandidate = {
    apiVersion: 'companion.local/v1alpha1',
    kind: 'AssetCandidate',
    id: 'cand_momo_canonical_01',
    jobId: job.id,
    status: validDimensions && validAlpha && validAlignment ? 'valid' : 'invalid',
    assets: [
      {
        layerId: 'skin',
        path: CHARACTER_PATHS.seedAsset,
        type: canonicalCandidate.type || 'image/png',
        size: canonicalCandidate.size,
        sha256: inspected.sha256,
      },
    ],
    validation: {
      dimensions: validDimensions ? 'passed' : 'failed',
      alpha: validAlpha ? 'passed' : 'failed',
      alignment: validAlignment ? 'passed' : 'failed',
      silhouetteBounds: inspected.silhouetteBounds,
      reasons: [
        ...(!validDimensions ? ['dimensions must be 512×768'] : []),
        ...(!validAlpha ? ['transparent alpha is required'] : []),
        ...(!validAlignment
          ? [`head anchor ${inspected.anchorCenterX} must be within ±8 px of centerX 256`]
          : []),
      ],
    },
  }

  return {
    documents: [
      { path: CHARACTER_PATHS.pack, value: pack },
      { path: CHARACTER_PATHS.state, value: state },
      { path: CHARACTER_PATHS.seedJob, value: job },
      { path: CHARACTER_PATHS.seedCandidate, value: candidate },
    ],
    assetPath: CHARACTER_PATHS.seedAsset,
  }
}
