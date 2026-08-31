import type { ReactNode } from 'react'

import type { ResolvedSceneLayer } from '@/core/domain/scene.ts'
import { BlobImage } from '@/ui/BlobImage'

type SceneLayer = ResolvedSceneLayer & { blob: Blob }

export function SceneRenderer({ label, layers, children }: { label: string; layers: SceneLayer[]; children?: ReactNode }) {
  const render = (plane: SceneLayer['plane']) => layers
    .filter((layer) => layer.plane === plane)
    .map((layer) => <BlobImage
      key={layer.id}
      blob={layer.blob}
      className="absolute inset-0 size-full object-cover"
      style={{ zIndex: layer.order }}
    />)

  return <div className="relative aspect-2/3 w-full overflow-hidden rounded-3xl border bg-muted/40" role="img" aria-label={label}>
    <div className="absolute inset-0 z-0">{render('back')}</div>
    <div className="absolute inset-0 z-10">{children}</div>
    <div className="pointer-events-none absolute inset-0 z-20">{render('front')}</div>
  </div>
}
