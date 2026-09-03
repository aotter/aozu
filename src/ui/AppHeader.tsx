import { ArrowLeftIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { AozuIcon } from '@/ui/AozuIcon'
import { Button } from '@/ui/components/ui/button'
import type { WebMcpState } from '@/adapters/webmcp/controller.ts'

type AppHeaderProps = {
  webmcp: WebMcpState
  title?: string
  onBack?: () => void
  actions?: ReactNode
}

export function AppHeader({ webmcp, title, onBack, actions }: AppHeaderProps) {
  const { t } = useTranslation()
  const label = t(`main.webmcp.${webmcp.status}`, { count: webmcp.toolCount })
  const color = webmcp.status === 'ready' ? 'bg-emerald-500' : webmcp.status === 'registering' ? 'bg-amber-500'
    : webmcp.status === 'failed' ? 'bg-red-500' : 'bg-muted-foreground/50'

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <nav
        aria-label={t('navigation.primary')}
        className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4"
      >
        <div className="flex min-w-0 items-center gap-1">
          {onBack && <Button type="button" size="icon" variant="ghost" onClick={onBack} aria-label={t('common.back')}><ArrowLeftIcon /></Button>}
          <AozuIcon name="book" />
          <span className="truncate font-heading text-lg font-semibold">
            {title ?? t('common.productName')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            aria-label={label}
            title={webmcp.error ?? label}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className={`size-2 rounded-full ${color}`}
              aria-hidden="true"
            />
            {webmcp.status === 'ready' ? t('main.webmcp.readyShort', { count: webmcp.toolCount }) : 'WebMCP'}
          </span>
          {actions}
        </div>
      </nav>
    </header>
  )
}
