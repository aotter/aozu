import { useEffect, useState, type CSSProperties } from 'react'

type Layer = { id: string; blob: Blob; slotOrder: number; layerOrder: number }

export function CharacterRenderer({ label, layers }: { label: string; layers: Layer[] }) {
  return (
    <div className="relative aspect-2/3 w-full overflow-hidden rounded-3xl border bg-muted/40" role="img" aria-label={label}>
      {!layers.length && <div className="absolute inset-0 p-8"><CharacterSlotPlaceholder src="/assets/character-slots/body-base.png" /></div>}
      {layers.map(({ id, blob, slotOrder, layerOrder }) => <ObjectUrlImage
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
  return <ObjectUrlImage blob={blob} alt={label} className="size-full object-contain" />
}

function ObjectUrlImage({ blob, alt = '', className, style }: { blob: Blob; alt?: string; className: string; style?: CSSProperties }) {
  const [src, setSrc] = useState<string>()

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob)
    // oxlint-disable-next-line react/set-state-in-effect -- Object URLs are external browser resources.
    setSrc(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])

  return src ? <img src={src} alt={alt} className={className} style={style} /> : null
}
