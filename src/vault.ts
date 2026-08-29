import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

const DB_NAME = 'companion-vault-spike'
const DB_VERSION = 2
const META_STORE = 'meta'
const FILE_STORE = 'files'
const JOURNAL_STORE = 'journals'
const MANIFEST_KEY = 'manifest'
const MANIFEST_FILE = 'manifest.json'
const MAX_UNZIPPED_BYTES = 100 * 1024 * 1024

type ManifestFile = {
  path: string
  type: string
  size: number
}

type ManifestJournal = ManifestFile & {
  date: string
  eventIds: string[]
}

export type VaultManifest = {
  apiVersion: 'companion.local/v1alpha1'
  kind: 'VaultManifest'
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
}

export type BlobRecord = {
  path: string
  blob: Blob
  updatedAt: string
}

export type VaultSnapshot = {
  manifest?: VaultManifest
  files: BlobRecord[]
  journals: BlobRecord[]
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

export async function readVault() {
  const db = await openDatabase()
  return new Promise<VaultSnapshot>((resolve, reject) => {
    const transaction = db.transaction(
      [META_STORE, FILE_STORE, JOURNAL_STORE],
      'readonly',
    )
    const manifestRequest = transaction
      .objectStore(META_STORE)
      .get(MANIFEST_KEY)
    const filesRequest = transaction.objectStore(FILE_STORE).getAll()
    const journalsRequest = transaction.objectStore(JOURNAL_STORE).getAll()

    transaction.oncomplete = () => {
      db.close()
      resolve({
        manifest: manifestRequest.result as VaultManifest | undefined,
        files: filesRequest.result as BlobRecord[],
        journals: journalsRequest.result as BlobRecord[],
      })
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

async function replaceVault(snapshot: VaultSnapshot) {
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

async function commitJournalEvent(
  expectedRevision: number,
  manifest: VaultManifest,
  journal: BlobRecord,
) {
  const db = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([META_STORE, JOURNAL_STORE], 'readwrite')
    const metaStore = transaction.objectStore(META_STORE)
    const currentRequest = metaStore.get(MANIFEST_KEY)
    let conflict: Error | undefined

    currentRequest.onsuccess = () => {
      const current = currentRequest.result as VaultManifest | undefined
      if (!current || current.state.revision !== expectedRevision) {
        conflict = new Error('Vault 已被其他操作更新，請重試')
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
  const snapshot = await readVault()
  const manifest = snapshot.manifest
  if (!manifest) throw new Error('請先建立或匯入 vault')

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
  const nextManifest: VaultManifest = {
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

function isManifest(value: unknown): value is VaultManifest {
  if (!isObject(value) || !isObject(value.metadata) || !isObject(value.state)) {
    return false
  }
  return (
    value.apiVersion === 'companion.local/v1alpha1' &&
    value.kind === 'VaultManifest' &&
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
    value.journals.every(isManifestJournal)
  )
}

function parseManifest(text: string) {
  const value: unknown = JSON.parse(text)
  if (!isManifest(value)) throw new Error('ZIP 內的 manifest.json 無效')
  return value
}

function assertManifestMatches(snapshot: VaultSnapshot) {
  const manifest = snapshot.manifest
  if (!manifest) throw new Error('bundle 缺少 manifest')

  const files = new Map(snapshot.files.map((file) => [file.path, file]))
  const journals = new Map(snapshot.journals.map((journal) => [journal.path, journal]))
  if (files.size !== snapshot.files.length || journals.size !== snapshot.journals.length) {
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
  if (files.size !== manifest.files.length || journals.size !== manifest.journals.length) {
    throw new Error('bundle 含有 manifest 未索引的 entry')
  }
}

export async function createBundle(snapshot: VaultSnapshot) {
  assertManifestMatches(snapshot)

  // ponytail: ZIP export loads the whole vault in memory; switch to a
  // streaming archive when real vault sizes make this measurable.
  const entries: Record<string, Uint8Array> = {
    [MANIFEST_FILE]: strToU8(JSON.stringify(snapshot.manifest, null, 2)),
  }
  for (const file of snapshot.files) {
    entries[file.path] = new Uint8Array(await file.blob.arrayBuffer())
  }
  for (const journal of snapshot.journals) {
    entries[journal.path] = new Uint8Array(await journal.blob.arrayBuffer())
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
  ])
  const actualPaths = Object.keys(entries)
  if (
    actualPaths.length !== expectedPaths.size ||
    actualPaths.some((path) => !expectedPaths.has(path))
  ) {
    throw new Error('ZIP entry 與 manifest 索引不一致')
  }

  const snapshot: VaultSnapshot = {
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
  }
  assertManifestMatches(snapshot)
  await replaceVault(snapshot)
  return readVault()
}

export function createSampleVault() {
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

  const manifest: VaultManifest = {
    apiVersion: 'companion.local/v1alpha1',
    kind: 'VaultManifest',
    metadata: {
      id: 'momo-test',
      name: 'Momo Test Vault',
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
  }

  return {
    manifest,
    files: [{ path: filePath, blob: fileBlob, updatedAt }],
    journals: [{ path: journalPath, blob: journalBlob, updatedAt }],
  } satisfies VaultSnapshot
}

export async function runRoundTripTest() {
  const sample = createSampleVault()
  await replaceVault(sample)
  const exported = await createBundle(sample)
  const expected = new Uint8Array(await exported.arrayBuffer())
  await replaceVault({ files: [], journals: [] })
  const restored = await importBundle(exported)
  const actual = new Uint8Array(await (await createBundle(restored)).arrayBuffer())
  if (
    actual.length !== expected.length ||
    actual.some((byte, index) => byte !== expected[index])
  ) {
    throw new Error('匯出 → 清空 → 匯入後內容不一致')
  }
  return { restored, bundleBytes: exported.size }
}
