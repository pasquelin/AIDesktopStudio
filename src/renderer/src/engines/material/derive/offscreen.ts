import { LinearFilter, NoColorSpace, WebGLRenderer, type ShaderMaterial, type Texture } from 'three'
import { isRecord, readNumber } from '@shared/guards'
import { createGpuPipeline, type GpuPipeline } from '../../gpu/gpuPipeline'
import type { TextureSource } from '../../scene/textureCache'

/**
 * The plumbing every off-screen pass over a channel shares: take the pixels, open a context,
 * draw once, give both back. Written once because the giving back is the part that is easy to
 * get wrong — a decoded 4K channel is 64 MB, and a context that leaks blacks out somebody's
 * viewport.
 */

export type PictureSize = { width: number; height: number }

/** A picture ready to be sampled, and the size the frame drawn from it must have. */
export type Source = { texture: Texture; size: PictureSize }

/**
 * The sources of one pass, in the order they were asked for. A tuple rather than an array
 * because every pass reads at least one, and a type that says so is what lets the passes that
 * read exactly one keep reading `sources[0]` without a guard for a case that cannot happen.
 */
export type Sources = readonly [Source, ...Source[]]

/** What a pass hands back: the material that computes it, and nothing else. */
export type OffscreenPass = { readonly material: ShaderMaterial }

/** The context of one draw, alive only for the length of the call it is handed to. */
export type OffscreenFrame = {
  renderer: WebGLRenderer
  pipeline: GpuPipeline
  material: ShaderMaterial
  /** The frame's own size, which is not the source's when the pass reduces into one texel. */
  size: PictureSize
}

export type OffscreenRun<T> = {
  load: TextureSource
  /** What the pass reads, in the order it reads them. One for a derivation, three for an ORM. */
  urls: readonly string[]
  /** The pass to build over the decoded sources, once the pixels are in hand. */
  pass: (sources: Sources) => OffscreenPass
  /** The frame the pass draws into. The first source's size unless the pass says otherwise. */
  frame?: (sources: Sources) => PictureSize
  draw: (frame: OffscreenFrame) => Promise<T> | T
}

/**
 * One off-screen pass at a time, whoever asks.
 *
 * The invariant belongs here rather than to the panels: they do not know about each other, and
 * the channel grid going dead said nothing to the inspector's measure button — two clicks
 * decoded two 4K pictures and held two contexts at once. A browser evicts the OLDEST context
 * when it hands out the seventeenth, so what goes black is a viewport somebody was looking at.
 */
let queued: Promise<unknown> = Promise.resolve()

function serialize<T>(run: () => Promise<T>): Promise<T> {
  const result = queued.then(run)
  // The queue carries no rejection forward: one refused context would reject every pass behind it.
  queued = result.catch(() => undefined)
  return result
}

/**
 * Everything between taking the pixels and giving them back, in the one order that frees both.
 *
 * Each step throws — sizing, building the pass, and asking for a context on a machine whose GPU
 * process has died — and every one of them used to pin a fully decoded picture for the life of
 * the window.
 */
export function runOffscreenPass<T>({
  load,
  urls,
  pass,
  frame,
  draw,
}: OffscreenRun<T>): Promise<T> {
  return serialize(async () => {
    const sources = await loadSources(load, urls)

    try {
      const built = pass(sources)
      try {
        const drawn = frame ? frame(sources) : sources[0].size
        return await withRenderer(drawn, (renderer, pipeline) =>
          draw({ renderer, pipeline, material: built.material, size: drawn }),
        )
      } finally {
        built.material.dispose()
      }
    } finally {
      for (const source of sources) source.texture.dispose()
    }
  })
}

/**
 * Every source of one pass, or none of them.
 *
 * Settled rather than `all`: a rejection out of `all` settles the call while the sources that
 * did decode are still on their way, and they arrive with nobody holding them — 64 MB each, for
 * the life of the window. The same reason `loadSource` frees the one throw it cannot hand back.
 */
