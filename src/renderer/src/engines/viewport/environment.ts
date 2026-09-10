import { EquirectangularReflectionMapping, type Scene, type Texture } from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { isNeutral, NEUTRAL_ADJUSTMENTS, type AdjustmentStack } from '@shared/domain/adjustments'

/**
 * A prefiltered map, whichever engine built it. `WebGLRenderTarget` and the node renderer's
 * `RenderTarget` are declared apart by three and share exactly this much of a shape.
 */
type PrefilteredMap = { texture: Texture; dispose: () => void }

/**
 * What an environment needs OF an engine, and the whole of it: prefiltering a picture, prefiltering
 * the neutral room, and grading a sky before either.
 *
 * A port rather than a renderer, for the reason `SqliteDriver` is one: the debounce, the backdrop,
 * the rotation and the intensity are the same on both engines, and the day they were written twice
 * is the day a sky graded under one stopped matching the other.
 */
export type EnvironmentPort = {
  fromEquirectangular: (texture: Texture) => PrefilteredMap
  fromScene: (scene: Scene) => PrefilteredMap
  /**
   * The picture as the sky DOCUMENT grades it, or the source itself where an engine has no
   * grading of its own — see `gpuDriver`, which says what that costs a reader.
   */
  grade: (given: Texture, stack: AdjustmentStack) => Texture
  dispose: () => void
}

/**
 * Image-based lighting for a viewport: the equirectangular picture behind the scene, and the
 * prefiltered map every physical material reads to know what it reflects.
 *
 * The two are deliberately not updated together. Showing the picture costs nothing — it is one
 * texture assignment — while prefiltering it means rendering a full mip chain, which is far too
 * expensive to run on every frame of a slider drag. So `setTexture` is instant and `refresh`
 * is called when the gesture settles; the background follows the hand, the reflections catch up.
 */
export type ViewportEnvironment = {
  /** Instant. Shows the picture; leaves the prefiltered map on the previous one. */
  setTexture: (texture: Texture | null) => void
  /**
   * How the picture is graded before it is shown and prefiltered — what the sky DOCUMENT says,
   * never the scene's own dials. Instant, with the prefiltered map following after the quiet: a
   * slider dragged in the sky's tab is one shader a frame, not two hundred mip chains.
   *
   * A neutral stack allocates nothing and draws nothing, which is what most skies are.
   */
  setAdjustments: (stack: AdjustmentStack) => void
  /** Expensive. Rebuilds the prefiltered map from the current texture — debounce the caller. */
  refresh: () => void
  /**
   * The picture as it is SHOWN — graded when the document grades, the source itself when it does
   * not. What a FLAT view of a sky draws: it looks at the same image the backdrop hangs, and
   * asking the grading twice would be a second target for one picture.
   */
  shownTexture: () => Texture | null
  /**
   * Neutral light with no picture behind it: three builds a small lit room and prefilters it,
   * so the studio ships no HDRI at all and a brand new project still shows a material under
   * usable light. A roughness judged under no light is not judged.
   */
  setStudio: () => void
  /**
   * Lights from the neutral room for the length of one pass, and puts the document's own map back
   * with `false` — what a studio VIEW needs in a quad layout, where the pane beside it is still
   * showing the scene as it is.
   *
   * The room is prefiltered once, on the first ask, and kept: a mip chain per drawn frame is what
   * this exists not to pay.
   */
  borrowStudio: (studio: boolean) => void
  setIntensity: (intensity: number) => void
  /** Radians around Y. Turns the horizon and what the scene reflects together. */
  setRotation: (radians: number) => void
  setBackgroundVisible: (visible: boolean) => void
  /**
   * How soft the PICTURE is, 0 to 1. The prefiltered map is untouched: a sky serving as a backdrop
   * is softened behind the subject while what the subject reflects stays as sharp as it was.
   */
  setBackgroundBlur: (blur: number) => void
  dispose: () => void
}

/**
 * Milliseconds of quiet before the prefiltered map is rebuilt after a grading change. The picture
 * follows the hand because it is one shader; a mip chain per frame of a drag drops a viewport to
 * single digits.
 */
export const PMREM_QUIET_MS = 120

/**
 * Tells three that the backdrop it already converted has been REDRAWN under the same identity.
 *
 * `WebGLEnvironments.getCube` caches the equirectangular-to-cubemap conversion on the texture and
 * nothing expires it — unlike `getPMREM` beside it, which honours `pmremVersion`. A target redrawn
 * in place therefore hangs the FIRST picture for ever: measured in the sky viewport on 2026-08-26,
 * the backdrop stayed at mean 184.76 across a full source swap and fell to 5.92 once this fired.
 * The conversion three then redoes costs +3.3 ms a value on a dragged exposure (3.09 against 6.36
 * over thirty), paid so the backdrop follows the hand at all.
 *
 * The EVENT and not `dispose()`: `WebGLTextures` listens for it on the render TARGET, never on its
 * texture, so nothing that was just drawn is freed.
 */
function backdropRedrawn(texture: Texture): void {
  if (texture.isRenderTargetTexture) texture.dispatchEvent({ type: 'dispose' })
}

