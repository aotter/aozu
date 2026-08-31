import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

type AppHeaderProps = {
  webmcpAvailable: boolean
  title?: string
  back?: ReactNode
  actions?: ReactNode
}

export function AppHeader({ webmcpAvailable, title, back, actions }: AppHeaderProps) {
  const { t } = useTranslation()

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <nav
        aria-label={t('navigation.primary')}
        className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4"
      >
        <div className="flex min-w-0 items-center gap-1">
          {back}
          <span className="truncate font-heading text-lg font-semibold">
            {title ?? t('common.productName')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            aria-label={t(webmcpAvailable ? 'main.webmcpConnected' : 'main.webmcpUnavailable')}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className={`size-2 rounded-full ${webmcpAvailable ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`}
              aria-hidden="true"
            />
            WebMCP
          </span>
          {actions}
        </div>
      </nav>
    </header>
  )
}
