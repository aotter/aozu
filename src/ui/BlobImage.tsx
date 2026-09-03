import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

import { useBlobUrl } from '@/ui/useBlobUrl'

export function BlobImage({ blob, alt = '', className, style }: { blob: Blob; alt?: string; className: string; style?: CSSProperties }) {
  const src = useBlobUrl(blob)

  return src ? <img src={src} alt={alt} className={className} style={style} /> : null
}

/** Resolves once the image can be shown. decode() is preferred, but Chrome never settles it in a
 *  background tab, so the load/error events are the floor: the layer must never stay invisible. */
const imageReady = (src: string) => new Promise<void>((resolve) => {
  const image = new Image()
  image.addEventListener('load', () => resolve(), { once: true })
  image.addEventListener('error', () => resolve(), { once: true })
  image.src = src
  void image.decode().then(resolve, () => resolve())
})

export function CrossfadeBlobImage({ blob, alt = '', className, style }: { blob: Blob; alt?: string; className: string; style?: CSSProperties }) {
  const urls = useRef(new Set<string>())
  const styleKey = JSON.stringify(style)
  const placement = useRef({ blob, style, styleKey })
  const [sources, setSources] = useState<{
    current?: { blob: Blob; url: string; style?: CSSProperties; styleKey?: string }
    previous?: { blob: Blob; url: string; style?: CSSProperties; styleKey?: string }
  }>({})

  useLayoutEffect(() => {
    placement.current = { blob, style, styleKey }
    // oxlint-disable-next-line react/set-state-in-effect -- Keep the decoded source paired with its latest placement.
    setSources((current) => current.current?.blob === blob && current.current.styleKey !== styleKey
      ? { ...current, current: { ...current.current, style, styleKey } }
      : current)
  }, [blob, style, styleKey])

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob)
    urls.current.add(objectUrl)
    let cancelled = false
    void imageReady(objectUrl).then(() => {
      if (cancelled) {
        URL.revokeObjectURL(objectUrl)
        urls.current.delete(objectUrl)
        return
      }
      const next = placement.current
      setSources(({ current }) => ({ current: { blob, url: objectUrl, style: next.style, styleKey: next.styleKey }, previous: current }))
    })
    return () => { cancelled = true }
  }, [blob])

  useEffect(() => {
    if (!sources.previous) return
    const previous = sources.previous.url
    const ownedUrls = urls.current
    const timeout = window.setTimeout(() => setSources((current) => current.previous?.url === previous ? { current: current.current } : current), 180)
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
    {sources.previous && <img key={sources.previous.url} src={sources.previous.url} alt="" aria-hidden="true" className={`${className} character-layer-exit`} style={sources.previous.style} />}
    {sources.current && <img key={sources.current.url} src={sources.current.url} alt={alt} className={`${className} character-layer-enter`} style={sources.current.style} />}
  </>
}
