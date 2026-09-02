import { useLayoutEffect, useState } from 'react'

export function useBlobUrl(blob?: Blob) {
  const [source, setSource] = useState<{ blob: Blob; url: string }>()

  useLayoutEffect(() => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    // oxlint-disable-next-line react/set-state-in-effect -- Object URLs are external browser resources.
    setSource({ blob, url })
    return () => URL.revokeObjectURL(url)
  }, [blob])

  return source && source.blob === blob ? source.url : undefined
}
