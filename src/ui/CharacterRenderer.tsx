import { useEffect, useMemo } from 'react'

type Layer = { id: string; blob: Blob; slotOrder: number; layerOrder: number }

export function CharacterRenderer({ label, layers }: { label: string; layers: Layer[] }) {
  const sources = useMemo(() => layers.map((layer) => ({ ...layer, src: URL.createObjectURL(layer.blob) })), [layers])
  useEffect(() => () => sources.forEach(({ src }) => URL.revokeObjectURL(src)), [sources])

  return (
    <div className="relative aspect-2/3 w-full overflow-hidden rounded-3xl border bg-muted/40" role="img" aria-label={label}>
      {!sources.length && <div className="absolute inset-0 p-8"><CharacterSlotPlaceholder src="/assets/character-slots/body-base.png" /></div>}
      {sources.map(({ id, src, slotOrder, layerOrder }) => <img
        key={id}
        src={src}
        alt=""
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
  const src = useMemo(() => URL.createObjectURL(blob), [blob])
  useEffect(() => () => URL.revokeObjectURL(src), [src])
  return <img src={src} alt={label} className="size-full object-contain" />
}
