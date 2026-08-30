import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import {
  CHARACTER_PATHS,
  createAssetJob,
  createSeedCharacterWorkspace,
  equipCharacterItem,
  inspectCharacterImage,
  resolveCharacterLayers,
  runCharacterRuleSelfCheck,
  setCharacterExpression,
  setCharacterOutfit,
  unequipCharacterItem,
  type AssetCandidate,
  type AssetJob,
  type AssetJobProposal,
  type CharacterPack,
  type CharacterItem,
  type CharacterState,
} from './character'

const DB_NAME = 'companion-spike'
const DB_VERSION = 2
const META_STORE = 'meta'
const FILE_STORE = 'files'
const JOURNAL_STORE = 'journals'
const MANIFEST_KEY = 'manifest'
const DOCUMENT_KEY_PREFIX = 'doc:'
const MANIFEST_FILE = 'manifest.json'
const MAX_UNZIPPED_BYTES = 100 * 1024 * 1024
const MAX_CHARACTER_ASSET_BYTES = 5 * 1024 * 1024

type ManifestFile = {
  path: string
  type: string
  size: number
}

type ManifestJournal = ManifestFile & {
  date: string
  eventIds: string[]
}

export type JsonRecord = {
  path: string
  value: unknown
  updatedAt: string
}

export type CompanionManifest = {
  apiVersion: 'companion.local/v1alpha1'
  kind: 'CompanionManifest'
  metadata: {
    id: string
    name: string
    createdAt: string
    updatedAt: string
  }
  state: {
    revision: number
    lastEventId: string
    points: number
  }
  files: ManifestFile[]
  journals: ManifestJournal[]
  documents?: ManifestFile[]
}

export type BlobRecord = {
  path: string
  blob: Blob
  updatedAt: string
}

export type CompanionSnapshot = {
  manifest?: CompanionManifest
  files: BlobRecord[]
  journals: BlobRecord[]
  documents: JsonRecord[]
}

export type CheckInInput = {
  goalId: string
  minutes: number
  note: string
}

export type ProgressInput = {
  sourceTurnId: string
  summary: string
  pointsAwarded: number
  reason: string
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE)
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE, { keyPath: 'path' })
      }
      if (!db.objectStoreNames.contains(JOURNAL_STORE)) {
        db.createObjectStore(JOURNAL_STORE, { keyPath: 'path' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function readCompanion() {
  const db = await openDatabase()
  return new Promise<CompanionSnapshot>((resolve, reject) => {
    const transaction = db.transaction(
      [META_STORE, FILE_STORE, JOURNAL_STORE],
      'readonly',
    )
    const manifestRequest = transaction
      .objectStore(META_STORE)
      .get(MANIFEST_KEY)
    const metaKeysRequest = transaction.objectStore(META_STORE).getAllKeys()
    const metaValuesRequest = transaction.objectStore(META_STORE).getAll()
    const filesRequest = transaction.objectStore(FILE_STORE).getAll()
    const journalsRequest = transaction.objectStore(JOURNAL_STORE).getAll()

    transaction.oncomplete = () => {
      db.close()
      resolve({
        manifest: manifestRequest.result as CompanionManifest | undefined,
        files: filesRequest.result as BlobRecord[],
        journals: journalsRequest.result as BlobRecord[],
        documents: metaKeysRequest.result.flatMap((key, index) =>
          typeof key === 'string' && key.startsWith(DOCUMENT_KEY_PREFIX)
            ? [metaValuesRequest.result[index] as JsonRecord]
            : [],
        ),
      })
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

async function replaceCompanion(snapshot: CompanionSnapshot) {
  const db = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(
      [META_STORE, FILE_STORE, JOURNAL_STORE],
      'readwrite',
    )
    const metaStore = transaction.objectStore(META_STORE)
    const fileStore = transaction.objectStore(FILE_STORE)
    const journalStore = transaction.objectStore(JOURNAL_STORE)

    metaStore.clear()
    fileStore.clear()
    journalStore.clear()
    if (snapshot.manifest) metaStore.put(snapshot.manifest, MANIFEST_KEY)
    for (const document of snapshot.documents) {
      metaStore.put(document, `${DOCUMENT_KEY_PREFIX}${document.path}`)
    }
    for (const file of snapshot.files) fileStore.put(file)
    for (const journal of snapshot.journals) journalStore.put(journal)

    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

export async function commitCompanionSnapshot(
  expectedRevision: number,
  snapshot: CompanionSnapshot & { manifest: CompanionManifest },
) {
  assertManifestMatches(snapshot)
  const db = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(
      [META_STORE, FILE_STORE, JOURNAL_STORE],
      'readwrite',
    )
    const metaStore = transaction.objectStore(META_STORE)
    const fileStore = transaction.objectStore(FILE_STORE)
    const journalStore = transaction.objectStore(JOURNAL_STORE)
    const currentRequest = metaStore.get(MANIFEST_KEY)
    let conflict: Error | undefined

    currentRequest.onsuccess = () => {
      const current = currentRequest.result as CompanionManifest | undefined
      if (!current || current.state.revision !== expectedRevision) {
        conflict = new Error('Companion 已被其他操作更新，請重試')
        transaction.abort()
        return
      }
      // ponytail: small-companion atomic rewrite; switch to targeted writes when
      // character companion size makes rewriting unchanged records measurable.
      metaStore.clear()
      fileStore.clear()
      journalStore.clear()
      metaStore.put(snapshot.manifest, MANIFEST_KEY)
      for (const document of snapshot.documents) {
        metaStore.put(document, `${DOCUMENT_KEY_PREFIX}${document.path}`)
      }
      for (const file of snapshot.files) fileStore.put(file)
      for (const journal of snapshot.journals) journalStore.put(journal)
    }
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onabort = () => {
      db.close()
      reject(conflict ?? transaction.error ?? new Error('IndexedDB transaction 中止'))
    }
  })
}

async function commitJournalEvent(
  expectedRevision: number,
  manifest: CompanionManifest,
  journal: BlobRecord,
) {
  const db = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([META_STORE, JOURNAL_STORE], 'readwrite')
    const metaStore = transaction.objectStore(META_STORE)
    const currentRequest = metaStore.get(MANIFEST_KEY)
    let conflict: Error | undefined

    currentRequest.onsuccess = () => {
      const current = currentRequest.result as CompanionManifest | undefined
      if (!current || current.state.revision !== expectedRevision) {
        conflict = new Error('Companion 已被其他操作更新，請重試')
        transaction.abort()
        return
      }
      metaStore.put(manifest, MANIFEST_KEY)
      transaction.objectStore(JOURNAL_STORE).put(journal)
    }
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onabort = () => {
      db.close()
      reject(conflict ?? transaction.error ?? new Error('IndexedDB transaction 中止'))
    }
  })
}

async function appendJournalEvent(input: {
  kind: 'check_in_submitted' | 'companion_progress_recorded'
  actor: 'user' | 'agent'
  fields: string[]
  body: string
  pointsDelta?: number
}) {
  const snapshot = await readCompanion()
  const manifest = snapshot.manifest
  if (!manifest) throw new Error('請先建立或匯入 companion')

  const now = new Date()
  const at = now.toISOString()
  const date = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Taipei',
  }).format(now)
  const eventId = `evt_${crypto.randomUUID()}`
  const journalPath = `journal/${date}.md`
  const existingJournal = snapshot.journals.find(
    (journal) => journal.path === journalPath,
  )
  const header = `---\njournal: ${date}\ntimezone: Asia/Taipei\nrevision: 1\n---\n\n# ${date}\n`
  const currentMarkdown = existingJournal
    ? (await existingJournal.blob.text()).trimEnd()
    : header.trimEnd()
  const nextMarkdown = `${currentMarkdown}\n\n## ${eventId} · ${input.kind}\n\n- at: ${at}\n- actor: ${input.actor}\n${input.fields.map((field) => `- ${field}\n`).join('')}\n${input.body}\n`
  const journalBlob = new Blob([nextMarkdown], { type: 'text/markdown' })
  const existingManifestJournal = manifest.journals.find(
    (journal) => journal.path === journalPath,
  )
  const nextJournal = {
    path: journalPath,
    type: journalBlob.type,
    size: journalBlob.size,
    date,
    eventIds: [...(existingManifestJournal?.eventIds ?? []), eventId],
  }
  const nextManifest: CompanionManifest = {
    ...manifest,
    metadata: { ...manifest.metadata, updatedAt: at },
    state: {
      ...manifest.state,
      revision: manifest.state.revision + 1,
      lastEventId: eventId,
      points: manifest.state.points + (input.pointsDelta ?? 0),
    },
    journals: existingManifestJournal
      ? manifest.journals.map((journal) =>
          journal.path === journalPath ? nextJournal : journal,
        )
      : [...manifest.journals, nextJournal],
  }
  const journalRecord = { path: journalPath, blob: journalBlob, updatedAt: at }

  await commitJournalEvent(manifest.state.revision, nextManifest, journalRecord)
  return {
    eventId,
    journalPath,
    revision: nextManifest.state.revision,
    points: nextManifest.state.points,
  }
}

export async function appendCheckIn(input: CheckInInput) {
  return {
    status: 'committed',
    ...(await appendJournalEvent({
      kind: 'check_in_submitted',
      actor: 'user',
      fields: [`goal: ${input.goalId}`, `minutes: ${input.minutes}`],
      body: input.note,
    })),
  }
}

export async function appendCompanionProgress(input: ProgressInput) {
  return {
    status: 'committed',
    ...(await appendJournalEvent({
      kind: 'companion_progress_recorded',
      actor: 'agent',
      fields: [
        `source-turn: ${input.sourceTurnId}`,
        `points-awarded: ${input.pointsAwarded}`,
        `reason: ${input.reason}`,
      ],
      body: input.summary,
      pointsDelta: input.pointsAwarded,
    })),
  }
}

function requireCharacterDocument<T extends { kind: string }>(
  snapshot: CompanionSnapshot,
  path: string,
  kind: T['kind'],
) {
  const value = snapshot.documents.find((document) => document.path === path)?.value
  if (!isObject(value) || value.kind !== kind) {
    throw new Error(`角色文件無效或不存在：${path}`)
  }
  return value as T
}

function putCharacterDocument(
  snapshot: CompanionSnapshot & { manifest: CompanionManifest },
  path: string,
  value: unknown,
  updatedAt: string,
) {
  const record = { path, value, updatedAt }
  snapshot.documents = snapshot.documents.some((document) => document.path === path)
    ? snapshot.documents.map((document) => (document.path === path ? record : document))
    : [...snapshot.documents, record]
  const entry = {
    path,
    type: 'application/json',
    size: strToU8(JSON.stringify(value, null, 2)).length,
  }
  snapshot.manifest.documents = (snapshot.manifest.documents ?? []).some(
    (document) => document.path === path,
  )
    ? (snapshot.manifest.documents ?? []).map((document) =>
        document.path === path ? entry : document,
      )
    : [...(snapshot.manifest.documents ?? []), entry]
}

function putCharacterFile(
  snapshot: CompanionSnapshot & { manifest: CompanionManifest },
  path: string,
  blob: Blob,
  updatedAt: string,
) {
  const record = { path, blob, updatedAt }
  snapshot.files = snapshot.files.some((file) => file.path === path)
    ? snapshot.files.map((file) => (file.path === path ? record : file))
    : [...snapshot.files, record]
  const entry = { path, type: blob.type, size: blob.size }
  snapshot.manifest.files = snapshot.manifest.files.some((file) => file.path === path)
    ? snapshot.manifest.files.map((file) => (file.path === path ? entry : file))
    : [...snapshot.manifest.files, entry]
}

async function appendCharacterEvent(
  snapshot: CompanionSnapshot & { manifest: CompanionManifest },
  kind:
    | 'asset_job_proposed'
    | 'asset_candidate_imported'
    | 'asset_candidate_validated'
    | 'asset_candidate_approved'
    | 'asset_candidate_rejected'
    | 'asset_candidate_activated'
    | 'character_outfit_changed'
    | 'character_expression_changed'
    | 'character_item_equipped'
    | 'character_item_unequipped',
  actor: 'user' | 'agent',
  fields: string[],
  updatedAt: string,
) {
  const now = new Date(updatedAt)
  const date = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Taipei',
  }).format(now)
  const eventId = `evt_${crypto.randomUUID()}`
  const path = `journal/${date}.md`
  const existing = snapshot.journals.find((journal) => journal.path === path)
  const header = `---\njournal: ${date}\ntimezone: Asia/Taipei\nrevision: 1\n---\n\n# ${date}\n`
  const markdown = existing ? (await existing.blob.text()).trimEnd() : header.trimEnd()
  const blob = new Blob(
    [`${markdown}\n\n## ${eventId} · ${kind}\n\n- at: ${updatedAt}\n- actor: ${actor}\n${fields.map((field) => `- ${field}\n`).join('')}\n`],
    { type: 'text/markdown' },
  )
  const record = { path, blob, updatedAt }
  snapshot.journals = existing
    ? snapshot.journals.map((journal) => (journal.path === path ? record : journal))
    : [...snapshot.journals, record]
  const current = snapshot.manifest.journals.find((journal) => journal.path === path)
  const entry = {
    path,
    type: blob.type,
    size: blob.size,
    date,
    eventIds: [...(current?.eventIds ?? []), eventId],
  }
  snapshot.manifest.journals = current
    ? snapshot.manifest.journals.map((journal) =>
        journal.path === path ? entry : journal,
      )
    : [...snapshot.manifest.journals, entry]
  snapshot.manifest.state.lastEventId = eventId
  return eventId
}