async function loadSources(load: TextureSource, urls: readonly string[]): Promise<Sources> {
  const settled = await Promise.allSettled(urls.map(url => loadSource(load, url)))

  const loaded: Source[] = []
  // The settled result itself, not its reason: it is what tells "nothing failed" apart from
  // "something failed with an undefined reason", and it is a type the platform already has.
  let failure: PromiseRejectedResult | undefined = undefined
  for (const result of settled) {
    if (result.status === 'fulfilled') loaded.push(result.value)
    else failure ??= result
  }

  const [first, ...rest] = loaded
  // The empty case is the caller's mistake rather than the picture's, and it lands here because
  // this is where the tuple is built — a pass over nothing would draw an untouched frame.
  if (failure || !first) {
    for (const source of loaded) source.texture.dispose()
    throw failure ? failure.reason : new Error('a pass needs a source to read')
  }

  return [first, ...rest]
}

/**
 * Reads the channel as stored, whatever `contentOf` says it holds. A base colour decoded to
 * linear would have a pass compute on values the file never held — where the luminance of the
 * stored picture is what the eye reads as depth, and as grain.
 */
async function loadSource(load: TextureSource, url: string): Promise<Source> {
  const texture = await load(url)
  texture.colorSpace = NoColorSpace
  // Every pass samples LOD 0 only. Left on, three builds the whole pyramid: +22 MB and a full
  // GPU pass on a 4K channel, for levels nothing reads.
  texture.generateMipmaps = false
  texture.minFilter = LinearFilter

  try {
    return { texture, size: sizeOf(texture) }
  } catch (error) {
    // Freed here, and it has to be here: this is the one throw the caller cannot guard, because
    // it happens before it holds anything to guard. A decoded 4K channel is 64 MB.
    texture.dispose()
    throw error
  }
}

/** What the loader decoded, in pixels. Anything else is a source there is nothing to read in. */
function sizeOf(texture: Texture): PictureSize {
  const image: unknown = texture.image
  if (!isRecord(image)) throw new Error('source decoded to nothing')

  const size = { width: readNumber(image, 'width', 0), height: readNumber(image, 'height', 0) }
  if (size.width <= 0 || size.height <= 0) throw new Error('source decoded to nothing')
  return size
}

/**
 * One context, one frame, given back inside this call whatever happens.
 *
 * A context of its own rather than the viewport's — the exception `GpuPipeline` names: nothing
 * is exchanged between the two, the result leaves as a PNG or as a number.
 */
async function withRenderer<T>(
  size: PictureSize,
  draw: (renderer: WebGLRenderer, pipeline: GpuPipeline) => Promise<T> | T,
): Promise<T> {
  const renderer = new WebGLRenderer({
    // Without it the drawing buffer is cleared before the canvas can be read back, and every
    // derivation comes out blank.
    preserveDrawingBuffer: true,
    // three defaults this to true, and `alpha: false` below does NOT reach the context — it only
    // picks the clear colour. A pass writing straight values into a context declared premultiplied
    // has its colours divided by alpha at `toBlob`: Unity's mask map, the one recipe whose alpha
    // is a channel rather than 1, came out with its metallic and occlusion destroyed — fully
    // rough (smoothness 0) encoded as (0,0,0,0). Every other pass writes alpha 1, which hid it.
    premultipliedAlpha: false,
    // A full-screen quad depth-tests against nothing and blends with nothing. Left on, the depth
    // attachment alone is another 67 MB at 4K, allocated and thrown away.
    antialias: false,
    depth: false,
    stencil: false,
    alpha: false,
  })

  try {
    // `false` for the third: the canvas is read back, never laid out, so a style in CSS pixels
    // would only make a device pixel ratio disagree with the frame that was drawn.
    renderer.setSize(size.width, size.height, false)
    const pipeline = createGpuPipeline(renderer)
    try {
      return await draw(renderer, pipeline)
    } finally {
      pipeline.dispose()
    }
  } finally {
    renderer.dispose()
    // `dispose` frees three's own objects; the context itself only goes with this.
    renderer.forceContextLoss()
  }
}

/** Draw the pass and encode the frame — the two ports that return a PNG both did this. */
export async function pngDrawn({
  renderer,
  pipeline,
  material,
  size,
}: OffscreenFrame): Promise<PictureSize & { png: Uint8Array }> {
  pipeline.renderToScreen(material)
  return { ...size, png: await encodePng(renderer.domElement) }
}

/** The browser's own encoder — the one place where a per-pixel loop is not ours to write. */
export async function encodePng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('the canvas encoded to nothing')
  return new Uint8Array(await blob.arrayBuffer())
}
