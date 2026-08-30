import { MenuIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/ui/components/ui/button'
import { DataControls } from './DataControls'
import { ScrollArea } from '@/ui/components/ui/scroll-area'
import { Separator } from '@/ui/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/ui/components/ui/sheet'

const menuItems = ['character', 'wardrobe', 'story', 'tasks', 'journal', 'data', 'settings'] as const

export function AppMenu({ exportData, prepareImport, onCreateCharacter }: { exportData(): Promise<Blob>; prepareImport(blob: Blob): Promise<void>; onCreateCharacter(): void }) {
  const { t } = useTranslation()

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('navigation.openMenu')}>
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" closeLabel={t('common.close')}>
        <SheetHeader>
          <SheetTitle>{t('common.productName')}</SheetTitle>
          <SheetDescription>{t('navigation.description')}</SheetDescription>
        </SheetHeader>
        <Separator />
        <ScrollArea className="min-h-0 flex-1 px-2">
          <nav aria-label={t('navigation.menu')} className="grid gap-1 py-2">
            {menuItems.map((item) => item === 'data' ? (
              <DataControls key={item} exportData={exportData} prepareImport={prepareImport} />
            ) : (
              <Button key={item} variant="ghost" className="justify-start" disabled={item !== 'character'} onClick={item === 'character' ? onCreateCharacter : undefined}>
                {t(`navigation.items.${item}`)}
              </Button>
            ))}
          </nav>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
