import i18next from 'i18next'
import { assetUrl, versionedUrl, type Asset } from '@shared/domain/asset'
import type { SaveAnimationThumbnailRequest } from '@shared/ipcExports'
import { stemOf } from '@shared/domain/fileName'
import { BUNDLED_ANIMATION_POSTERS } from '@shared/domain/animationLibrary'
import { getBridge } from './bridge'
import { reportFailure, reportNotice } from './diagnostics'
import { useAssets } from '@/stores/assets'
import { useProject } from '@/stores/project'
import { runTask } from '@/stores/tasks'
import { createWorkerSession } from '@/engines/core/workerSession'
import type {
  AnimationThumbnailRequest,
  AnimationThumbnailResponse,
} from '@/engines/scene/animationThumbnailMessage'

let preceding = Promise.resolve()

/**
 * Draws a still for every animation that has none, one batch at a time.
 *
 * 🛑 NEVER rejects: a caller that has something better to do than wait — the picker, which owes
 * the person the clip they just chose — starts it with `void`, and a rejection there would be an
 * `unhandledRejection`. Everything it can go wrong about is reported from the inside.
 */
export async function generateAnimationThumbnails(
  assets: readonly Asset[],
  redraw = false,
): Promise<void> {
  const projectPath = useProject.getState().project?.path
  const prior = preceding
  let release: () => void = () => undefined
  preceding = new Promise<void>(resolve => {
    release = resolve
  })
  await prior
  try {
    if (useProject.getState().project?.path === projectPath) await renderBatch(assets, redraw)
  } catch (error) {
    reportFailure('assets.save', 'animation-thumbnails', error)
  } finally {
    release()
  }
}

async function renderBatch(assets: readonly Asset[], redraw: boolean): Promise<void> {
  // A redraw was ASKED for, so a clip that already has a still is exactly what it is about.
  const motions = assets.filter(
    asset => asset.type === 'animation' && asset.path && (redraw || !asset.posterPath),
  )
  const foundBridge = getBridge()
  const foundProject = useProject.getState().project?.path
  if (!foundBridge || !foundProject || motions.length === 0) return
  const bridge = foundBridge
  const projectPath = foundProject
  await runTask(i18next.t('activity.drawingMotionPosters'), async (_id, watch) => {
    const worker = createWorkerSession<AnimationThumbnailRequest, AnimationThumbnailResponse>(
      () =>
        new Worker(new URL('../engines/scene/animationThumbnail.worker.ts', import.meta.url), {
          type: 'module',
        }),
    )
    const stop = (): void => worker.dispose()
    watch.signal?.addEventListener('abort', stop, { once: true })
    let pass: Pass = { drawn: 0, failed: 0 }
    try {
      const drawing: Drawing = {
        worker,
        save: request =>
          bridge.assets.saveAnimationThumbnail({
            ...request,
            ...(redraw ? { replace: true } : {}),
          }),
        model: await bridge.assets.animationThumbnailModel(),
        // Read at every step rather than captured: a pass outlives the project it began in, and
        // a still filed into a project that has closed lands beside another one's clip.
        stopped: () =>
          Boolean(watch.signal?.aborted) || useProject.getState().project?.path !== projectPath,
        projectPath,
      }
      pass = await drawEach(motions, drawing, step => watch.onStep?.(step, motions.length))
    } catch (error) {
      if (!watch.signal?.aborted) reportFailure('assets.save', 'animation-thumbnails', error)
    } finally {
      watch.signal?.removeEventListener('abort', stop)
      worker.dispose()
    }

    if (pass.failed > 0)
      reportNotice('assets.save', i18next.t('activity.motionPostersFailed', { count: pass.failed }))
    // The catalogue was written behind the window's back — `setAnimationPoster` announces
    // nothing — so without this the stills stay invisible until something else asks again.
    if (pass.drawn > 0) await useAssets.getState().refresh()
  })
}

/**
 * The still the app knows how to take of a clip it ships with, if this is one of them.
 *
 * 🛑 `Object.hasOwn`, never a bare index: the stem is whatever a person named their file, and
 * `constructor.fbx` walked the prototype chain — a function spread into a `postMessage`, which
 * throws `DataCloneError` and fails the thumbnail naming nothing.
 */
const posterFor = (stem: string) =>
  Object.hasOwn(BUNDLED_ANIMATION_POSTERS, stem) ? { poster: BUNDLED_ANIMATION_POSTERS[stem] } : {}

type Pass = { drawn: number; failed: number }

type Drawing = {
  worker: ReturnType<
    typeof createWorkerSession<AnimationThumbnailRequest, AnimationThumbnailResponse>
  >
  save: (request: SaveAnimationThumbnailRequest) => Promise<void>
  model: Uint8Array
  stopped: () => boolean
  projectPath: string
}

/**
 * Every clip in turn, and what the pass amounts to. One failure does not end it: an unreadable
 * clip is one clip, and the twenty behind it have done nothing wrong.
 */
async function drawEach(
  motions: readonly Asset[],
  drawing: Drawing,
  onStep: (step: number) => void,
): Promise<Pass> {
  const pass: Pass = { drawn: 0, failed: 0 }
  // The character is handed over ONCE and the worker keeps it: it is the cost of the pass, paid
  // again only when a failure leaves the worker without one.
  let withModel = true

  for (const [index, asset] of motions.entries()) {
    if (drawing.stopped()) return pass
    try {
      await drawOne(drawing, asset, withModel)
      withModel = false
      pass.drawn += 1
    } catch {
      if (drawing.stopped()) return pass
      // Counted rather than said: `assets.save` is a GESTURE scope, which `diagnostics` never
      // deduplicates — that is written for ⌘S, « asked again because the first press said
      // nothing ». Thirty unreadable clips would be thirty lines about work nobody asked for.
      pass.failed += 1
      withModel = true
    }
    onStep(index + 1)
  }

  return pass
}

/** One still: rendered off the main thread, then filed — unless the project moved on meanwhile. */
async function drawOne(drawing: Drawing, asset: Asset, withModel: boolean): Promise<void> {
  if (!asset.path) return
  // Copied rather than handed over: the transfer detaches what it takes, and a retry would send
  // an empty buffer to a worker that never got its character.
  const bytes = withModel ? new Uint8Array(drawing.model).buffer : undefined
  const result = await drawing.worker.send(
    {
      id: drawing.worker.nextId(),
      decoderRoot: new URL('./decoders/', document.baseURI).href,
      animationUrl: versionedUrl(assetUrl(asset.id), asset.localChangedAt),
      name: stemOf(asset.name),
      // 🛑 A shipped folder's name, and a stem answers it only when the two are the same word:
      // what an imported clip is called is its author's business, and describes nothing.
      ...posterFor(stemOf(asset.name)),
      ...(bytes ? { model: bytes } : {}),
    },
    bytes ? [bytes] : [],
  )

  if (!result.ok) throw new Error(result.error)
  if (drawing.stopped()) return

  await drawing.save({
    assetId: asset.id,
    sourcePath: asset.path,
    projectPath: drawing.projectPath,
    png: result.png,
  })
}
