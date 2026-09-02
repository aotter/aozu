import { Application, Container, Sprite, Spritesheet, Texture } from 'pixi.js'

import { CHARACTER_RIG, type CharacterTextureAtlas } from '../../core/domain/character.ts'

const TRANSITION_MS = 220

const loadAtlas = async (atlas: CharacterTextureAtlas) => {
  const bitmap = await createImageBitmap(atlas.image)
  const texture = Texture.from(bitmap, true)
  const sheet = new Spritesheet(texture, atlas.data)
  try {
    await sheet.parse()
    return { atlas, bitmap, sheet }
  } catch (error) {
    sheet.destroy(true)
    bitmap.close()
    throw error
  }
}

export async function mountCharacterTextureAtlas(host: HTMLElement) {
  const app = new Application()
  await app.init({ ...CHARACTER_RIG.canvas, backgroundAlpha: 0, antialias: true, autoStart: false })
  const canvas = app.canvas as HTMLCanvasElement
  canvas.className = 'size-full'
  host.replaceChildren(canvas)

  type Atlas = Awaited<ReturnType<typeof loadAtlas>>
  type View = { atlas: Atlas; container: Container; sprites: Map<string, Sprite> }
  let current: View | undefined
  let animationFrame: number | undefined
  let finishTransition = () => {}
  let revision = 0
  let destroyed = false

  const destroyAtlas = ({ bitmap, sheet }: Atlas) => {
    sheet.destroy(true)
    bitmap.close()
  }
  const remove = (view: View, keep?: Atlas) => {
    app.stage.removeChild(view.container)
    view.container.destroy({ children: true })
    if (view.atlas !== keep) destroyAtlas(view.atlas)
  }
  const settle = () => {
    if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
    animationFrame = undefined
    finishTransition()
    finishTransition = () => {}
  }
  const animate = (draw: (progress: number) => void, finish: () => void) => {
    let finished = false
    const complete = () => {
      if (finished) return
      finished = true
      draw(1)
      finish()
      app.render()
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return complete()
    finishTransition = complete
    const startedAt = performance.now()
    const fade = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / TRANSITION_MS)
      if (progress < 1) {
        draw(progress)
        app.render()
        animationFrame = requestAnimationFrame(fade)
      } else {
        animationFrame = undefined
        finishTransition = () => {}
        complete()
      }
    }
    animationFrame = requestAnimationFrame(fade)
  }

  const update = async (atlas: CharacterTextureAtlas, frameIds: readonly string[]) => {
    const updateRevision = ++revision
    const loaded = current?.atlas.atlas === atlas ? current.atlas : await loadAtlas(atlas)
    if (destroyed || updateRevision !== revision) {
      if (loaded !== current?.atlas) destroyAtlas(loaded)
      return false
    }
    let textures
    try {
      textures = frameIds.map((id) => {
        const texture = loaded.sheet.textures[id]
        if (!texture) throw new Error(`Character atlas frame is missing: ${id}`)
        return texture
      })
    } catch (error) {
      if (loaded !== current?.atlas) destroyAtlas(loaded)
      throw error
    }

    if (current?.atlas === loaded) {
      settle()
      const desired = new Set(frameIds)
      const leaving = [...current.sprites].filter(([id]) => !desired.has(id))
      for (const [id] of leaving) current.sprites.delete(id)
      const entering: Sprite[] = []
      frameIds.forEach((id, index) => {
        let sprite = current!.sprites.get(id)
        if (!sprite) {
          sprite = new Sprite(textures[index])
          sprite.alpha = 0
          current!.sprites.set(id, sprite)
          current!.container.addChild(sprite)
          entering.push(sprite)
        }
        sprite.zIndex = index * 10 + (entering.includes(sprite) ? 1 : 0)
      })
      if (!leaving.length && !entering.length) {
        app.render()
        return true
      }
      app.render()
      animate(
        (progress) => {
          for (const [, sprite] of leaving) sprite.alpha = 1 - progress
          for (const sprite of entering) sprite.alpha = progress
        },
        () => {
          for (const [, sprite] of leaving) {
            current!.container.removeChild(sprite)
            sprite.destroy()
          }
          frameIds.forEach((id, index) => { current!.sprites.get(id)!.zIndex = index * 10 })
        },
      )
      return true
    }

    const container = new Container()
    container.sortableChildren = true
    const sprites = new Map(frameIds.map((id, index) => {
      const sprite = new Sprite(textures[index])
      sprite.zIndex = index * 10
      container.addChild(sprite)
      return [id, sprite]
    }))
    settle()
    const previous = current
    current = { atlas: loaded, container, sprites }
    app.stage.addChild(container)
    if (!previous) {
      app.render()
      return true
    }

    container.alpha = 0
    app.render()
    animate(
      (progress) => {
        previous.container.alpha = 1 - progress
        container.alpha = progress
      },
      () => remove(previous, loaded),
    )
    return true
  }

  return { update, destroy() {
    destroyed = true
    revision += 1
    settle()
    const atlas = current?.atlas
    app.destroy(true, { children: true })
    if (atlas) destroyAtlas(atlas)
    current = undefined
  } }
}
