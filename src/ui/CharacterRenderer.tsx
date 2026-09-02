import type { CSSProperties } from 'react'

import { CHARACTER_RIG, IDENTITY_CHARACTER_TRANSFORM, type CharacterAssetInspection, type CharacterVariantTransform } from '@/core/domain/character'
import { BlobImage, CrossfadeBlobImage } from '@/ui/BlobImage'
import { cn } from '@/ui/lib/utils'

type Layer = { id: string; blob: Blob; slotOrder: number; layerOrder: number; transform?: CharacterVariantTransform }
type Bounds = NonNullable<CharacterAssetInspection['visibleBounds']>

const layerStyle = (layer: Layer, style?: CSSProperties): CSSProperties => {
  const transform = layer.transform ?? IDENTITY_CHARACTER_TRANSFORM
  return {
    zIndex: layer.slotOrder * 100 + layer.layerOrder,
    left: `${transform.x / CHARACTER_RIG.canvas.width * 100}%`,
    top: `${transform.y / CHARACTER_RIG.canvas.height * 100}%`,
    transform: `scale(${transform.scale})`,
    transformOrigin: 'top left',
    ...style,
  }
}

const Layers = ({ layers, style }: { layers: Layer[]; style?: CSSProperties }) => layers.map((layer) => <CrossfadeBlobImage
  key={`${layer.slotOrder}:${layer.layerOrder}`}
  blob={layer.blob}
  className="absolute size-full object-contain"
  style={layerStyle(layer, style)}
/>)

export function CharacterRenderer({ label, layers, className }: { label: string; layers: Layer[]; className?: string }) {
  return (
    <div className={cn('relative aspect-2/3 w-full overflow-hidden rounded-3xl border bg-muted/40', className)} role="img" aria-label={label}>
      {!layers.length && <div className="absolute inset-0 p-8"><CharacterSlotPlaceholder src="/assets/character-slots/body-base.png" /></div>}
      <Layers layers={layers} />
    </div>
  )
}

const BoundsBox = ({ bounds, className }: { bounds?: Bounds; className: string }) => bounds && <span
  aria-hidden="true"
  className={cn('pointer-events-none absolute border', className)}
  style={{
    left: `${bounds.x / CHARACTER_RIG.canvas.width * 100}%`,
    top: `${bounds.y / CHARACTER_RIG.canvas.height * 100}%`,
    width: `${bounds.width / CHARACTER_RIG.canvas.width * 100}%`,
    height: `${bounds.height / CHARACTER_RIG.canvas.height * 100}%`,
  }}
/>

export function CharacterAlignmentRenderer({
  label,
  candidateLayers,
  referenceLayers,
  mode,
  candidateBounds,
  referenceBounds,
  footLine,
}: {
  label: string
  candidateLayers: Layer[]
  referenceLayers: Layer[]
  mode: 'composite' | 'overlay' | 'diagnostic'
  candidateBounds?: Bounds
  referenceBounds?: Bounds
  footLine?: number
}) {
  if (mode === 'composite') return <CharacterRenderer label={label} layers={candidateLayers} />
  const diagnostic = mode === 'diagnostic'
  return <div className="relative aspect-2/3 w-full overflow-hidden rounded-3xl border bg-muted/40" role="img" aria-label={label}>
    <Layers layers={referenceLayers} style={diagnostic
      ? { opacity: 0.65, filter: 'brightness(0) saturate(100%) invert(75%) sepia(94%) saturate(1454%) hue-rotate(128deg) brightness(103%) contrast(103%)', mixBlendMode: 'screen' }
      : { opacity: 0.45 }} />
    <Layers layers={candidateLayers} style={diagnostic
      ? { opacity: 0.65, filter: 'brightness(0) saturate(100%) invert(23%) sepia(97%) saturate(7478%) hue-rotate(312deg) brightness(111%) contrast(111%)', mixBlendMode: 'screen' }
      : { opacity: 0.65 }} />
    {diagnostic && <>
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-foreground/30" />
      {footLine !== undefined && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/30" style={{ top: `${footLine / CHARACTER_RIG.canvas.height * 100}%` }} />}
      <BoundsBox bounds={referenceBounds} className="border-cyan-500" />
      <BoundsBox bounds={candidateBounds} className="border-fuchsia-500" />
    </>}
  </div>
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