export async function inspectCharacterWorkspace() {
  const snapshot = await readCompanion()
  const pack = requireCharacterDocument<CharacterPack>(
    snapshot,
    CHARACTER_PATHS.pack,
    'CharacterPack',
  )
  const state = requireCharacterDocument<CharacterState>(
    snapshot,
    CHARACTER_PATHS.state,
    'CharacterState',
  )
  const jobs = snapshot.documents.flatMap((document) =>
    isObject(document.value) && document.value.kind === 'AssetJob'
      ? [document.value as AssetJob]
      : [],
  )
  const candidates = snapshot.documents.flatMap((document) =>
    isObject(document.value) && document.value.kind === 'AssetCandidate'
      ? [document.value as AssetCandidate]
      : [],
  )
  return {
    snapshot,
    pack,
    state,
    jobs,
    candidates,
    layers:
      state.activeOutfit === null ? [] : resolveCharacterLayers(pack, state),
  }
}

function findCharacterDocumentPath(
  snapshot: CompanionSnapshot,
  kind: string,
  id: string,
) {
  const path = snapshot.documents.find(
    (document) =>
      isObject(document.value) &&
      document.value.kind === kind &&
      document.value.id === id,
  )?.path
  if (!path) throw new Error(`找不到 ${kind} 文件：${id}`)
  return path
}

export async function proposeCharacterAssetJob(proposal: AssetJobProposal) {
  const workspace = await inspectCharacterWorkspace()
  const manifest = workspace.snapshot.manifest
  if (!manifest) throw new Error('請先建立或匯入 companion')
  if (
    workspace.jobs.some(
      (job) =>
        job.status !== 'rejected' &&
        job.status !== 'invalid' &&
        job.workflow === proposal.workflow &&
        JSON.stringify(job.target) === JSON.stringify(proposal.target),
    )
  ) {
    throw new Error('已有相同 target 的未終止 job，請先 list_asset_jobs')
  }
  const { job, productionBrief } = createAssetJob(workspace.pack, proposal)
  const updatedAt = new Date().toISOString()
  const expectedRevision = manifest.state.revision
  const snapshot = workspace.snapshot as CompanionSnapshot & { manifest: CompanionManifest }
  putCharacterDocument(snapshot, `character/jobs/${job.id}.json`, job, updatedAt)
  const eventId = await appendCharacterEvent(
    snapshot,
    'asset_job_proposed',
    'agent',
    [`job: ${job.id}`, `workflow: ${job.workflow}`],
    updatedAt,
  )
  snapshot.manifest.metadata.updatedAt = updatedAt
  snapshot.manifest.state.revision += 1
  await commitCompanionSnapshot(expectedRevision, snapshot)
  return {
    status: 'ok',
    revision: snapshot.manifest.state.revision,
    eventId,
    job,
    productionBrief,
  }
}

export async function exportCharacterAssetJob(jobId: string) {
  const workspace = await inspectCharacterWorkspace()
  const manifest = workspace.snapshot.manifest
  if (!manifest || !workspace.pack.identity) throw new Error('角色尚未啟用')
  const job = workspace.jobs.find(({ id }) => id === jobId)
  if (!job || !['proposed', 'exported'].includes(job.status)) {
    throw new Error(`job 不能匯出：${job?.status ?? 'missing'}`)
  }
  const canonical = workspace.snapshot.files.find(
    ({ path }) => path === workspace.pack.identity?.canonicalAsset,
  )
  if (!canonical) throw new Error('canonical asset 不存在')
  const candidateId = `cand_${job.id.slice(4)}_01`
  const assetNames = job.constraints.outputLayers.map((layerId) => ({
    layerId,
    path: `assets/${layerId}.png`,
    sha256: '<sha256>',
  }))
  const entries: Record<string, Uint8Array> = {
    'job.json': strToU8(JSON.stringify(job, null, 2)),
    'reference/canonical.png': new Uint8Array(await canonical.blob.arrayBuffer()),
    'reference/contract.json': strToU8(JSON.stringify(workspace.pack.contract, null, 2)),
    'candidate-template.json': strToU8(
      JSON.stringify(
        {
          apiVersion: 'companion.local/v1alpha1',
          kind: 'AssetCandidateImport',
          candidateId,
          jobId,
          sourceCanonicalSha256: job.sourceCanonicalSha256,
          assets: assetNames,
        },
        null,
        2,
      ),
    ),
  }
  if (job.status === 'proposed') {
    const expectedRevision = manifest.state.revision
    const updatedAt = new Date().toISOString()
    const snapshot = workspace.snapshot as CompanionSnapshot & { manifest: CompanionManifest }
    putCharacterDocument(
      snapshot,
      findCharacterDocumentPath(snapshot, 'AssetJob', job.id),
      { ...job, status: 'exported' },
      updatedAt,
    )
    snapshot.manifest.metadata.updatedAt = updatedAt
    snapshot.manifest.state.revision += 1
    await commitCompanionSnapshot(expectedRevision, snapshot)
  }
  const bytes = zipSync(entries, { level: 6 })
  return {
    filename: `${job.id}.zip`,
    blob: new Blob([new Uint8Array(bytes)], { type: 'application/zip' }),
    candidateId,
    expectedAssets: assetNames,
  }
}

