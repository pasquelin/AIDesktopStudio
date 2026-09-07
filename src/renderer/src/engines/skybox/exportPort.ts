import { SRGBColorSpace, UnsignedByteType, type WebGLRenderer, type WebGLRenderTarget } from 'three'
import type { AdjustmentStack } from '@shared/domain/adjustments'
import type { TaskWatch } from '@shared/domain/taskProgress'
import { assetUrl, versionedUrl } from '@shared/domain/asset'
import { exportTargetOf, type ExportTargetId } from '@shared/domain/exportRegistry'
import { encodeRgbeOffThread, type RgbeEncoder } from './rgbePort'
import { faceFileNames } from '@shared/domain/skybox'
import type { ExportedFile, SkyboxExportCommand } from '@shared/ipc'
import { createAdjustPass } from '../gpu/passes/adjust'
import { encodePng, runOffscreenPass, type PictureSize } from '../material/derive/offscreen'
import type { TextureSource } from '../scene/textureCache'
import { createProjectionPass } from './projectionShader'
import type { GpuPipeline } from '../gpu/gpuPipeline'

/**
 * A sky on its way to six files somebody will hand to an engine.
 *
 * A port for the same reason the texture's is: jsdom has no WebGL and no PNG encoder, so which
 * files, under which names, at which size is a test — and only what is below needs a GPU.
 *
 * What the viewport shows is not what leaves. The preview grades into a 2048×1024 target because
 * that is what the prefiltered environment is built from; an export grades at the source's own
 * resolution and samples THAT, so a 4K panorama does not reach a 2048 face through a reduction
 * it never had to go through.
 */

export type SkyboxExportRequest = {
  /** The equirectangular source, as the catalogue knows it. */
  assetId: string
  adjustments: AdjustmentStack
  /** What the files are named after, already cleaned of everything a name cannot hold. */
  name: string
  /** Six faces at a size, or the one equirectangular picture they are cut out of. */
  command: SkyboxExportCommand
}

/**
 * The graded panorama, as the file the target names. Read back at the target's own half-float
 * depth: asking for bytes would quantise the very range these two formats exist for.
 *
 * `EXRExporter` does its own readback, so only the Radiance path asks for the pixels here.
 */
async function panoramaBytes(
  target: Extract<ExportTargetId, 'sky.hdr' | 'sky.exr'>,
  renderer: WebGLRenderer,
  graded: WebGLRenderTarget,
  size: PictureSize,
  encodeRadiance: RgbeEncoder,
): Promise<Uint8Array> {
  if (target === 'sky.exr') {
    const { EXRExporter } = await import('three/addons/exporters/EXRExporter.js')
    return new EXRExporter().parse(renderer, graded)
  }

  // Half floats come back as the sixteen-bit patterns they are, and the encoder takes them so:
  // widening them into a `Float32Array` first held the same 4K panorama twice, 128 MiB of it.
  const half = new Uint16Array(size.width * size.height * 4)
  await renderer.readRenderTargetPixelsAsync(graded, 0, 0, size.width, size.height, half)

  return encodeRadiance(half, size.width, size.height)
}

/**
 * Six faces of a 4K sky is seconds of GPU and six PNG encodes, so the watch is not decoration.
 * Optional because the assistant's door asks for the same bytes without one — that door shows no
 * row and cannot be stopped, which is a gap rather than a decision.
 */
export type SkyboxExportPort = (
  request: SkyboxExportRequest,
  watch?: TaskWatch,
) => Promise<ExportedFile[]>

export type SkyboxExportPortOptions = {
  /** Injected for the same reason the renderer's is: jsdom decodes no image. */
  loadTexture: TextureSource
  /**
   * When the source was last written, as the viewport reads it. Absent asks for the bare URL —
   * which is where the browser keeps the picture an edit REPLACED, so an export run after a ⌘S
   * would write the six faces from the old panorama while the viewport shows the new one.
   */
  assetVersion?: (assetId: string) => string | undefined
  /**
   * Radiance encoding, which runs OFF this thread by default: 8.4 M iterations at 4K and 33.5 M
   * at 8K. Injected because jsdom has no `Worker`, exactly as `loadTexture` is.
   */
  encodeRadiance?: RgbeEncoder
}

