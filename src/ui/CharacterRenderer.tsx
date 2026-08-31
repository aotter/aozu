import { BlobImage } from '@/ui/BlobImage'
import { cn } from '@/ui/lib/utils'

type Layer = { id: string; blob: Blob; slotOrder: number; layerOrder: number }

export function CharacterRenderer({ label, layers, className }: { label: string; layers: Layer[]; className?: string }) {
  return (
    <div className={cn('relative aspect-2/3 w-full overflow-hidden rounded-3xl border bg-muted/40', className)} role="img" aria-label={label}>
      {!layers.length && <div className="absolute inset-0 p-8"><CharacterSlotPlaceholder src="/assets/character-slots/body-base.png" /></div>}
      {layers.map(({ id, blob, slotOrder, layerOrder }) => <BlobImage
        key={id}
        blob={blob}
        className="absolute inset-0 size-full object-contain"
        style={{ zIndex: slotOrder * 100 + layerOrder }}
      />)}
    </div>
  )
}

export function CharacterSlotPlaceholder({ src, label }: { src: string; label?: string }) {
  return <div
    role={label ? 'img' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
    className="size-full bg-[#7b739e]/70"
    style={{
      WebkitMaskImage: `url("${src}")`,
      maskImage: `url("${src}")`,
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
    }}
  />
}

export function CharacterAssetImage({ blob, label = '' }: { blob: Blob; label?: string }) {
  return <BlobImage blob={blob} alt={label} className="size-full object-contain" />
}