type CandidateBundleManifest = {
  apiVersion: 'companion.local/v1alpha1'
  kind: 'AssetCandidateImport'
  candidateId: string
  jobId: string
  sourceCanonicalSha256: string
  assets: Array<{ layerId: string; path: string; sha256: string }>
}

function parseCandidateBundleManifest(bytes: Uint8Array) {
  const value: unknown = JSON.parse(strFromU8(bytes))
  if (
    !isObject(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          'apiVersion',
          'kind',
          'candidateId',
          'jobId',
          'sourceCanonicalSha256',
          'assets',
        ].includes(key),
    ) ||
    value.apiVersion !== 'companion.local/v1alpha1' ||
    value.kind !== 'AssetCandidateImport' ||
    typeof value.candidateId !== 'string' ||
    !/^cand_[a-z0-9_]{1,80}$/.test(value.candidateId) ||
    typeof value.jobId !== 'string' ||
    !/^job_[a-z0-9_]{1,80}$/.test(value.jobId) ||
    typeof value.sourceCanonicalSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.sourceCanonicalSha256) ||
    !Array.isArray(value.assets) ||
    value.assets.length < 1 ||
    value.assets.length > 2 ||
    !value.assets.every(
      (asset) =>
        isObject(asset) &&
        Object.keys(asset).every((key) =>
          ['layerId', 'path', 'sha256'].includes(key),
        ) &&
        typeof asset.layerId === 'string' &&
        ['skin', 'back', 'front', 'aura'].includes(asset.layerId) &&
        typeof asset.path === 'string' &&
        isSafePath(asset.path) &&
        asset.path.startsWith('assets/') &&
        /\.(png|webp)$/.test(asset.path) &&
        typeof asset.sha256 === 'string' &&
        /^[0-9a-f]{64}$/.test(asset.sha256),
    )
  ) {
    throw new Error('candidate.json 格式無效')
  }
  return value as CandidateBundleManifest
}

export async function importCharacterCandidateBundle(
  bundle: Blob,
  expectedJobId?: string,
) {
  if (bundle.size > 20 * 1024 * 1024) throw new Error('candidate ZIP 超過 20 MiB')
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(new Uint8Array(await bundle.arrayBuffer()))
  } catch {
    throw new Error('candidate ZIP 無法解壓縮')
  }
  const totalBytes = Object.values(entries).reduce((sum, bytes) => sum + bytes.length, 0)
  if (totalBytes > 12 * 1024 * 1024) throw new Error('candidate ZIP 解壓後過大')
  const manifestBytes = entries['candidate.json']
  if (!manifestBytes) throw new Error('candidate ZIP 缺少 candidate.json')
  const imported = parseCandidateBundleManifest(manifestBytes)
  if (expectedJobId && imported.jobId !== expectedJobId) {
    throw new Error(`candidate jobId 不符：${imported.jobId}`)
  }
  const expectedPaths = new Set(['candidate.json', ...imported.assets.map(({ path }) => path)])
  if (
    Object.keys(entries).length !== expectedPaths.size ||
    Object.keys(entries).some((path) => !expectedPaths.has(path))
  ) {
    throw new Error('candidate ZIP 含有缺漏、額外或重複 path')
  }

  const workspace = await inspectCharacterWorkspace()
  const manifest = workspace.snapshot.manifest
  if (!manifest) throw new Error('請先建立或匯入 companion')
  if (workspace.candidates.some(({ id }) => id === imported.candidateId)) {
    throw new Error(`candidate 已存在：${imported.candidateId}`)
  }
  const job = workspace.jobs.find(({ id }) => id === imported.jobId)
  const existingCandidates = workspace.candidates.filter(
    ({ jobId }) => jobId === imported.jobId,
  )
  if (
    !job ||
    !['proposed', 'exported', 'valid', 'invalid'].includes(job.status) ||
    existingCandidates.length >= job.candidateCount
  ) {
    throw new Error(`job 不能匯入：${job?.status ?? 'missing'}`)
  }
  if (
    imported.sourceCanonicalSha256 !== job.sourceCanonicalSha256 ||
    workspace.pack.identity?.canonicalSha256 !== job.sourceCanonicalSha256
  ) {
    throw new Error('candidate canonical hash 與 job lock 不符')
  }
  const declaredLayers = imported.assets.map(({ layerId }) => layerId)
  if (
    new Set(declaredLayers).size !== declaredLayers.length ||
    declaredLayers.sort().join() !== [...job.constraints.outputLayers].sort().join()
  ) {
    throw new Error('candidate layer set 與 job 不符')
  }

  let valid = true
  const reasons: string[] = []
  const candidateAssets: AssetCandidate['assets'] = []
  const inspections: Awaited<ReturnType<typeof inspectCharacterImage>>[] = []
  const files: Array<{ path: string; blob: Blob }> = []
  for (const asset of imported.assets) {
    const bytes = entries[asset.path]
    if (!bytes || bytes.length > MAX_CHARACTER_ASSET_BYTES) {
      throw new Error(`candidate asset 無效或超過 5 MiB：${asset.path}`)
    }
    const type = asset.path.endsWith('.webp') ? 'image/webp' : 'image/png'
    const blob = new Blob([new Uint8Array(bytes)], { type })
    const inspection = await inspectCharacterImage(blob)
    if (inspection.sha256 !== asset.sha256) {
      throw new Error(`candidate hash 不符：${asset.path}`)
    }
    if (
      inspection.width !== job.constraints.canvas[0] ||
      inspection.height !== job.constraints.canvas[1]
    ) {
      valid = false
      reasons.push(`${asset.layerId}: dimensions must be 512×768`)
    }
    if (!inspection.hasTransparentPixels) {
      valid = false
      reasons.push(`${asset.layerId}: transparent alpha is required`)
    }
    if (asset.layerId === 'skin') {
      const [, , , maxY] = inspection.silhouetteBounds
      if (
        Math.abs(maxY - 1 - workspace.pack.contract.footBaseline) > 4 ||
        Math.abs(inspection.anchorCenterX - workspace.pack.contract.centerX) > 8
      ) {
        valid = false
        reasons.push('skin: feet baseline or head anchor is outside tolerance')
      }
    }
    const storedPath = `character/candidates/${imported.candidateId}/assets/${asset.layerId}.${type === 'image/webp' ? 'webp' : 'png'}`
    files.push({ path: storedPath, blob })
    inspections.push(inspection)
    candidateAssets.push({
      layerId: asset.layerId,
      path: storedPath,
      type,
      size: blob.size,
      sha256: inspection.sha256,
    })
  }
  const skinInspection = inspections[declaredLayers.indexOf('skin')] ?? inspections[0]
  const candidate: AssetCandidate = {
    apiVersion: 'companion.local/v1alpha1',
    kind: 'AssetCandidate',
    id: imported.candidateId,
    jobId: job.id,
    status: valid ? 'valid' : 'invalid',
    assets: candidateAssets,
    validation: {
      dimensions: inspections.every(
        ({ width, height }) =>
          width === job.constraints.canvas[0] && height === job.constraints.canvas[1],
      )
        ? 'passed'
        : 'failed',
      alpha: inspections.every(({ hasTransparentPixels }) => hasTransparentPixels)
        ? 'passed'
        : 'failed',
      alignment:
        declaredLayers.includes('skin') &&
        reasons.some((reason) => reason.startsWith('skin: feet'))
          ? 'failed'
          : declaredLayers.includes('skin')
            ? 'passed'
            : 'not-applicable',
      silhouetteBounds: skinInspection.silhouetteBounds,
      reasons,
    },
  }
  const updatedAt = new Date().toISOString()
  const expectedRevision = manifest.state.revision
  const snapshot = workspace.snapshot as CompanionSnapshot & { manifest: CompanionManifest }
  for (const file of files) putCharacterFile(snapshot, file.path, file.blob, updatedAt)
  putCharacterDocument(
    snapshot,
    `character/candidates/${candidate.id}/candidate.json`,
    candidate,
    updatedAt,
  )
  putCharacterDocument(
    snapshot,
    findCharacterDocumentPath(snapshot, 'AssetJob', job.id),
    {
      ...job,
      status:
        candidate.status === 'valid' ||
        existingCandidates.some(({ status }) => status === 'valid')
          ? 'valid'
          : 'invalid',
    },
    updatedAt,
  )
  await appendCharacterEvent(
    snapshot,
    'asset_candidate_imported',
    'user',
    [`candidate: ${candidate.id}`, `job: ${job.id}`],
    updatedAt,
  )
  const eventId = await appendCharacterEvent(
    snapshot,
    'asset_candidate_validated',
    'agent',
    [`candidate: ${candidate.id}`, `result: ${candidate.status}`],
    updatedAt,
  )
  snapshot.manifest.metadata.updatedAt = updatedAt
  snapshot.manifest.state.revision += 1
  await commitCompanionSnapshot(expectedRevision, snapshot)
  return {
    status: candidate.status,
    revision: snapshot.manifest.state.revision,
    eventId,
    candidate,
    importedCount: existingCandidates.length + 1,
    remainingCandidates: job.candidateCount - existingCandidates.length - 1,
  }
}

