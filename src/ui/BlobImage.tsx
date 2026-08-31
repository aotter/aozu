import { useEffect, useState, type CSSProperties } from 'react'

export function BlobImage({ blob, alt = '', className, style }: { blob: Blob; alt?: string; className: string; style?: CSSProperties }) {
  const [src, setSrc] = useState<string>()

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob)
    // oxlint-disable-next-line react/set-state-in-effect -- Object URLs are external browser resources.
    setSrc(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])

  return src ? <img src={src} alt={alt} className={className} style={style} /> : null
}
