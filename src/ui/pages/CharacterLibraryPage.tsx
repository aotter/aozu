import { CopyIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'

import type { CharacterDraft, ResolvedCharacterLayer } from '@/core/domain/character.ts'
import { AozuIcon } from '@/ui/AozuIcon'
import { CharacterRenderer } from '@/ui/CharacterRenderer'
import { DataControls } from '@/ui/DataControls'
import { Button } from '@/ui/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/ui/components/ui/alert-dialog'

// Fan geometry from the Design branch: 48px spread, 7px sag, 4.25° per step from the middle card.
const FAN_SPREAD = 48
export type CharacterLibraryItem = Pick<CharacterDraft, 'id' | 'name' | 'updatedAt'> & {
  /** The persisted Mantle entry version, projected together with `updatedAt` from one settled snapshot. */
  revision: number
  layers: Array<ResolvedCharacterLayer & { blob: Blob }>
}

export function CharacterLibraryPage({ characters, createCharacter, openCharacter, copyCharacter, deleteCharacter, exportCharacter, importCharacter, refresh }: {
  characters: CharacterLibraryItem[]
  createCharacter(): Promise<CharacterDraft>
  openCharacter(id: string): void
  copyCharacter(id: string): Promise<CharacterDraft>
  deleteCharacter(id: string): Promise<void>
  exportCharacter(id: string): Promise<Blob>
  importCharacter(blob: Blob): Promise<void>
  refresh(): Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const updatedAtFormat = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: 'medium', timeStyle: 'short' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [deleting, setDeleting] = useState<CharacterLibraryItem>()
  // Overlapping, scaled cards make :hover unreliable (the raised card covers its neighbour), so the active
  // card is whichever rest-position band the pointer's x falls in — the card-game way.
  const [active, setActive] = useState<number>()

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true); setError(undefined)
    try { await task() }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) }
    finally { setBusy(false) }
  }

  const fanned = characters.slice(0, 9)
  const overflow = characters.slice(9)
  const fanMiddle = (fanned.length - 1) / 2
  const pickActive = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return
    const { left, width } = event.currentTarget.getBoundingClientRect()
    const index = Math.round((event.clientX - left - width / 2) / FAN_SPREAD + fanMiddle)
    setActive(Math.max(0, Math.min(fanned.length - 1, index)))
  }
  const fanState = (index: number) => active === undefined ? undefined : index === active ? 'active' : index < active ? 'before' : 'after'
  const card = (character: CharacterLibraryItem, style?: CSSProperties, fan?: 'active' | 'before' | 'after') => <article key={character.id} role="listitem" className="companion-card" data-fan={fan} style={style}>
    <button type="button" className="companion-card-open" aria-label={`${t('characters.edit')} ${character.name}`} onClick={() => openCharacter(character.id)}>
      <span className="companion-card-portrait"><CharacterRenderer label={character.name} layers={character.layers} /></span>
      <span className="companion-card-name">{character.name}</span>
      <span className="companion-card-meta">
        {t('characters.revision', { revision: character.revision })} · {t('characters.updated', { updated: updatedAtFormat.format(character.updatedAt) })}
      </span>
    </button>
    <TooltipProvider><div className="companion-card-actions">
      <Tooltip><TooltipTrigger asChild><Button size="icon" variant="outline" disabled={busy} aria-label={`${t('characters.copy')} ${character.name}`} onClick={() => void run(() => copyCharacter(character.id).then(refresh))}><CopyIcon aria-hidden="true" /></Button></TooltipTrigger><TooltipContent>{t('characters.copy')}</TooltipContent></Tooltip>
      <DataControls exportData={() => exportCharacter(character.id)} exportFilename={`${character.name}-character.zip`} exportIconOnly exportLabel={t('draft.download')} />
      <Tooltip><TooltipTrigger asChild><Button size="icon" variant="destructive" disabled={busy} aria-label={`${t('characters.delete')} ${character.name}`} onClick={() => setDeleting(character)}><Trash2Icon aria-hidden="true" /></Button></TooltipTrigger><TooltipContent>{t('characters.delete')}</TooltipContent></Tooltip>
    </div></TooltipProvider>
  </article>

  return <main className="mx-auto min-h-[calc(100svh-3.5rem)] w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
    <section className="forge-hero" aria-labelledby="characters-title">
      <div>
        <p className="forge-kicker"><AozuIcon name="archive" /> {t('characters.kicker')}</p>
        <h1 id="characters-title" className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">{t('characters.title')}</h1>
        <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">{t('characters.description')}</p>
      </div>
      <AozuIcon name="book" className="forge-seal" />
    </section>

    <section className="companion-vault mt-10" aria-labelledby="saved-characters-title">
      <div className="vault-heading">
        <h2 id="saved-characters-title" className="font-heading text-2xl font-medium">{t('characters.saved')}</h2>
        <span className="vault-count">{t('characters.count', { count: characters.length })}</span>
      </div>
      {characters.length === 0
        ? <p className="mt-4 px-2 leading-6 text-muted-foreground">{t('characters.empty')}</p>
        : <div className="companion-fan-shell">
          <div className="companion-fan" role="list" aria-label={t('characters.saved')} onPointerMove={pickActive} onPointerLeave={() => setActive(undefined)}>
            {fanned.map((character, index) => {
              const offset = index - fanMiddle
              return card(character, { '--fan-i': index, '--fan-x': `${offset * FAN_SPREAD}px`, '--fan-y': `${Math.abs(offset) * 7}px`, '--fan-r': `${offset * 4.25}deg` } as CSSProperties, fanState(index))
            })}
          </div>
        </div>}
      {overflow.length > 0 && <details className="saved-overflow">
        <summary>{t('characters.more', { count: overflow.length })}</summary>
        <div className="companion-grid">{overflow.map((character) => card(character))}</div>
      </details>}
    </section>

    <div className="start-gates mt-8 grid gap-4 sm:grid-cols-2">
      <section className="start-gate rounded-2xl border bg-background p-5 shadow-sm">
        <div className="gate-icon"><AozuIcon name="book" /></div>
        <div className="min-w-0">
          <h2 className="font-heading text-xl font-medium">{t('characters.new')}</h2>
          <p className="mt-2 leading-6 text-muted-foreground">{t('characters.gates.create')}</p>
        </div>
        <Button className="gate-action" disabled={busy} onClick={() => void run(async () => openCharacter((await createCharacter()).id))}><PlusIcon aria-hidden="true" />{t('characters.new')}</Button>
      </section>
      <section className="start-gate rounded-2xl border bg-background p-5 shadow-sm">
        <div className="gate-icon"><AozuIcon name="import" /></div>
        <div className="min-w-0">
          <h2 className="font-heading text-xl font-medium">{t('data.import')}</h2>
          <p className="mt-2 leading-6 text-muted-foreground">{t('characters.gates.import')}</p>
        </div>
        <div className="gate-action"><DataControls prepareImport={async (blob) => { await importCharacter(blob); await refresh() }} /></div>
      </section>
    </div>

    <section className="parchment-notice mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5">
      <div className="min-w-0">
        <h2 className="font-heading text-xl font-medium">{t('characters.story.title')}</h2>
        <p className="mt-1 text-muted-foreground">{t('characters.story.description')}</p>
      </div>
      <Button disabled variant="secondary">{t('characters.story.comingSoon')}</Button>
    </section>
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}

    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !busy) setDeleting(undefined) }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{t('characters.deleteTitle')}</AlertDialogTitle><AlertDialogDescription>{deleting && t('characters.deleteDescription', { name: deleting.name })}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>{t('common.cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={(event) => {
          event.preventDefault()
          if (!deleting) return
          void run(() => deleteCharacter(deleting.id).then(refresh).then(() => setDeleting(undefined)))
        }}>{t('characters.delete')}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main>
}
