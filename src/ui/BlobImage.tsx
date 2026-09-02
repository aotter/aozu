import { useEffect, useRef, useState, type CSSProperties } from 'react'

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

export function CrossfadeBlobImage({ blob, alt = '', className, style }: { blob: Blob; alt?: string; className: string; style?: CSSProperties }) {
  const urls = useRef(new Set<string>())
  const [sources, setSources] = useState<{ current?: string; previous?: string }>({})

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob)
    urls.current.add(objectUrl)
    let cancelled = false
    void Object.assign(new Image(), { src: objectUrl }).decode().catch(() => {}).then(() => {
      if (cancelled) {
        URL.revokeObjectURL(objectUrl)
        urls.current.delete(objectUrl)
        return
      }
      setSources(({ current }) => ({ current: objectUrl, previous: current }))
    })
    return () => { cancelled = true }
  }, [blob])

  useEffect(() => {
    if (!sources.previous) return
    const previous = sources.previous
    const ownedUrls = urls.current
    const timeout = window.setTimeout(() => setSources((current) => current.previous === previous ? { current: current.current } : current), 180)
    return () => {
      window.clearTimeout(timeout)
      URL.revokeObjectURL(previous)
      ownedUrls.delete(previous)
    }
  }, [sources.previous])

  useEffect(() => {
    const ownedUrls = urls.current
    return () => {
      for (const url of ownedUrls) URL.revokeObjectURL(url)
      ownedUrls.clear()
    }
  }, [])

  return <>
    {sources.previous && <img key={sources.previous} src={sources.previous} alt="" aria-hidden="true" className={`${className} character-layer-exit`} style={style} />}
    {sources.current && <img key={sources.current} src={sources.current} alt={alt} className={`${className} character-layer-enter`} style={style} />}
  </>
}