export function createEnvironment(
  port: EnvironmentPort,
  scene: Scene,
  requestRender: () => void,
): ViewportEnvironment {
  /** What was handed in, before grading — `source` is what is shown and prefiltered. */
  let given: Texture | null = null
  let source: Texture | null = null
  let stack: AdjustmentStack = NEUTRAL_ADJUSTMENTS
  let quiet: ReturnType<typeof setTimeout> | null = null
  let prefiltered: PrefilteredMap | null = null
  let backgroundVisible = true
  /** The neutral room, prefiltered on the first ask and kept — see `borrowStudio`. */
  let room: PrefilteredMap | null = null
  /** What the document asks for, so a borrowed pass has something to give back. */
  let owned: Texture | null = null
  let intensity = 1

  /** What this module last hung, so hiding the picture never wipes a backdrop it did not put there. */
  let hung: Texture | null = null

  const applyBackground = (): void => {
    if (backgroundVisible) {
      scene.background = source
      hung = source
      return
    }
    // Ours ALONE: a viewport showing a colour instead wrote it onto `scene.background` itself, and
    // « do not show the picture » is not « show nothing » — a graded sky wiped the chosen colour.
    if (scene.background === hung) scene.background = null
    hung = null
  }

  const regrade = (): void => {
    const shown = given && !isNeutral(stack) ? port.grade(given, stack) : given
    // A target redrawn IN PLACE, which is what both engines hand back: three caches the backdrop's
    // cubemap on the texture and expires it never — see `backdropRedrawn`.
    if (shown !== null && shown === source) backdropRedrawn(shown)

    source = shown
    // The graded target comes off the quad flat: without this it hangs as a plate on the camera.
    if (source) source.mapping = EquirectangularReflectionMapping
    applyBackground()
    requestRender()
  }

  const roomMap = (): Texture => {
    if (!room) {
      const built = new RoomEnvironment()
      room = port.fromScene(built)
      // `fromScene` reads the room and leaves it alone: its dozen boxes and materials are ours.
      built.dispose()
    }
    return room.texture
  }

  const cancelQuiet = (): void => {
    if (quiet !== null) clearTimeout(quiet)
    quiet = null
  }

  const refresh = (): void => {
    // A rebuild already owed is now paid: leaving the timer would prefilter the same map twice.
    cancelQuiet()

    const previous = prefiltered
    prefiltered = source ? port.fromEquirectangular(source) : null
    owned = prefiltered?.texture ?? null
    scene.environment = owned
    // Disposed after the new one is in place, never before: releasing the target still bound
    // to `scene.environment` leaves every material pointing at freed GPU memory for a frame.
    previous?.dispose()
    requestRender()
  }

  const scheduleRefresh = (): void => {
    cancelQuiet()
    quiet = setTimeout(refresh, PMREM_QUIET_MS)
  }

  return {
    setTexture: texture => {
      // Equirectangular unless told otherwise: it is the only shape a generator produces, and
      // a texture left on the default mapping shows as a flat plate stuck to the camera.
      if (texture) texture.mapping = EquirectangularReflectionMapping
      given = texture
      regrade()
    },

    setAdjustments: wanted => {
      // By identity: a document replaces the section it edits rather than writing into it, so the
      // stack of a sky nobody touched is the very same object on every apply.
      if (wanted === stack) return
      const wasNeutral = isNeutral(stack)
      stack = wanted
      // Neutral to neutral changes no pixel, and this runs on every apply of every viewport.
      if (wasNeutral && isNeutral(wanted)) return

      regrade()
      // Only with something to prefilter: fired on a null source, `refresh` drops the room
      // `setStudio` installed, and a sky that then fails to decode leaves the scene unlit for good.
      if (source) scheduleRefresh()
    },

    refresh,

    shownTexture: () => source,

    setStudio: () => {
      // A grading rebuild still owed would put the sky back over the room a beat later.
      cancelQuiet()

      const previous = prefiltered
      // The same room a borrowed pass uses, prefiltered once: asking the generator again here
      // would build a second copy of a map already on the GPU.
      owned = roomMap()
      prefiltered = null
      scene.environment = owned
      previous?.dispose()
      requestRender()
    },

    borrowStudio: studio => {
      scene.environment = studio ? roomMap() : owned
      // The intensity comes with it, or the mode that exists to show a mesh in an unlit scene
      // would render the Night preset's 0.15 — and with the scene's own lights out, near black.
      scene.environmentIntensity = studio ? 1 : intensity
    },

    setIntensity: wanted => {
      // Called on every apply of every viewport, and a frame asked for is a shadow pass owed.
      if (wanted === intensity) return
      intensity = wanted
      scene.environmentIntensity = wanted
      scene.backgroundIntensity = wanted
      requestRender()
    },

    setRotation: radians => {
      if (radians === scene.environmentRotation.y) return
      // Both, and by the same angle: turning the picture without turning what the spheres
      // reflect makes the sun sit in one place and light from another.
      scene.backgroundRotation.y = radians
      scene.environmentRotation.y = radians
      requestRender()
    },

    setBackgroundVisible: visible => {
      if (visible === backgroundVisible) return
      backgroundVisible = visible
      applyBackground()
      requestRender()
    },

    setBackgroundBlur: blur => {
      if (blur === scene.backgroundBlurriness) return
      // Any value above zero routes the backdrop through a PMREM of three's own, built inside the
      // render loop on the first frame that asks — once per sky, cached by texture, not per frame.
      scene.backgroundBlurriness = blur
      requestRender()
    },

    dispose: () => {
      cancelQuiet()
      scene.background = null
      scene.environment = null
      prefiltered?.dispose()
      prefiltered = null
      // The room outlives every sky, so it is freed here and nowhere else.
      room?.dispose()
      room = null
      owned = null
      port.dispose()
    },
  }
}