export async function readCharacterCandidate(candidateId: string) {
  const workspace = await inspectCharacterWorkspace()
  const candidate = workspace.candidates.find(({ id }) => id === candidateId)
  if (!candidate) throw new Error(`找不到 candidate：${candidateId}`)
  const job = workspace.jobs.find(({ id }) => id === candidate.jobId)
  if (!job) throw new Error(`candidate 缺少 job：${candidate.jobId}`)
  const assets = candidate.assets.map((asset) => {
    const record = workspace.snapshot.files.find((file) => file.path === asset.path)
    if (!record) throw new Error(`candidate 缺少 asset：${asset.path}`)
    return { ...asset, blob: record.blob }
  })
  return { candidate, job, assets }
}

export async function reviewCharacterCandidate(
  candidateId: string,
  decision: 'approved' | 'rejected',
) {
  const workspace = await inspectCharacterWorkspace()
  const manifest = workspace.snapshot.manifest
  if (!manifest) throw new Error('請先建立或匯入 companion')
  const candidate = workspace.candidates.find(({ id }) => id === candidateId)
  if (!candidate) throw new Error(`找不到 candidate：${candidateId}`)
  if (candidate.status !== 'valid') throw new Error(`candidate 不能 review：${candidate.status}`)
  const job = workspace.jobs.find(({ id }) => id === candidate.jobId)
  if (!job || job.status !== 'valid') throw new Error('candidate job 尚未通過驗證')

  const updatedAt = new Date().toISOString()
  const expectedRevision = manifest.state.revision
  const snapshot = workspace.snapshot as CompanionSnapshot & { manifest: CompanionManifest }
  putCharacterDocument(
    snapshot,
    findCharacterDocumentPath(snapshot, 'AssetCandidate', candidate.id),
    { ...candidate, status: decision },
    updatedAt,
  )
  putCharacterDocument(
    snapshot,
    findCharacterDocumentPath(snapshot, 'AssetJob', job.id),
    {
      ...job,
      status:
        decision === 'approved' ||
        !workspace.candidates.some(
          (other) =>
            other.id !== candidate.id &&
            other.jobId === job.id &&
            other.status === 'valid',
        )
          ? decision
          : 'valid',
    },
    updatedAt,
  )
  const eventId = await appendCharacterEvent(
    snapshot,
    decision === 'approved' ? 'asset_candidate_approved' : 'asset_candidate_rejected',
    'user',
    [`candidate: ${candidateId}`, `job: ${job.id}`],
    updatedAt,
  )
  snapshot.manifest.metadata.updatedAt = updatedAt
  snapshot.manifest.state.revision += 1
  await commitCompanionSnapshot(expectedRevision, snapshot)
  return { status: decision, candidateId, eventId, revision: snapshot.manifest.state.revision }
}

export async function activateCharacterCandidate(candidateId: string) {
  const workspace = await inspectCharacterWorkspace()
  const manifest = workspace.snapshot.manifest
  if (!manifest) throw new Error('請先建立或匯入 companion')
  const candidate = workspace.candidates.find(({ id }) => id === candidateId)
  if (!candidate || candidate.status !== 'approved') {
    throw new Error('candidate 必須先由使用者批准')
  }
  const job = workspace.jobs.find(({ id }) => id === candidate.jobId)
  if (!job || job.status !== 'approved') {
    throw new Error('candidate job 必須先由使用者批准')
  }
  if (
    job.workflow !== 'canonical-character' &&
    (!workspace.pack.identity ||
      job.sourceCanonicalSha256 !== workspace.pack.identity.canonicalSha256)
  ) {
    throw new Error('job canonical lock 已過期')
  }
  const sources = await Promise.all(
    candidate.assets.map(async (asset) => {
      const source = workspace.snapshot.files.find((file) => file.path === asset.path)
      if (!source) throw new Error(`candidate asset 不存在：${asset.path}`)
      const inspected = await inspectCharacterImage(source.blob)
      if (inspected.sha256 !== asset.sha256) throw new Error(`candidate hash 不符：${asset.path}`)
      return { asset, source }
    }),
  )

  const updatedAt = new Date().toISOString()
  const expectedRevision = manifest.state.revision
  const snapshot = workspace.snapshot as CompanionSnapshot & { manifest: CompanionManifest }
  let pack = workspace.pack
  let state = workspace.state
  const activatedPaths: string[] = []
  if (job.workflow === 'canonical-character') {
    const source = sources[0]
    if (
      workspace.pack.identity ||
      sources.length !== 1 ||
      source.asset.layerId !== 'skin'
    ) {
      throw new Error('canonical candidate asset 結構無效')
    }
    const path = 'assets/reference/canonical.png'
    putCharacterFile(snapshot, path, source.source.blob, updatedAt)
    activatedPaths.push(path)
    pack = {
      ...pack,
      identity: { canonicalAsset: path, canonicalSha256: source.asset.sha256 },
      outfits: {
        ...pack.outfits,
        default: {
          label: 'Default',
          variants: { neutral: path },
          fallbackExpression: 'neutral',
        },
      },
    }
    state = {
      ...state,
      activeOutfit: 'default',
      activeExpression: 'neutral',
      revision: state.revision + 1,
    }
  } else if (job.workflow === 'expression-variant') {
    const { outfitId, expressionId } = job.target ?? {}
    const source = sources[0]
    if (
      !outfitId ||
      !expressionId ||
      !pack.outfits[outfitId] ||
      pack.outfits[outfitId].variants[expressionId] ||
      sources.length !== 1 ||
      source.asset.layerId !== 'skin'
    ) {
      throw new Error('expression candidate target 無效或已存在')
    }
    const path = `assets/skins/${outfitId}/${expressionId}.${source.asset.type === 'image/webp' ? 'webp' : 'png'}`
    putCharacterFile(snapshot, path, source.source.blob, updatedAt)
    activatedPaths.push(path)
    pack = {
      ...pack,
      outfits: {
        ...pack.outfits,
        [outfitId]: {
          ...pack.outfits[outfitId],
          variants: { ...pack.outfits[outfitId].variants, [expressionId]: path },
        },
      },
    }
  } else if (job.workflow === 'outfit-skin') {
    const { outfitId } = job.target ?? {}
    const source = sources[0]
    if (!outfitId || pack.outfits[outfitId] || sources.length !== 1 || source.asset.layerId !== 'skin') {
      throw new Error('outfit candidate target 無效或已存在')
    }
    const path = `assets/skins/${outfitId}/neutral.${source.asset.type === 'image/webp' ? 'webp' : 'png'}`
    putCharacterFile(snapshot, path, source.source.blob, updatedAt)
    activatedPaths.push(path)
    pack = {
      ...pack,
      outfits: {
        ...pack.outfits,
        [outfitId]: {
          label: outfitId,
          variants: { neutral: path },
          fallbackExpression: 'neutral',
        },
      },
    }
  } else {
    const { itemId, part } = job.target ?? {}
    if (!itemId || !part || pack.items[itemId]) {
      throw new Error('wearable candidate target 無效或已存在')
    }
    const zByLayer = { back: 15, front: 35, aura: 55, skin: 30 } as const
    const placementByLayer = {
      back: 'item-back',
      front: 'item-front',
      aura: 'aura',
      skin: 'character-skin',
    } as const
    const layers = sources.map(({ asset, source }) => {
      if (!['back', 'front', 'aura'].includes(asset.layerId)) {
        throw new Error('wearable layerId 無效')
      }
      const layerId = asset.layerId as 'back' | 'front' | 'aura'
      const path = `assets/items/${itemId}/${layerId}.${asset.type === 'image/webp' ? 'webp' : 'png'}`
      putCharacterFile(snapshot, path, source.blob, updatedAt)
      activatedPaths.push(path)
      return {
        id: `${itemId}:${layerId}`,
        asset: path,
        placement: placementByLayer[layerId],
        z: zByLayer[layerId],
      }
    })
    pack = {
      ...pack,
      items: {
        ...pack.items,
        [itemId]: {
          id: itemId,
          part,
          layers,
          conflictsWith: [],
          requires: [],
          replaces: [{ part }],
        },
      },
    }
  }
  putCharacterDocument(snapshot, CHARACTER_PATHS.pack, pack, updatedAt)
  putCharacterDocument(snapshot, CHARACTER_PATHS.state, state, updatedAt)
  putCharacterDocument(
    snapshot,
    findCharacterDocumentPath(snapshot, 'AssetCandidate', candidate.id),
    { ...candidate, status: 'activated' },
    updatedAt,
  )
  putCharacterDocument(
    snapshot,
    findCharacterDocumentPath(snapshot, 'AssetJob', job.id),
    { ...job, status: 'activated' },
    updatedAt,
  )
  const eventId = await appendCharacterEvent(
    snapshot,
    'asset_candidate_activated',
    'agent',
    [
      `candidate: ${candidateId}`,
      `job: ${job.id}`,
      ...activatedPaths.map((path) => `asset: ${path}`),
    ],
    updatedAt,
  )
  snapshot.manifest.metadata.updatedAt = updatedAt
  snapshot.manifest.state.revision += 1
  await commitCompanionSnapshot(expectedRevision, snapshot)
  return {
    status: 'activated',
    candidateId,
    eventId,
    revision: snapshot.manifest.state.revision,
    state,
    layers: resolveCharacterLayers(pack, state),
  }
}

