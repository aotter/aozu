import { useEffect, useRef, useState, type CSSProperties } from 'react'

import { CHARACTER_RIG, IDENTITY_CHARACTER_TRANSFORM, type CharacterAssetInspection, type CharacterTextureAtlas, type CharacterVariantTransform } from '@/core/domain/character'
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

function AtlasLayers({ atlas, layers }: { atlas: CharacterTextureAtlas; layers: Layer[] }) {
  const host = useRef<HTMLDivElement>(null)
  const controller = useRef<{ update(atlas: CharacterTextureAtlas, frameIds: readonly string[]): Promise<boolean>; destroy(): void }>(undefined)
  const latest = useRef({ atlas, frameIds: layers.map(({ id }) => id) })
  const [ready, setReady] = useState(false)
  const frameIds = layers.map(({ id }) => id).join('\n')

  useEffect(() => {
    let disposed = false
    void (async () => {
      const { mountCharacterTextureAtlas } = await import('@/adapters/browser/pixi-character-atlas')
      if (disposed || !host.current) return
      const mounted = await mountCharacterTextureAtlas(host.current)
      if (disposed) return mounted.destroy()
      controller.current = mounted
      const rendered = await mounted.update(latest.current.atlas, latest.current.frameIds)
      if (disposed) return
      if (rendered) setReady(true)
    })().catch((error) => {
      console.error('Character atlas render failed', error)
    })
    return () => {
      disposed = true
      controller.current?.destroy()
      controller.current = undefined
    }
  }, [])

  useEffect(() => {
    let active = true
    latest.current = { atlas, frameIds: frameIds.split('\n') }
    void controller.current?.update(atlas, frameIds.split('\n')).then((rendered) => { if (active && rendered) setReady(true) }).catch((error) => {
      console.error('Character atlas update failed', error)
    })
    return () => { active = false }
  }, [atlas, frameIds])

  return <>
    {!ready && <Layers layers={layers} />}
    <div ref={host} aria-hidden="true" className="absolute inset-0" />
  </>
}

export function CharacterRenderer({ label, layers, atlas, className }: { label: string; layers: Layer[]; atlas?: CharacterTextureAtlas; className?: string }) {
  return (
    <div className={cn('relative aspect-2/3 w-full overflow-hidden rounded-3xl border bg-muted/40', className)} role="img" aria-label={label}>
      {!layers.length && <div className="character-empty-placeholder absolute inset-0 p-8"><img src="/assets/placeholders/companion-body.png" alt="" /></div>}
      {atlas && layers.length ? <AtlasLayers atlas={atlas} layers={layers} /> : <Layers layers={layers} />}
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
  mode: 'composite' | 'overlay' | 'difference' | 'diagnostic'
  candidateBounds?: Bounds
  referenceBounds?: Bounds
  footLine?: number
}) {
  if (mode === 'composite') return <CharacterRenderer label={label} layers={candidateLayers} />
  const diagnostic = mode === 'diagnostic'
  const difference = mode === 'difference'
  return <div className="relative aspect-2/3 w-full overflow-hidden rounded-3xl border bg-muted/40" role="img" aria-label={label}>
    <Layers layers={referenceLayers} style={diagnostic
      ? { opacity: 0.65, filter: 'brightness(0) saturate(100%) invert(75%) sepia(94%) saturate(1454%) hue-rotate(128deg) brightness(103%) contrast(103%)', mixBlendMode: 'screen' }
      : { opacity: difference ? 1 : 0.45 }} />
    <Layers layers={candidateLayers} style={diagnostic
      ? { opacity: 0.65, filter: 'brightness(0) saturate(100%) invert(23%) sepia(97%) saturate(7478%) hue-rotate(312deg) brightness(111%) contrast(111%)', mixBlendMode: 'screen' }
      : { opacity: difference ? 1 : 0.65, ...(difference ? { mixBlendMode: 'difference' } : {}) }} />
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

export function CharacterAtlasFrameImage({ atlas, src, frameId, label = '' }: {
  atlas: CharacterTextureAtlas
  src: string
  frameId: string
  label?: string
}) {
  const frame = atlas.data.frames[frameId]?.frame
  if (!frame) return null
  return <span className="flex size-full items-center justify-center overflow-hidden">
    <span className="relative block max-h-full max-w-full overflow-hidden" style={{ aspectRatio: `${frame.w}/${frame.h}`, ...(frame.w >= frame.h ? { width: '100%' } : { height: '100%' }) }}>
      <img
        src={src}
        alt={label}
        className="absolute max-w-none"
        style={{
          width: `${atlas.data.meta.size.w / frame.w * 100}%`,
          height: `${atlas.data.meta.size.h / frame.h * 100}%`,
          maxHeight: 'none',
          left: `${-frame.x / frame.w * 100}%`,
          top: `${-frame.y / frame.h * 100}%`,
        }}
      />
    </span>
  </span>
}
