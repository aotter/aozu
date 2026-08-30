import type { CharacterRenderLayer } from './character'

export function CharacterRenderer({
  label,
  layers,
}: {
  label: string
  layers: Array<CharacterRenderLayer & { src: string }>
}) {
  return (
    <div className="character-renderer" role="img" aria-label={label}>
      {layers.map((layer) => (
        <img
          key={layer.id}
          src={layer.src}
          alt=""
          data-placement={layer.placement}
          style={{ zIndex: layer.z }}
        />
      ))}
    </div>
  )
}