async function commitCharacterState(
  kind:
    | 'character_outfit_changed'
    | 'character_expression_changed'
    | 'character_item_equipped'
    | 'character_item_unequipped',
  change: (pack: CharacterPack, state: CharacterState) => CharacterState,
  fields: (state: CharacterState) => string[],
) {
  const workspace = await inspectCharacterWorkspace()
  const manifest = workspace.snapshot.manifest
  if (!manifest || !workspace.pack.identity) throw new Error('角色尚未啟用')
  const nextState = change(workspace.pack, workspace.state)
  const layers = resolveCharacterLayers(workspace.pack, nextState)
  const updatedAt = new Date().toISOString()
  const expectedRevision = manifest.state.revision
  const snapshot = workspace.snapshot as CompanionSnapshot & { manifest: CompanionManifest }
  putCharacterDocument(snapshot, CHARACTER_PATHS.state, nextState, updatedAt)
  const eventId = await appendCharacterEvent(
    snapshot,
    kind,
    'agent',
    fields(nextState),
    updatedAt,
  )
  snapshot.manifest.metadata.updatedAt = updatedAt
  snapshot.manifest.state.revision += 1
  await commitCompanionSnapshot(expectedRevision, snapshot)
  return {
    status: 'ok',
    revision: snapshot.manifest.state.revision,
    eventId,
    state: nextState,
    layers,
  }
}

export function setStoredCharacterOutfit(outfitId: string) {
  return commitCharacterState(
    'character_outfit_changed',
    (pack, state) => setCharacterOutfit(pack, state, outfitId),
    (state) => [
      `outfit: ${state.activeOutfit}`,
      `resolved-expression: ${state.activeExpression}`,
    ],
  )
}

export function setStoredCharacterExpression(expressionId: string) {
  return commitCharacterState(
    'character_expression_changed',
    (pack, state) => setCharacterExpression(pack, state, expressionId),
    (state) => [`outfit: ${state.activeOutfit}`, `expression: ${state.activeExpression}`],
  )
}

export function equipStoredCharacterItem(itemId: string) {
  return commitCharacterState(
    'character_item_equipped',
    (pack, state) => equipCharacterItem(pack, state, itemId),
    (state) => [`item: ${itemId}`, `equipped: ${state.equippedItemIds.join(',')}`],
  )
}