async function exportFaces(
  pipeline: GpuPipeline,
  renderer: WebGLRenderer,
  graded: WebGLRenderTarget,
  faceSide: number,
  name: string,
  watch?: TaskWatch,
): Promise<ExportedFile[]> {
  const projection = createProjectionPass()
  try {
    projection.setSource(graded.texture)
    projection.setFrame(faceSide, faceSide)
    const faces = faceFileNames(name)
    const files: ExportedFile[] = []
    for (const face of faces) {
      watch?.signal?.throwIfAborted()
      projection.setLayout('single', face.face)
      pipeline.renderToScreen(projection.material)
      const bytes = await encodePng(renderer.domElement)
      files.push({
        name: face.name,
        extension: exportTargetOf('sky.faces').extension,
        bytes,
      })
      watch?.onStep?.(files.length, faces.length)
    }
    return files
  } finally {
    projection.dispose()
  }
}

export function createSkyboxExportPort({
  loadTexture,
  assetVersion,
  encodeRadiance = encodeRgbeOffThread,
}: SkyboxExportPortOptions): SkyboxExportPort {
  // `async`, so a stop already raised comes back as a rejection rather than as a synchronous
  // throw: the port promises a promise, and half its callers only ever look at one.
  return async ({ assetId, adjustments, name, command }, watch) => {
    // Before the source is even asked for: decoding a 4K panorama is the first long thing here,
    // and a stop pressed while it downloads must not be answered by six faces of it.
    watch?.signal?.throwIfAborted()

    // A panorama is read back off its own target and never reaches the canvas, so one texel is
    // what its frame costs — a face's side is the only size this frame ever means.
    const faceSide = command.kind === 'faces' ? command.size : 1

    // Filled while the sources are in hand: `draw` is handed the frame's size — one face — and
    // the graded picture in between is the source's, which nothing else carries across.
    let equirect: PictureSize = { width: 0, height: 0 }

    return runOffscreenPass({
      load: loadTexture,
      urls: [versionedUrl(assetUrl(assetId), assetVersion?.(assetId))],

      pass: sources => {
        const [source] = sources
        // `loadSource` reads every picture as stored, which is right for a PBR channel and wrong
        // for a sky: this one IS a colour. Left undecoded, the grading would work on sRGB
        // numbers and the pass would encode them a second time on the way out. NOT over a float
        // decode — a `.hdr` is linear already, and stamping sRGB there decodes it twice instead.
        if (source.texture.type === UnsignedByteType) source.texture.colorSpace = SRGBColorSpace
        source.texture.needsUpdate = true

        const adjust = createAdjustPass()
        adjust.setSource(source.texture)
        adjust.setAdjustments(adjustments)
        return adjust
      },

      frame: sources => {
        equirect = sources[0].size
        return { width: faceSide, height: faceSide }
      },

      draw: async ({ pipeline, renderer, material }) => {
        // Half-float, as the viewport's is: eight bits per channel bands on a sky gradient long
        // before it bands on a texture, and every face is sampled out of this one picture.
        const graded = pipeline.createTarget(equirect.width, equirect.height, 'float')
        try {
          pipeline.renderTo(material, graded)

          // The panorama IS this target, so it leaves before anything squares it off — and it
          // leaves with the range the grading gave it, which is the whole reason to ask for one.
          if (command.kind === 'panorama') {
            watch?.signal?.throwIfAborted()
            const bytes = await panoramaBytes(
              command.target,
              renderer,
              graded,
              equirect,
              encodeRadiance,
            )
            watch?.onStep?.(1, 1)
            return [{ name, extension: exportTargetOf(command.target).extension, bytes }]
          }

          return exportFaces(pipeline, renderer, graded, faceSide, name, watch)
        } finally {
          // Its own `finally`, inside the pass's: the target is 64 MB at 4K, and a throw while
          // the six faces are drawn would otherwise leave it held for the life of the window.
          graded.dispose()
        }
      },
    })
  }
}
