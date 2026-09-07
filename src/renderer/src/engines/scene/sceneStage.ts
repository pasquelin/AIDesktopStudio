import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import type { Us } from '@shared/domain/time'
import { offScreenHost } from '@/engines/core/offScreenHost'
import { reportFailure } from '@/services/diagnostics'
import { environmentDressOf } from '@/features/skybox/components/environmentDress'
import {
  extractedModelDress,
  prepareExtractedModelDress,
  wornModelDress,
} from '@/features/material/modelDress'
import { assetVersionOf } from '@/stores/assets'
import { onMaterialChange } from '@/stores/materialSources'
import { onSkyChange } from '@/stores/skyboxSources'
import { SceneRenderer } from './SceneRenderer'
import type { CameraPlacement } from './sceneView'
import { activeCameraAt } from './cameraShots'
import type { SceneState } from './sceneState'

/**
 * A scene rendered somewhere no one is looking, so a montage can show it.
 *
 * Its own WebGL context, and there is no way around that: a context cannot be shared between two
 * canvases, and the montage's own surface belongs to Pixi. It is the reason a stage is opened per
 * scene actually on screen and closed as soon as the montage stops asking for it — a browser
 * grants a page a handful of contexts, not one per clip.
 */
export type SceneStage = {
  /** Rebuilds what the scene holds. Cheap when the document has not changed — see `apply`. */
  show: (state: SceneState) => void
  /** Draws the instant asked for and hands back the canvas it landed on, undisturbed. */
  draw: (time: Us) => HTMLCanvasElement | null
  dispose: () => void
}

export type SceneStageOptions = {
  width: number
  height: number
  /**
   * What clips a model brought, once its file has landed — the only way to learn them, since
   * they live in the file and not in the document. A lone model dropped on a montage is played
   * through this; a scene document already says what it plays.
   */
  onClips?: (nodeId: string, clips: readonly string[]) => void
  /**
   * Where the 3D tab's own camera stands, if that tab has published one. Read afresh on every
   * frame: orbiting there moves the montage with it, which is the whole point of showing what
   * its author is looking at.
   */
  viewOf?: () => CameraPlacement | null
  /** Absent builds a real one; a test hands a stub, since jsdom has no WebGL at all. */
  createRenderer?: () => SceneRenderer
}

/**
 * Opens a stage: a host off screen, a renderer on it, and nothing else.
 *
 * The renderer is transparent and drawn at exactly one device pixel per asked-for pixel: what
 * comes out is composited over the clips underneath, at the sequence's own resolution.
 */
export function createSceneStage({
  width,
  height,
  onClips,
  viewOf,
  createRenderer,
}: SceneStageOptions): SceneStage {
  const host = offScreenHost(width, height)

  let renderer: SceneRenderer | null = null
  let failed = false
  /** The reads this stage waits on, given back when it closes — see `watchDocuments`. */
  const stopWatching: (() => void)[] = []

  /**
   * Built on the first frame asked for, never when the stage opens.
   *
   * The pool writes a source off as undecodable FOR THE SESSION when opening it throws, and a
   * WebGL context that could not be had — one too many, a driver that said no — would then
   * black out the clip for good with « media not found ». Deferred, the worst case is a clip
   * that draws nothing, and the reason lands in the journal where it can be read.
   */
  const engine = (): SceneRenderer | null => {
    if (renderer || failed) return renderer

    try {
      renderer =
        createRenderer?.() ??
        new SceneRenderer({
          // Nothing here selects or transforms anything: a stage is watched, never clicked.
          onSelect: () => {},
          onTransform: () => {},
          onClips: (nodeId, clips) => onClips?.(nodeId, clips),
          // The same port as the viewport, or a model in a clip wears the maps buried in its
          // `.glb` while the same model on screen wears the project's — the render disagrees
          // with what was framed, from the first frame.
          assetVersion: assetVersionOf,
          wornDress: wornModelDress,
          defaultModelDress: extractedModelDress,
          prepareModelDress: prepareExtractedModelDress,
          environmentDress: environmentDressOf,
        })

      renderer.prepareOffscreen({ alpha: true, pixelRatio: 1 })
      renderer.mount(host)
      watchDocuments()
      // No grid and no ground: a montage wants the scene, not the workshop it was built in.
      renderer.configure({ ...DEFAULT_SETTINGS.three, showGrid: false })
    } catch (error) {
      // Once: a montage asks sixty times a second, and a journal filling at that rate hides the
      // very line someone opened it to read.
      failed = true
      renderer = null
      reportFailure('scene.render', 'montage', error)
    }
    return renderer
  }

  /**
   * The documents a scene NAMES — a sky, a material — moving in their own tab, or landing off
   * disk a beat after the first frame. Measured on a clip: with the FILE half alone it drew at the
   * studio, then followed the first landing and no edit after it. `SceneDocument` gets both from
   * `useSkyRefresh`; a stage has no React to hang a hook on, so it subscribes itself.
   */
  const watchDocuments = (): void => {
    stopWatching.push(onSkyChange(() => renderer?.lightAgain()))
    stopWatching.push(onMaterialChange(materialIds => renderer?.dressModels(materialIds)))
  }

  let shown: SceneState | null = null
  /** Whether the free camera has been aimed at the contents — done once per angle, see `draw`. */
  let framed = false
  /** The published view the current aim was taken from, so a new one re-aims and nothing else. */
  let aimedFrom = ''

  return {
    show: state => {
      // By reference: every edit replaces the document object, so an unchanged one is a scene
      // that has not moved — and `apply` walks every node of it.
      if (state === shown) return

      const active = engine()
      if (!active) return

      shown = state
      // Straight through: a montage owns time, and nothing in a document can make a mixer run
      // against the wall clock any more — self-play is session state of the 3D tab alone, which
      // a stage of its own never carries.
      active.apply(state)
    },

    draw: time => {
      const active = engine()
      if (!active) return null

      const camera = shown ? activeCameraAt(shown.animation, shown.nodes, time) : null

      // The ANGLE its author is working in, never their distance: a scene with no camera of its
      // own has no other direction anybody actually chose, but a working view sits well back to
      // leave room around the subject — taken whole it drew a character a few pixels tall. So
      // the direction is theirs and the framing is ours.
      //
      // Aimed once per angle rather than per frame, and from the REST pose: re-aiming every
      // frame makes the camera chase a walking character's bounding box and the picture
      // breathes, while framing under whatever pose each monitor happens to be at would have
      // two monitors of the same clip disagree for good.
      if (!camera) {
        const working = viewOf?.() ?? null
        const angle = working ? JSON.stringify(working) : ''
        if (!framed || angle !== aimedFrom) {
          active.setPlayhead(0)
          framed = active.frameContents(working ?? undefined)
          if (framed) aimedFrom = angle
        }
      }

      return active.drawFrom(camera, time)
    },

    dispose: () => {
      for (const stop of stopWatching) stop()
      stopWatching.length = 0
      renderer?.dispose()
      host.remove()
    },
  }
}