export function unequipStoredCharacterItem(itemId: string) {
  return commitCharacterState(
    'character_item_unequipped',
    (pack, state) => unequipCharacterItem(pack, state, itemId),
    (state) => [`item: ${itemId}`, `equipped: ${state.equippedItemIds.join(',')}`],
  )
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSafePath(path: string) {
  return (
    path.length > 0 &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    path
      .split('/')
      .every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  )
}

function isManifestFile(value: unknown): value is ManifestFile {
  return (
    isObject(value) &&
    typeof value.path === 'string' &&
    isSafePath(value.path) &&
    typeof value.type === 'string' &&
    typeof value.size === 'number'
  )
}

function isManifestJournal(value: unknown): value is ManifestJournal {
  if (!isManifestFile(value)) return false
  const journal = value as ManifestFile & {
    date?: unknown
    eventIds?: unknown
  }
  return (
    typeof journal.date === 'string' &&
    Array.isArray(journal.eventIds) &&
    journal.eventIds.every((eventId) => typeof eventId === 'string')
  )
}

function isManifest(value: unknown): value is CompanionManifest {
  if (!isObject(value) || !isObject(value.metadata) || !isObject(value.state)) {
    return false
  }
  return (
    value.apiVersion === 'companion.local/v1alpha1' &&
    value.kind === 'CompanionManifest' &&
    typeof value.metadata.id === 'string' &&
    typeof value.metadata.name === 'string' &&
    typeof value.metadata.createdAt === 'string' &&
    typeof value.metadata.updatedAt === 'string' &&
    typeof value.state.revision === 'number' &&
    typeof value.state.lastEventId === 'string' &&
    typeof value.state.points === 'number' &&
    Array.isArray(value.files) &&
    value.files.every(isManifestFile) &&
    Array.isArray(value.journals) &&
    value.journals.every(isManifestJournal) &&
    (value.documents === undefined ||
      (Array.isArray(value.documents) && value.documents.every(isManifestFile)))
  )
}

function parseManifest(text: string) {
  const value: unknown = JSON.parse(text)
  if (!isManifest(value)) throw new Error('ZIP 內的 manifest.json 無效')
  return value
}

function assertManifestMatches(snapshot: CompanionSnapshot) {
  const manifest = snapshot.manifest
  if (!manifest) throw new Error('bundle 缺少 manifest')

  const files = new Map(snapshot.files.map((file) => [file.path, file]))
  const journals = new Map(snapshot.journals.map((journal) => [journal.path, journal]))
  const documents = new Map(
    snapshot.documents.map((document) => [document.path, document]),
  )
  if (
    files.size !== snapshot.files.length ||
    journals.size !== snapshot.journals.length ||
    documents.size !== snapshot.documents.length
  ) {
    throw new Error('bundle 含有重複 path')
  }

  for (const entry of manifest.files) {
    const file = files.get(entry.path)
    if (!file || file.blob.type !== entry.type || file.blob.size !== entry.size) {
      throw new Error(`manifest file 不符：${entry.path}`)
    }
  }
  for (const entry of manifest.journals) {
    const journal = journals.get(entry.path)
    if (!journal || journal.blob.type !== entry.type || journal.blob.size !== entry.size) {
      throw new Error(`manifest journal 不符：${entry.path}`)
    }
  }
  for (const entry of manifest.documents ?? []) {
    const document = documents.get(entry.path)
    const bytes = document
      ? strToU8(JSON.stringify(document.value, null, 2)).length
      : -1
    if (!document || entry.type !== 'application/json' || bytes !== entry.size) {
      throw new Error(`manifest document 不符：${entry.path}`)
    }
  }
  if (
    files.size !== manifest.files.length ||
    journals.size !== manifest.journals.length ||
    documents.size !== (manifest.documents?.length ?? 0)
  ) {
    throw new Error('bundle 含有 manifest 未索引的 entry')
  }
}

function requireObject(value: unknown, label: string) {
  if (!isObject(value)) throw new Error(`${label} 格式無效`)
  return value
}

function isCharacterReference(value: unknown) {
  return (
    isObject(value) &&
    (('item' in value && typeof value.item === 'string') ||
      ('part' in value &&
        ['headwear', 'hand', 'back', 'aura'].includes(String(value.part))))
  )
}

async function assertCharacterSnapshot(snapshot: CompanionSnapshot) {
  if (snapshot.documents.length === 0) return
  const allowedKinds = new Set([
    'CharacterPack',
    'CharacterState',
    'AssetJob',
    'AssetCandidate',
  ])
  for (const document of snapshot.documents) {
    const value = requireObject(document.value, document.path)
    if (typeof value.kind !== 'string' || !allowedKinds.has(value.kind)) {
      throw new Error(`不支援的角色文件：${document.path}`)
    }
  }
  const packs = snapshot.documents.filter(
    ({ value }) => isObject(value) && value.kind === 'CharacterPack',
  )
  const states = snapshot.documents.filter(
    ({ value }) => isObject(value) && value.kind === 'CharacterState',
  )
  if (packs.length !== 1 || states.length !== 1) {
    throw new Error('角色 companion 必須各有一份 CharacterPack 與 CharacterState')
  }
  const packValue = requireObject(packs[0].value, 'CharacterPack')
  const contract = requireObject(packValue.contract, 'CharacterPack.contract')
  const outfits = requireObject(packValue.outfits, 'CharacterPack.outfits')
  const parts = requireObject(packValue.parts, 'CharacterPack.parts')
  const items = requireObject(packValue.items, 'CharacterPack.items')
  if (
    packValue.apiVersion !== 'companion.local/v1alpha1' ||
    packValue.kind !== 'CharacterPack' ||
    packValue.id !== 'momo-v1' ||
    packValue.version !== 1 ||
    !isObject(contract.canvas) ||
    contract.canvas.width !== 512 ||
    contract.canvas.height !== 768 ||
    contract.pose !== 'fullbody-front-v1' ||
    !Number.isInteger(contract.footBaseline) ||
    contract.centerX !== 256 ||
    !Array.isArray(contract.silhouetteBounds) ||
    contract.silhouetteBounds.length !== 4 ||
    !contract.silhouetteBounds.every(Number.isFinite) ||
    !Array.isArray(contract.preserve) ||
    !contract.preserve.every((value) => typeof value === 'string') ||
    JSON.stringify(contract.renderOrder) !==
      JSON.stringify([
        'background',
        'item-back',
        'character-skin',
        'item-front',
        'aura',
        'foreground',
      ])
  ) {
    throw new Error('CharacterPack contract 無效')
  }
  if (
    packValue.identity !== null &&
    (!isObject(packValue.identity) ||
      typeof packValue.identity.canonicalAsset !== 'string' ||
      !isSafePath(packValue.identity.canonicalAsset) ||
      typeof packValue.identity.canonicalSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(packValue.identity.canonicalSha256))
  ) {
    throw new Error('CharacterPack identity 無效')
  }
  for (const [outfitId, rawOutfit] of Object.entries(outfits)) {
    const outfit = requireObject(rawOutfit, `outfit ${outfitId}`)
    const variants = requireObject(outfit.variants, `outfit ${outfitId}.variants`)
    if (
      !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(outfitId) ||
      typeof outfit.label !== 'string' ||
      outfit.fallbackExpression !== 'neutral' ||
      typeof variants.neutral !== 'string' ||
      Object.entries(variants).some(
        ([expressionId, path]) =>
          !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(expressionId) ||
          typeof path !== 'string' ||
          !isSafePath(path),
      )
    ) {
      throw new Error(`outfit 無效：${outfitId}`)
    }
  }
  const partIds: CharacterItem['part'][] = ['headwear', 'hand', 'back', 'aura']
  if (
    Object.keys(parts).some((partId) => !partIds.includes(partId as CharacterItem['part'])) ||
    partIds.some((partId) => {
      const part = parts[partId]
      return (
        !isObject(part) ||
        !Number.isInteger(part.maxEquipped) ||
        Number(part.maxEquipped) < 1 ||
        Number(part.maxEquipped) > 10 ||
        (part.fallbackItem !== undefined && typeof part.fallbackItem !== 'string')
      )
    })
  ) {
    throw new Error('CharacterPack parts 無效')
  }
  for (const [itemId, rawItem] of Object.entries(items)) {
    const item = requireObject(rawItem, `item ${itemId}`)
    if (
      item.id !== itemId ||
      !partIds.includes(item.part as CharacterItem['part']) ||
      !Array.isArray(item.layers) ||
      !Array.isArray(item.conflictsWith) ||
      !Array.isArray(item.requires) ||
      !Array.isArray(item.replaces) ||
      !item.conflictsWith.every(
        (reference) => isObject(reference) && typeof reference.item === 'string',
      ) ||
      !item.requires.every(isCharacterReference) ||
      !item.replaces.every(isCharacterReference) ||
      item.layers.some((rawLayer) => {
        if (!isObject(rawLayer)) return true
        return (
          typeof rawLayer.id !== 'string' ||
          typeof rawLayer.asset !== 'string' ||
          !isSafePath(rawLayer.asset) ||
          !['item-back', 'item-front', 'aura'].includes(String(rawLayer.placement)) ||
          !Number.isInteger(rawLayer.z) ||
          (rawLayer.placement === 'item-back' &&
            (Number(rawLayer.z) < 10 || Number(rawLayer.z) > 29)) ||
          (rawLayer.placement === 'item-front' &&
            (Number(rawLayer.z) < 31 || Number(rawLayer.z) > 49)) ||
          (rawLayer.placement === 'aura' &&
            (Number(rawLayer.z) < 50 || Number(rawLayer.z) > 59))
        )
      }) ||
      new Set(
        item.layers.flatMap((layer) =>
          isObject(layer) && typeof layer.id === 'string' ? [layer.id] : [],
        ),
      ).size !== item.layers.length
    ) {
      throw new Error(`item 無效：${itemId}`)
    }
  }
  for (const [partId, rawPart] of Object.entries(parts)) {
    const part = requireObject(rawPart, `part ${partId}`)
    const fallback =
      typeof part.fallbackItem === 'string' ? items[part.fallbackItem] : undefined
    if (
      typeof part.fallbackItem === 'string' &&
      (!isObject(fallback) || fallback.part !== partId)
    ) {
      throw new Error(`part fallback 無效：${partId}`)
    }
  }
  const pack = packValue as CharacterPack
  const stateValue = requireObject(states[0].value, 'CharacterState')
  if (
    stateValue.apiVersion !== 'companion.local/v1alpha1' ||
    stateValue.kind !== 'CharacterState' ||
    stateValue.packId !== pack.id ||
    !(stateValue.activeOutfit === null || typeof stateValue.activeOutfit === 'string') ||
    !(stateValue.activeExpression === null || typeof stateValue.activeExpression === 'string') ||
    !Array.isArray(stateValue.equippedItemIds) ||
    !stateValue.equippedItemIds.every((id) => typeof id === 'string') ||
    new Set(stateValue.equippedItemIds).size !== stateValue.equippedItemIds.length ||
    stateValue.equippedItemIds.some((id) => typeof id !== 'string' || !items[id]) ||
    !Number.isInteger(stateValue.revision) ||
    Number(stateValue.revision) < 1
  ) {
    throw new Error('CharacterState 無效')
  }
  const state = stateValue as unknown as CharacterState
  if ((state.activeOutfit === null) !== (pack.identity === null)) {
    throw new Error('CharacterState 與 identity 啟用狀態不一致')
  }
  if (state.activeOutfit !== null) resolveCharacterLayers(pack, state)

  const files = new Map(snapshot.files.map((file) => [file.path, file]))
  const activePaths = new Set<string>()
  if (pack.identity) activePaths.add(pack.identity.canonicalAsset)
  for (const outfit of Object.values(pack.outfits)) {
    for (const path of Object.values(outfit.variants)) activePaths.add(path)
  }
  for (const item of Object.values(pack.items)) {
    for (const layer of item.layers) activePaths.add(layer.asset)
  }
  for (const path of activePaths) {
    const file = files.get(path)
    if (!file || !['image/png', 'image/webp'].includes(file.blob.type)) {
      throw new Error(`active character asset 不存在或格式錯誤：${path}`)
    }
    const inspection = await inspectCharacterImage(file.blob)
    if (inspection.width !== 512 || inspection.height !== 768) {
      throw new Error(`active character asset 尺寸錯誤：${path}`)
    }
    if (path === pack.identity?.canonicalAsset && inspection.sha256 !== pack.identity.canonicalSha256) {
      throw new Error('canonical asset hash 不符')
    }
  }

  const jobs = snapshot.documents.flatMap(({ value }) =>
    isObject(value) && value.kind === 'AssetJob' ? [value] : [],
  )
  const candidates = snapshot.documents.flatMap(({ value }) =>
    isObject(value) && value.kind === 'AssetCandidate' ? [value] : [],
  )
  const jobIds = new Set<string>()
  for (const job of jobs) {
    if (
      job.apiVersion !== 'companion.local/v1alpha1' ||
      typeof job.id !== 'string' ||
      !/^job_[a-z0-9_]{1,80}$/.test(job.id) ||
      jobIds.has(job.id) ||
      job.packId !== pack.id ||
      !['canonical-character', 'expression-variant', 'outfit-skin', 'wearable-prop'].includes(String(job.workflow)) ||
      !['proposed', 'exported', 'imported', 'validating', 'valid', 'invalid', 'reviewing', 'approved', 'rejected', 'activated'].includes(String(job.status)) ||
      !isObject(job.constraints) ||
      JSON.stringify(job.constraints.canvas) !== '[512,768]' ||
      !Array.isArray(job.constraints.outputLayers) ||
      job.constraints.outputLayers.length < 1 ||
      job.constraints.outputLayers.length > 2 ||
      new Set(job.constraints.outputLayers).size !== job.constraints.outputLayers.length ||
      !job.constraints.outputLayers.every((layer) =>
        ['skin', 'back', 'front', 'aura'].includes(String(layer)),
      ) ||
      typeof job.prompt !== 'string' ||
      ![1, 2, 3, 4].includes(Number(job.candidateCount)) ||
      !(
        job.sourceCanonicalSha256 === null ||
        (typeof job.sourceCanonicalSha256 === 'string' &&
          /^[0-9a-f]{64}$/.test(job.sourceCanonicalSha256))
      )
    ) {
      throw new Error('AssetJob 無效')
    }
    jobIds.add(job.id)
  }
  const candidateIds = new Set<string>()
  for (const candidate of candidates) {
    if (
      candidate.apiVersion !== 'companion.local/v1alpha1' ||
      typeof candidate.id !== 'string' ||
      !/^cand_[a-z0-9_]{1,80}$/.test(candidate.id) ||
      candidateIds.has(candidate.id) ||
      typeof candidate.jobId !== 'string' ||
      !jobIds.has(candidate.jobId) ||
      !['valid', 'invalid', 'approved', 'rejected', 'activated'].includes(String(candidate.status)) ||
      !Array.isArray(candidate.assets) ||
      candidate.assets.length < 1 ||
      candidate.assets.length > 2 ||
      !isObject(candidate.validation) ||
      !['passed', 'failed'].includes(String(candidate.validation.dimensions)) ||
      !['passed', 'failed'].includes(String(candidate.validation.alpha)) ||
      !['passed', 'failed', 'not-applicable'].includes(
        String(candidate.validation.alignment),
      ) ||
      !Array.isArray(candidate.validation.silhouetteBounds) ||
      candidate.validation.silhouetteBounds.length !== 4 ||
      !candidate.validation.silhouetteBounds.every(Number.isFinite) ||
      !Array.isArray(candidate.validation.reasons) ||
      !candidate.validation.reasons.every((reason) => typeof reason === 'string')
    ) {
      throw new Error('AssetCandidate 無效')
    }
    candidateIds.add(candidate.id)
    for (const rawAsset of candidate.assets) {
      const asset = requireObject(rawAsset, `candidate ${candidate.id} asset`)
      const file = typeof asset.path === 'string' ? files.get(asset.path) : undefined
      if (
        typeof asset.layerId !== 'string' ||
        !['skin', 'back', 'front', 'aura'].includes(asset.layerId) ||
        typeof asset.path !== 'string' ||
        !isSafePath(asset.path) ||
        typeof asset.type !== 'string' ||
        typeof asset.size !== 'number' ||
        typeof asset.sha256 !== 'string' ||
        !/^[0-9a-f]{64}$/.test(asset.sha256) ||
        !file ||
        file.blob.type !== asset.type ||
        file.blob.size !== asset.size
      ) {
        throw new Error(`candidate asset 無效：${candidate.id}`)
      }
      const inspection = await inspectCharacterImage(file.blob)
      if (inspection.sha256 !== asset.sha256) {
        throw new Error(`candidate asset hash 不符：${asset.path}`)
      }
    }
  }
}

export async function createBundle(snapshot: CompanionSnapshot) {
  assertManifestMatches(snapshot)

  // ponytail: ZIP export loads the whole companion in memory; switch to a
  // streaming archive when real companion sizes make this measurable.
  const entries: Record<string, Uint8Array> = {
    [MANIFEST_FILE]: strToU8(JSON.stringify(snapshot.manifest, null, 2)),
  }
  for (const file of [...snapshot.files].sort((a, b) =>
    a.path.localeCompare(b.path),
  )) {
    entries[file.path] = new Uint8Array(await file.blob.arrayBuffer())
  }
  for (const journal of [...snapshot.journals].sort((a, b) =>
    a.path.localeCompare(b.path),
  )) {
    entries[journal.path] = new Uint8Array(await journal.blob.arrayBuffer())
  }
  for (const document of [...snapshot.documents].sort((a, b) =>
    a.path.localeCompare(b.path),
  )) {
    entries[document.path] = strToU8(JSON.stringify(document.value, null, 2))
  }
  return new Blob(
    [
      zipSync(entries, {
        level: 6,
        mtime: new Date('1980-01-01T00:00:00Z'),
      }),
    ],
    { type: 'application/zip' },
  )
}

export async function importBundle(blob: Blob) {
  let unzippedBytes = 0
  const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()), {
    filter(entry) {
      if (entry.name.endsWith('/')) return false
      if (!isSafePath(entry.name)) throw new Error(`ZIP 含有不安全路徑：${entry.name}`)
      unzippedBytes += entry.originalSize
      if (unzippedBytes > MAX_UNZIPPED_BYTES) {
        throw new Error('ZIP 解壓後超過 100 MB 測試上限')
      }
      return true
    },
  })
  const manifestBytes = entries[MANIFEST_FILE]
  if (!manifestBytes) throw new Error('ZIP 缺少 manifest.json')
  const manifest = parseManifest(strFromU8(manifestBytes))
  const expectedPaths = new Set([
    MANIFEST_FILE,
    ...manifest.files.map((entry) => entry.path),
    ...manifest.journals.map((entry) => entry.path),
    ...(manifest.documents ?? []).map((entry) => entry.path),
  ])
  const actualPaths = Object.keys(entries)
  if (
    actualPaths.length !== expectedPaths.size ||
    actualPaths.some((path) => !expectedPaths.has(path))
  ) {
    throw new Error('ZIP entry 與 manifest 索引不一致')
  }

  const snapshot: CompanionSnapshot = {
    manifest,
    files: manifest.files.map((entry) => ({
      path: entry.path,
      blob: new Blob([entries[entry.path]], { type: entry.type }),
      updatedAt: manifest.metadata.updatedAt,
    })),
    journals: manifest.journals.map((entry) => ({
      path: entry.path,
      blob: new Blob([entries[entry.path]], { type: entry.type }),
      updatedAt: manifest.metadata.updatedAt,
    })),
    documents: (manifest.documents ?? []).map((entry) => ({
      path: entry.path,
      value: JSON.parse(strFromU8(entries[entry.path])) as unknown,
      updatedAt: manifest.metadata.updatedAt,
    })),
  }
  assertManifestMatches(snapshot)
  await assertCharacterSnapshot(snapshot)
  await replaceCompanion(snapshot)
  return readCompanion()
}

