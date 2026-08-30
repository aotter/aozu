import { useEffect, useMemo } from 'react'

type Layer = { id: string; blob: Blob; slotOrder: number; layerOrder: number }

export function CharacterRenderer({ label, layers }: { label: string; layers: Layer[] }) {
  const sources = useMemo(() => layers.map((layer) => ({ ...layer, src: URL.createObjectURL(layer.blob) })), [layers])
  useEffect(() => () => sources.forEach(({ src }) => URL.revokeObjectURL(src)), [sources])

  return (
    <div className="relative aspect-2/3 w-full overflow-hidden rounded-3xl border bg-muted/40" role="img" aria-label={label}>
      {!sources.length && <svg aria-hidden="true" viewBox="0 0 512 768" className="absolute inset-0 size-full text-muted-foreground/20">
        <circle cx="256" cy="170" r="82" fill="currentColor" />
        <path d="M145 690c12-104 28-181 46-230-45-47-54-113-20-164 23-34 53-50 85-50s62 16 85 50c34 51 25 117-20 164 18 49 34 126 46 230H145Z" fill="currentColor" />
      </svg>}
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

export function CharacterAssetImage({ blob }: { blob: Blob }) {
  const src = useMemo(() => URL.createObjectURL(blob), [blob])
  useEffect(() => () => URL.revokeObjectURL(src), [src])
  return <img src={src} alt="" className="size-full object-contain" />
}
