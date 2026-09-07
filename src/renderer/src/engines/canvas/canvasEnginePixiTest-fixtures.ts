import { EXTRACTED, gpu } from './canvasEngineState-fixtures'

class Matrix {
  a = 1
  b = 0
  c = 0
  d = 1
  tx = 0
  ty = 0

  set(a: number, b: number, c: number, d: number, tx: number, ty: number): void {
    this.a = a
    this.b = b
    this.c = c
    this.d = d
    this.tx = tx
    this.ty = ty
  }
}

/** Pixi's `ObservablePoint`, reduced to what a test needs: a value it can read back. */
class Pair {
  x: number
  y: number

  constructor(value = 0) {
    this.x = value
    this.y = value
  }

  set(x: number, y = x): void {
    this.x = x
    this.y = y
  }
}

class Container {
  readonly children: Container[] = []
  parent: Container | null = null
  readonly position = new Pair()
  readonly scale = new Pair(1)
  readonly pivot = new Pair()
  readonly skew = new Pair()
  visible = true
  renderable = true
  alpha = 1
  rotation = 0
  blendMode = 'normal'
  label = ''
  filters: object[] = []
  mask: object | null = null
  maskChannel = 'red'
  size: { width: number; height: number } | null = null
  destroyed = false
  matrix: { a: number; b: number; c: number; d: number; tx: number; ty: number } | null = null

  constructor(options: { label?: string } = {}) {
    this.label = options.label ?? ''
    gpu.containers.push(this)
  }

  addChild(child: Container): void {
    gpu.mutations += 1
    // Pixi reparents rather than sharing: a child belongs to one container at a time, and the
    // clipping proxies rely on it.
    child.parent?.removeChild(child)
    child.parent = this
    this.children.push(child)
  }

  removeChild(child: Container): void {
    const at = this.children.indexOf(child)
    if (at < 0) return
    gpu.mutations += 1
    child.parent = null
    this.children.splice(at, 1)
  }

  setSize(width: number, height: number): void {
    this.size = { width, height }
  }

  setMask(options: { mask: Container | null; channel?: string }): void {
    this.mask = options.mask
    this.maskChannel = options.channel ?? 'red'
  }

  setFromMatrix(matrix: Matrix): void {
    this.matrix = {
      a: matrix.a,
      b: matrix.b,
      c: matrix.c,
      d: matrix.d,
      tx: matrix.tx,
      ty: matrix.ty,
    }
  }

  removeChildren(): void {
    gpu.mutations += this.children.length
    for (const child of this.children) child.parent = null
    this.children.length = 0
  }

  /** Recorded, and passed down: `destroy({ children: true })` takes the subtree with it. */
  destroy(options?: { children?: boolean }): void {
    this.destroyed = true
    if (options?.children) for (const child of this.children) child.destroy(options)
  }
}

class Graphics extends Container {
  clear(): this {
    return this
  }
  moveTo(): this {
    return this
  }
  lineTo(): this {
    return this
  }
  circle(): this {
    return this
  }
  rect(x: number, y: number, width: number, height: number): this {
    gpu.stamps.push({ x, y, width, height })
    return this
  }
  fill(): this {
    return this
  }
}

const pixiDouble = {
  Application: class {
    readonly canvas = document.createElement('canvas')
    readonly stage = new Container()
    readonly renderer = {
      render: (options?: { target?: { id: number }; container?: { mask?: object | null } }) => {
        gpu.renders += 1
        if (options?.target) gpu.painted.push(options.target.id)
        // Read HERE and not off the container afterwards: a pass frees its own holder, so the
        // mask is gone by the time a case could look for it.
        if (options?.container?.mask) gpu.masked += 1
      },
      extract: {
        pixels: (options: { frame?: { x: number; y: number; width: number; height: number } }) => {
          if (options.frame) gpu.sampled.push(options.frame)
          return { pixels: gpu.pixels }
        },
        /**
         * What the engine extracts through now: a canvas, then a blob, never a string.
         *
         * `toBlob` and NOT `convertToBlob`, because that is the one Electron gives: Pixi's
         * `generateCanvas` goes through `DOMAdapter.createCanvas()`, which is
         * `document.createElement('canvas')` in a window — an `HTMLCanvasElement`, which has
         * `toBlob`. `convertToBlob` belongs to `OffscreenCanvas`, in a worker. Faking that one
         * left the branch every ⌘S really takes untested.
         */
        canvas: (options: { frame?: unknown; resolution?: number }) => {
          gpu.extracted.push(options)
          return {
            toBlob: (give: (blob: Blob | null) => void) => {
              give(gpu.refuseEncode ? null : new Blob([EXTRACTED], { type: 'image/png' }))
            },
          }
        },
      },
    }

    async init(options: Record<string, unknown>): Promise<void> {
      gpu.init = options
    }
    resize(): void {
      gpu.resizes += 1
    }
    destroy(): void {}
  },
  defaultFilterVert: '',
  Filter: {
    defaultOptions: { resolution: 1 },
    // What `Filter.from` builds, reduced to the one thing the engine writes into it.
    from: () => ({ resources: { adjustUniforms: { uniforms: {} } } }),
  },
  AlphaFilter: class {
    destroy(): void {}
  },
  /** What softens the edge of a dab: the engine writes a strength and a padding into it. */
  BlurFilter: class {
    strength = 0
    padding = 0
    destroy(): void {}
  },
  Container,
  Graphics,
  Matrix,
  Sprite: class extends Container {
    constructor() {
      super()
      // The world is private, so this registry is the only way a test can read what the
      // engine wrote onto a layer's sprite.
      gpu.sprites.push(this)
    }
  },
  Assets: {
    load: (options: { src: string; parser?: string }) => {
      gpu.loaded.push(options)
      if (gpu.refuseLoad) return Promise.reject(new Error('gone'))
      return Promise.resolve({ width: 200, height: 100 })
    },
    // Saved pixels go in through a blob URL the loader is then told to forget: its cache is
    // keyed on the whole source string, and a data URL of a 4K layer would sit in it for good.
    unload: (src: string) => {
      gpu.unloaded.push(src)
      return Promise.resolve()
    },
  },
  Text: class extends Container {},
  // Carries its four numbers: the eyedropper's whole point is which frame it asks for.
  Rectangle: class {
    constructor(
      readonly x: number,
      readonly y: number,
      readonly width: number,
      readonly height: number,
    ) {}
  },
  Texture: class {},
  RenderTexture: {
    create: (options: { width: number; height: number }) => {
      const id = gpu.texturesCreated
      gpu.texturesCreated += 1
      const texture = {
        id,
        width: options.width,
        height: options.height,
        // A stable object, which the patch store lifts sub-frames off. Its style counts its
        // updates: in Pixi 8.19 a sampling written without one never reaches the GPU.
        source: {
          scaleMode: 'linear',
          style: {
            updates: 0,
            update(): void {
              this.updates += 1
            },
          },
        },
        destroy: () => {
          gpu.texturesDestroyed += 1
        },
      }
      gpu.textures.push(texture)
      return texture
    },
  },
}

export { pixiDouble }