export function createSampleCompanion(): CompanionSnapshot & { manifest: CompanionManifest } {
  const updatedAt = new Date().toISOString()
  const date = updatedAt.slice(0, 10)
  const filePath = 'attachments/evt_test_01.bin'
  const journalPath = `journal/${date}.md`
  const fileBlob = new Blob([new Uint8Array([0, 1, 2, 3, 254, 255])], {
    type: 'application/octet-stream',
  })
  const journalBlob = new Blob(
    [
      `---\njournal: ${date}\ntimezone: Asia/Taipei\nrevision: 1\n---\n\n`,
      `# ${date}\n\n## evt_test_01 · check_in_submitted\n\n`,
      `- at: ${updatedAt}\n- actor: user\n- goal: daily-walk\n`,
      `- evidence: [attachment](../${filePath})\n\n散步 22 分鐘。\n`,
    ],
    { type: 'text/markdown' },
  )

  const manifest: CompanionManifest = {
    apiVersion: 'companion.local/v1alpha1',
    kind: 'CompanionManifest',
    metadata: {
      id: 'momo-test',
      name: 'Momo Test Companion',
      createdAt: updatedAt,
      updatedAt,
    },
    state: {
      revision: 1,
      lastEventId: 'evt_test_01',
      points: 20,
    },
    files: [{ path: filePath, type: fileBlob.type, size: fileBlob.size }],
    journals: [
      {
        path: journalPath,
        type: journalBlob.type,
        size: journalBlob.size,
        date,
        eventIds: ['evt_test_01'],
      },
    ],
    documents: [],
  }

  return {
    manifest,
    files: [{ path: filePath, blob: fileBlob, updatedAt }],
    journals: [{ path: journalPath, blob: journalBlob, updatedAt }],
    documents: [],
  } satisfies CompanionSnapshot
}

async function createStructuralCandidateBundle(
  job: AssetJob,
  candidateId: string,
  canonicalBlob: Blob,
) {
  const sha256 = (await inspectCharacterImage(canonicalBlob)).sha256
  const assets = job.constraints.outputLayers.map((layerId) => ({
    layerId,
    path: `assets/${layerId}.png`,
    sha256,
  }))
  const entries: Record<string, Uint8Array> = {
    'candidate.json': strToU8(
      JSON.stringify(
        {
          apiVersion: 'companion.local/v1alpha1',
          kind: 'AssetCandidateImport',
          candidateId,
          jobId: job.id,
          sourceCanonicalSha256: job.sourceCanonicalSha256,
          assets,
        },
        null,
        2,
      ),
    ),
  }
  const bytes = new Uint8Array(await canonicalBlob.arrayBuffer())
  for (const { path } of assets) entries[path] = bytes
  return new Blob([zipSync(entries, { level: 6 })], { type: 'application/zip' })
}

