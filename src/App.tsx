import { useEffect, useState } from 'react'
import './App.css'
import {
  createBundle,
  importBundle,
  readVault,
  runRoundTripTest,
  type VaultSnapshot,
} from './vault'

type ModelContext = {
  registerTool(
    tool: {
      name: string
      title?: string
      description: string
      inputSchema?: object
      annotations?: { readOnlyHint?: boolean }
      execute(input: object, options: { signal: AbortSignal }): Promise<unknown>
    },
    options?: { signal?: AbortSignal },
  ): Promise<void>
}

type WebMcpDocument = Document & { modelContext?: ModelContext }

const modelContext = (document as WebMcpDocument).modelContext

async function inspectStorage() {
  const snapshot = await readVault()
  return {
    indexedDb: Boolean(snapshot.manifest),
    manifest: snapshot.manifest
      ? {
          id: snapshot.manifest.metadata.id,
          revision: snapshot.manifest.state.revision,
          lastEventId: snapshot.manifest.state.lastEventId,
        }
      : null,
    files: snapshot.files.map((file) => ({
      path: file.path,
      type: file.blob.type,
      size: file.blob.size,
    })),
    journals: snapshot.journals.map((journal) => ({
      path: journal.path,
      type: journal.blob.type,
      size: journal.blob.size,
    })),
  }
}

function App() {
  const [toolState, setToolState] = useState<'registering' | 'ready' | 'failed'>(
    modelContext ? 'registering' : 'failed',
  )
  const [vault, setVault] = useState<VaultSnapshot>({ files: [], journals: [] })
  const [result, setResult] = useState('尚未執行')
  const [running, setRunning] = useState(false)
  const [agentCallAt, setAgentCallAt] = useState<string>()

  useEffect(() => {
    if (!modelContext) return

    const controller = new AbortController()
    modelContext
      .registerTool(
        {
          name: 'inspect_companion_spike',
          title: 'Inspect Companion Spike',
          description:
            'Read the hydrated manifest, Blob files, and Markdown journals stored in IndexedDB.',
          inputSchema: { type: 'object', properties: {} },
          annotations: { readOnlyHint: true },
          async execute() {
            const calledAt = new Date().toISOString()
            setAgentCallAt(calledAt)
            return {
              webMcpSurface: 'document.modelContext',
              ...(await inspectStorage()),
              agentCallAt: calledAt,
            }
          },
        },
        { signal: controller.signal },
      )
      .then(() => setToolState('ready'))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setToolState('failed')
        }
      })

    readVault()
      .then(setVault)
      .catch((error: unknown) => setResult(`IndexedDB 讀取失敗：${String(error)}`))

    return () => controller.abort()
  }, [])

  async function runTest() {
    setRunning(true)
    setResult('建立 Blob、manifest 與 Markdown journal…')
    try {
      const { restored, bundleBytes } = await runRoundTripTest()
      setVault(restored)
      setResult(`通過：匯出 ${bundleBytes} bytes，清空後匯入並完全一致`)
    } catch (error) {
      setResult(`失敗：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setRunning(false)
    }
  }

  async function exportCurrentVault() {
    setRunning(true)
    try {
      const bundle = await createBundle(await readVault())
      const url = URL.createObjectURL(bundle)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'companion-vault.zip'
      anchor.click()
      URL.revokeObjectURL(url)
      setResult(`已匯出 companion-vault.zip（${bundle.size} bytes）`)
    } catch (error) {
      setResult(`匯出失敗：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setRunning(false)
    }
  }

  async function importSelectedBundle(file: File) {
    setRunning(true)
    setResult('驗證並 hydrate bundle…')
    try {
      const restored = await importBundle(file)
      setVault(restored)
      setResult(`匯入通過：${file.name}`)
    } catch (error) {
      setResult(`匯入失敗：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setRunning(false)
    }
  }

  if (!modelContext) {
    return (
      <main>
        <h1>需要支援 WebMCP 的瀏覽器</h1>
        <p>
          找不到 <code>document.modelContext</code>。
        </p>
      </main>
    )
  }

  if (toolState !== 'ready') {
    return (
      <main>
        <h1>
          {toolState === 'registering' ? '偵測 WebMCP…' : 'WebMCP tool 註冊失敗'}
        </h1>
      </main>
    )
  }

  return (
    <main>
      <h1>IndexedDB Vault Bundle Spike</h1>
      <dl>
        <dt>WebMCP</dt>
        <dd>document.modelContext</dd>
        <dt>Agent probe</dt>
        <dd>{agentCallAt ?? '等待 agent 呼叫 inspect_companion_spike'}</dd>
        <dt>Manifest</dt>
        <dd>
          {vault.manifest
            ? `${vault.manifest.metadata.id} · revision ${vault.manifest.state.revision}`
            : 'none'}
        </dd>
        <dt>Blob files</dt>
        <dd>{vault.files.length}</dd>
        <dt>Markdown journals</dt>
        <dd>{vault.journals.length}</dd>
      </dl>
      <div className="actions">
        <button type="button" onClick={runTest} disabled={running}>
          {running ? '執行中…' : '建立並測試 round-trip'}
        </button>
        <button
          type="button"
          onClick={exportCurrentVault}
          disabled={running || !vault.manifest}
        >
          匯出 bundle
        </button>
        <label>
          匯入 bundle
          <input
            type="file"
            accept="application/zip,.zip"
            disabled={running}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) void importSelectedBundle(file)
            }}
          />
        </label>
      </div>
      <p aria-live="polite">{result}</p>
    </main>
  )
}

export default App
