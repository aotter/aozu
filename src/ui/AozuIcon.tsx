import type { HTMLAttributes } from 'react'

export type AozuIconName = 'archive' | 'book' | 'expressions' | 'import' | 'outfits' | 'profile' | 'props'

export function AozuIcon({ name, className = '', ...props }: HTMLAttributes<HTMLSpanElement> & { name: AozuIconName }) {
  return <span className={`aozu-icon ${className}`.trim()} aria-hidden="true" {...props}>
    <img src={`/assets/aozu-icons/${name}.png`} alt="" />
  </span>
}