async function runStoredCharacterLifecycleSelfCheck(
  seedSnapshot: CompanionSnapshot,
  canonicalBlob: Blob,
) {
  try {
    await reviewCharacterCandidate('cand_momo_canonical_01', 'approved')
    await activateCharacterCandidate('cand_momo_canonical_01')
    const active = await inspectCharacterWorkspace()
    if (
      !active.pack.identity ||
      active.state.activeOutfit !== 'default' ||
      active.state.activeExpression !== 'neutral'
    ) {
      throw new Error('canonical activation self-check 失敗')
    }

    const fixtures: Array<{
      proposal: AssetJobProposal
      candidateIds: string[]
    }> = [
      {
        proposal: {
          workflow: 'expression-variant',
          prompt: 'Structural fixture: happy expression from canonical',
          target: { outfitId: 'default', expressionId: 'happy' },
          candidateCount: 2,
        },
        candidateIds: ['cand_fixture_happy_01', 'cand_fixture_happy_02'],
      },
      {
        proposal: {
          workflow: 'outfit-skin',
          prompt: 'Structural fixture: raincoat outfit from canonical',
          target: { outfitId: 'raincoat' },
          candidateCount: 2,
        },
        candidateIds: ['cand_fixture_raincoat_01', 'cand_fixture_raincoat_02'],
      },
      {
        proposal: {
          workflow: 'wearable-prop',
          prompt: 'Structural fixture: explorer hat back and front layers',
          target: { itemId: 'explorer-hat', part: 'headwear' },
          candidateCount: 2,
        },
        candidateIds: [
          'cand_fixture_explorer_hat_01',
          'cand_fixture_explorer_hat_02',
        ],
      },
    ]
    for (const fixture of fixtures) {
      const { job } = await proposeCharacterAssetJob(fixture.proposal)
      const exported = await exportCharacterAssetJob(job.id)
      if (exported.blob.size === 0) throw new Error('asset job export self-check 失敗')
      if (fixture === fixtures[0]) {
        const unexpected = unzipSync(
          new Uint8Array(
            await (
              await createStructuralCandidateBundle(
                job,
                fixture.candidateIds[0],
                canonicalBlob,
              )
            ).arrayBuffer(),
          ),
        )
        const candidateJson = JSON.parse(strFromU8(unexpected['candidate.json']))
        unexpected['candidate.json'] = strToU8(
          JSON.stringify({ ...candidateJson, source: { mode: 'unknown' } }),
        )
        let unexpectedFieldRejected = false
        try {
          await importCharacterCandidateBundle(
            new Blob([zipSync(unexpected)], { type: 'application/zip' }),
            job.id,
          )
        } catch {
          unexpectedFieldRejected = true
        }
        if (!unexpectedFieldRejected) throw new Error('candidate 額外欄位未被拒絕')
      }
      for (const candidateId of fixture.candidateIds) {
        const imported = await importCharacterCandidateBundle(
          await createStructuralCandidateBundle(job, candidateId, canonicalBlob),
          job.id,
        )
        if (imported.status !== 'valid') {
          throw new Error(`candidate import self-check 失敗：${candidateId}`)
        }
      }
      await reviewCharacterCandidate(fixture.candidateIds[0], 'rejected')
      const afterFirstRejection = await inspectCharacterWorkspace()
      const persistedJob = afterFirstRejection.jobs.find(({ id }) => id === job.id)
      if (persistedJob?.status !== 'valid') {
        throw new Error('rejecting one of multiple candidates closed the job')
      }
      await reviewCharacterCandidate(fixture.candidateIds[1], 'approved')
      await activateCharacterCandidate(fixture.candidateIds[1])
    }
    await setStoredCharacterExpression('happy')
    const raincoat = await setStoredCharacterOutfit('raincoat')
    if (raincoat.state.activeExpression !== 'neutral') {
      throw new Error('outfit neutral fallback self-check 失敗')
    }
    const beforeMissingExpression = await inspectCharacterWorkspace()
    let missingExpressionRejected = false
    try {
      await setStoredCharacterExpression('happy')
    } catch {
      missingExpressionRejected = true
    }
    const afterMissingExpression = await inspectCharacterWorkspace()
    if (
      !missingExpressionRejected ||
      afterMissingExpression.state.revision !== beforeMissingExpression.state.revision
    ) {
      throw new Error('missing expression atomic rejection self-check 失敗')
    }
    await setStoredCharacterOutfit('default')
    await setStoredCharacterExpression('happy')
    const equipped = await equipStoredCharacterItem('explorer-hat')
    if (
      equipped.layers.map(({ placement }) => placement).join() !==
      'item-back,character-skin,item-front'
    ) {
      throw new Error('multi-layer render order self-check 失敗')
    }

    const beforeReload = await inspectCharacterWorkspace()
    const bundle = await createBundle(beforeReload.snapshot)
    const expected = new Uint8Array(await bundle.arrayBuffer())
    const imported = await importBundle(bundle)
    const actual = new Uint8Array(
      await (await createBundle(imported)).arrayBuffer(),
    )
    const afterReload = await inspectCharacterWorkspace()
    if (
      actual.length !== expected.length ||
      actual.some((byte, index) => byte !== expected[index]) ||
      JSON.stringify(afterReload.state) !== JSON.stringify(beforeReload.state) ||
      afterReload.layers.map(({ id }) => id).join() !==
        beforeReload.layers.map(({ id }) => id).join()
    ) {
      throw new Error('character lifecycle reload/ZIP self-check 失敗')
    }
    return {
      outfit: afterReload.state.activeOutfit,
      expression: afterReload.state.activeExpression,
      equipped: afterReload.state.equippedItemIds,
      layers: afterReload.layers.map(({ id }) => id),
    }
  } finally {
    await replaceCompanion(seedSnapshot)
  }
}

export async function runRoundTripTest() {
  const liveCompanion = await readCompanion()
  const hadLiveCompanion = Boolean(liveCompanion.manifest)
  try {
    runCharacterRuleSelfCheck()
    const sample = createSampleCompanion()
  const candidateResponse = await fetch(
    '/assets/character/candidates/momo-canonical-01.png',
  )
  if (!candidateResponse.ok) throw new Error('無法載入 Momo canonical candidate')
  const candidateBlob = await candidateResponse.blob()
  const workspace = await createSeedCharacterWorkspace(candidateBlob)
  const seedCandidate = workspace.documents.find(
    ({ value }) => value.kind === 'AssetCandidate',
  )?.value as AssetCandidate | undefined
  if (!seedCandidate || seedCandidate.status !== 'valid') {
    throw new Error(
      `seed canonical validation 失敗：${seedCandidate?.validation.reasons.join(', ') ?? 'missing'}`,
    )
  }
  const updatedAt = sample.manifest.metadata.updatedAt
  sample.files.push({
    path: workspace.assetPath,
    blob: candidateBlob,
    updatedAt,
  })
  sample.manifest.files.push({
    path: workspace.assetPath,
    type: candidateBlob.type,
    size: candidateBlob.size,
  })
  sample.documents.push(
    ...workspace.documents.map((document) => ({ ...document, updatedAt })),
  )
  sample.manifest.documents = workspace.documents.map((document) => ({
    path: document.path,
    type: 'application/json',
    size: strToU8(JSON.stringify(document.value, null, 2)).length,
  }))
  await replaceCompanion(sample)
  const exported = await createBundle(sample)
  const expected = new Uint8Array(await exported.arrayBuffer())
  await replaceCompanion({ files: [], journals: [], documents: [] })
  const restored = await importBundle(exported)
  const actual = new Uint8Array(await (await createBundle(restored)).arrayBuffer())
  if (
    actual.length !== expected.length ||
    actual.some((byte, index) => byte !== expected[index])
  ) {
    throw new Error('匯出 → 清空 → 匯入後內容不一致')
  }
  const tamperedEntries = unzipSync(expected)
  const state = JSON.parse(
    strFromU8(tamperedEntries[CHARACTER_PATHS.state]),
  ) as CharacterState
  const tamperedState = strToU8(
    JSON.stringify({ ...state, activeOutfit: 'missing' }, null, 2),
  )
  tamperedEntries[CHARACTER_PATHS.state] = tamperedState
  const tamperedManifest = parseManifest(strFromU8(tamperedEntries[MANIFEST_FILE]))
  tamperedManifest.documents = (tamperedManifest.documents ?? []).map((document) =>
    document.path === CHARACTER_PATHS.state
      ? { ...document, size: tamperedState.length }
      : document,
  )
  tamperedEntries[MANIFEST_FILE] = strToU8(
    JSON.stringify(tamperedManifest, null, 2),
  )
  let tamperedRejected = false
  try {
    await importBundle(
      new Blob(
        [
          zipSync(tamperedEntries, {
            level: 6,
            mtime: new Date('1980-01-01T00:00:00Z'),
          }),
        ],
        { type: 'application/zip' },
      ),
    )
  } catch {
    tamperedRejected = true
  }
  if (!tamperedRejected) throw new Error('竄改的 CharacterState 未被拒絕')
  const afterRejectedImport = new Uint8Array(
    await (await createBundle(await readCompanion())).arrayBuffer(),
  )
  if (
    afterRejectedImport.length !== expected.length ||
    afterRejectedImport.some((byte, index) => byte !== expected[index])
  ) {
    throw new Error('拒絕無效 ZIP 後 live companion 被改動')
  }
    const lifecycle = await runStoredCharacterLifecycleSelfCheck(restored, candidateBlob)
    return { restored, bundleBytes: exported.size, tamperedRejected, lifecycle }
  } finally {
    if (hadLiveCompanion) await replaceCompanion(liveCompanion)
  }
}
