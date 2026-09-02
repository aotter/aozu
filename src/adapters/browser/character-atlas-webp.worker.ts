import encode from '@jsquash/webp/encode.js'

self.onmessage = async ({ data }: MessageEvent<{ pixels: ArrayBuffer; width: number; height: number }>) => {
  try {
    const bytes = await encode(new ImageData(new Uint8ClampedArray(data.pixels), data.width, data.height), {
      lossless: 1,
      exact: 1,
      quality: 75,
      method: 4,
    })
    self.postMessage({ bytes }, { transfer: [bytes] })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) })
  }
}
