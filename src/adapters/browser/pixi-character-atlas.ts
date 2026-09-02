import { Application, Sprite, Spritesheet, Texture } from 'pixi.js'

import { CHARACTER_RIG, type CharacterTextureAtlas } from '../../core/domain/character.ts'

export async function mountCharacterTextureAtlas(host: HTMLElement, atlas: CharacterTextureAtlas, frameIds: readonly string[]) {
  const bitmap = await createImageBitmap(atlas.image)
  const texture = Texture.from(bitmap, true)
  const sheet = new Spritesheet(texture, atlas.data)
  const app = new Application()
  let initialized = false
  try {
    await sheet.parse()
    await app.init({ ...CHARACTER_RIG.canvas, backgroundAlpha: 0, antialias: true, autoStart: false })
    initialized = true
    for (const id of frameIds) {
      const frame = sheet.textures[id]
      if (!frame) throw new Error(`Character atlas frame is missing: ${id}`)
      app.stage.addChild(new Sprite(frame))
    }
    app.render()
    const canvas = app.canvas as HTMLCanvasElement
    canvas.className = 'size-full character-layer-enter'
    host.replaceChildren(canvas)
  } catch (error) {
    if (initialized) app.destroy(true, { children: true })
    sheet.destroy(true)
    bitmap.close()
    throw error
  }
  return () => {
    app.destroy(true, { children: true })
    sheet.destroy(true)
    bitmap.close()
  }
}
