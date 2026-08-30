import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/ui/components/ui/button'

export function DataControls({
  exportData,
  importData,
}: {
  exportData?(): Promise<Blob>
  importData(blob: Blob): Promise<unknown>
}) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const run = async (task: () => Promise<void>) => {
    setStatus('busy')
    try { await task(); setStatus('done') } catch { setStatus('error') }
  }

  return (
    <div className="grid gap-2 py-1">
      {exportData && <Button variant="ghost" className="justify-start" disabled={status === 'busy'} onClick={() => void run(async () => {
        const url = URL.createObjectURL(await exportData())
        const link = document.createElement('a')
        link.href = url
        link.download = 'companion.zip'
        document.body.append(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1_000)
      })}>{t('data.export')}</Button>}
      <Button asChild variant="ghost" className="justify-start">
        <label>
          {t('data.import')}
          <input className="sr-only" type="file" accept=".zip,application/zip" disabled={status === 'busy'} onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void run(() => importData(file).then(() => undefined))
          }} />
        </label>
      </Button>
      {status !== 'idle' && <p role="status" className="px-4 text-xs text-muted-foreground">{t(`data.${status}`)}</p>}
    </div>
  )
}
