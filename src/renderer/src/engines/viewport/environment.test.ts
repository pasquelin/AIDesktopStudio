import { Color, EquirectangularReflectionMapping, Scene, Texture } from 'three'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { NEUTRAL_ADJUSTMENTS } from '@shared/domain/adjustments'
import {
  createEnvironment,
  PMREM_QUIET_MS,
  type EnvironmentPort,
  type ViewportEnvironment,
} from './environment'

/**
 * Prefiltering renders a mip chain and grading draws a quad: both need a device jsdom cannot
 * give, and both are what the PORT stands for. The stand-in hands back a target carrying a
 * recognisable texture, so the tests can follow which map the scene reads and when it is freed.
 */
type FakeTarget = { texture: Texture; dispose: Mock<() => void>; boundWhenFreed: boolean }

const targets: FakeTarget[] = []

/** The scene the environment under test was handed, captured rather than assumed. */
let watched: Scene | null = null

const newTarget = (): FakeTarget => {
  const target: FakeTarget = {
    texture: new Texture(),
    // Recorded at the moment of the call: whether the scene was still reading this map when it
    // was freed cannot be known afterwards, and that is the whole question.
    dispose: vi.fn(() => {
      target.boundWhenFreed = watched?.environment === target.texture
    }),
    boundWhenFreed: false,
  }
  targets.push(target)
  return target
}

const fromEquirectangular = vi.fn(() => newTarget())
const fromScene = vi.fn(() => newTarget())
const disposeGenerator = vi.fn()

/**
 * The graded picture, so a test can tell it apart from the source it was made of. A RENDER TARGET
 * texture, which is what the grading pass hands back — and what three caches a backdrop's cubemap
 * on, for ever, unless something says it was redrawn.
 */
const graded = Object.assign(new Texture(), { isRenderTargetTexture: true })
const gradeOf = vi.fn(() => graded)

const port: EnvironmentPort = {
  fromEquirectangular,
  fromScene,
  grade: gradeOf,
  dispose: disposeGenerator,
}

describe('the environment of a viewport', () => {
  let scene: Scene
  let requestRender: Mock<() => void>

  beforeEach(() => {
    targets.length = 0
    vi.clearAllMocks()
    scene = new Scene()
    watched = scene
    requestRender = vi.fn<() => void>()
  })

  const environmentOf = (): ViewportEnvironment => createEnvironment(port, scene, requestRender)

  const withPrefilteredMap = (): ViewportEnvironment => {
    const environment = environmentOf()
    environment.setTexture(new Texture())
    environment.refresh()
    return environment
  }

  it('shows a picture behind the scene, on the mapping a sky is drawn with', () => {
    const environment = environmentOf()
    const sky = new Texture()

    environment.setTexture(sky)

    expect(sky.mapping).toBe(EquirectangularReflectionMapping)
    expect(scene.background).toBe(sky)
  })

  it('takes the picture away when the source goes', () => {
    const environment = environmentOf()
    environment.setTexture(new Texture())

    environment.setTexture(null)

    expect(scene.background).toBeNull()
  })

  /**
   * Hiding the background must not lose the source: the reflections keep coming from it, and
   * showing it again has to work without the caller handing the texture over a second time.
   */
  it('keeps the source while the background is hidden, and puts it back', () => {
    const environment = environmentOf()
    const sky = new Texture()
    environment.setTexture(sky)

    environment.setBackgroundVisible(false)
    expect(scene.background).toBeNull()

    environment.setBackgroundVisible(true)
    expect(scene.background).toBe(sky)
  })

  it('softens the picture without touching what the materials reflect', () => {
    const environment = withPrefilteredMap()
    const reflected = scene.environment

    environment.setBackgroundBlur(0.6)

    expect(scene.backgroundBlurriness).toBe(0.6)
    expect(scene.environment).toBe(reflected)
  })

  it('leaves the background hidden when a new source arrives', () => {
    const environment = environmentOf()
    environment.setBackgroundVisible(false)

    environment.setTexture(new Texture())

    expect(scene.background).toBeNull()
  })

  it('prefilters the source into what the materials reflect', () => {
    const environment = environmentOf()
    const sky = new Texture()
    environment.setTexture(sky)

    environment.refresh()

    expect(fromEquirectangular).toHaveBeenCalledWith(sky)
    expect(scene.environment).toBe(targets[0]?.texture)
  })

  /**
   * The order is the point, not the disposal: freeing the old target before the new one is in
   * place leaves every material reflecting freed GPU memory for a frame.
   */
  it('frees the previous map only once the new one is in place', () => {
    const environment = withPrefilteredMap()
    expect(targets[0]?.dispose).not.toHaveBeenCalled()

    environment.refresh()

    expect(targets[0]?.dispose).toHaveBeenCalled()
    expect(targets[0]?.boundWhenFreed).toBe(false)
    expect(scene.environment).toBe(targets[1]?.texture)
  })

  it('reflects nothing when there is no source to prefilter', () => {
    const environment = environmentOf()

    environment.refresh()

    expect(fromEquirectangular).not.toHaveBeenCalled()
    expect(scene.environment).toBeNull()
  })

  // No HDRI ships with the studio: a brand new project still has to light a material.
  it('lights the scene from a neutral room when asked for the studio', () => {
    const environment = environmentOf()

    environment.setStudio()

    expect(fromScene).toHaveBeenCalled()
    expect(scene.environment).toBe(targets[0]?.texture)
  })

  it('frees the previous map when the studio replaces it, and not before', () => {
    const environment = withPrefilteredMap()

    environment.setStudio()

    expect(targets[0]?.dispose).toHaveBeenCalled()
    expect(targets[0]?.boundWhenFreed).toBe(false)
  })

  // Both, or the sun sits in one place and lights from another.
  it('turns the picture and what the scene reflects by the same angle', () => {
    const environment = environmentOf()

    environment.setRotation(1.5)

    expect(scene.backgroundRotation.y).toBe(1.5)
    expect(scene.environmentRotation.y).toBe(1.5)
  })

  it('dims the picture and what the scene reflects together', () => {
    const environment = environmentOf()

    environment.setIntensity(0.4)

    expect(scene.backgroundIntensity).toBe(0.4)
    expect(scene.environmentIntensity).toBe(0.4)
  })

  /**
   * The viewport only draws when something asks it to. A setter that changes what is on screen
   * without asking leaves the panel showing the previous value until some unrelated frame.
   */
  it('asks for a frame after every change it makes', () => {
    const environment = environmentOf()
    const changes: (() => void)[] = [
      () => environment.setTexture(new Texture()),
      () => environment.refresh(),
      () => environment.setStudio(),
      () => environment.setIntensity(0.5),
      () => environment.setRotation(0.5),
      () => environment.setBackgroundVisible(false),
    ]

    for (const change of changes) {
      requestRender.mockClear()
      change()
      expect(requestRender).toHaveBeenCalled()
    }
  })

  describe('the grading a sky document asks for', () => {
    const GRADED = { ...NEUTRAL_ADJUSTMENTS, exposure: 1 }

    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('hangs the source untouched while nothing is graded, building no pass at all', () => {
      const environment = environmentOf()
      const sky = new Texture()

      environment.setAdjustments(NEUTRAL_ADJUSTMENTS)
      environment.setTexture(sky)

      expect(gradeOf).not.toHaveBeenCalled()
      expect(scene.background).toBe(sky)
    })

    it('hangs and prefilters the GRADED picture, on the mapping a sky is drawn with', () => {
      const environment = environmentOf()
      environment.setTexture(new Texture())

      environment.setAdjustments(GRADED)

      expect(scene.background).toBe(graded)
      expect(graded.mapping).toBe(EquirectangularReflectionMapping)

      environment.refresh()
      expect(fromEquirectangular).toHaveBeenCalledWith(graded)
    })

    it('grades a picture that arrives after the stack did', () => {
      const environment = environmentOf()
      environment.setAdjustments(GRADED)

      environment.setTexture(new Texture())

      expect(scene.background).toBe(graded)
    })

    /**
     * The whole reason the two halves are split: a slider dragged in the sky's tab emits a value
     * a frame, and a mip chain per value drops the viewport to single digits.
     */
    it('follows the hand on the picture and prefilters once the drag settles', () => {
      const environment = environmentOf()
      environment.setTexture(new Texture())

      environment.setAdjustments(GRADED)
      environment.setAdjustments({ ...GRADED, exposure: 2 })
      expect(fromEquirectangular).not.toHaveBeenCalled()

      vi.advanceTimersByTime(PMREM_QUIET_MS)
      expect(fromEquirectangular).toHaveBeenCalledTimes(1)
    })

    it('does not prefilter twice when a refresh lands before the quiet is out', () => {
      const environment = environmentOf()
      environment.setTexture(new Texture())
      environment.setAdjustments(GRADED)

      environment.refresh()
      vi.advanceTimersByTime(PMREM_QUIET_MS)

      expect(fromEquirectangular).toHaveBeenCalledTimes(1)
    })

    // The stack of a sky nobody has touched is the same object on every apply of every frame.
    it('grades nothing again for a stack it already holds', () => {
      const environment = environmentOf()
      environment.setTexture(new Texture())
      environment.setAdjustments(GRADED)
      gradeOf.mockClear()

      environment.setAdjustments(GRADED)

      expect(gradeOf).not.toHaveBeenCalled()
    })

    it('puts the room back over a grading rebuild that was still owed', () => {
      const environment = environmentOf()
      environment.setTexture(new Texture())
      environment.setAdjustments(GRADED)

      environment.setStudio()
      vi.advanceTimersByTime(PMREM_QUIET_MS)

      expect(fromEquirectangular).not.toHaveBeenCalled()
      expect(scene.environment).toBe(targets[0]?.texture)
    })

    /**
     * Found by looking at the sky viewport, with every gate green: `WebGLEnvironments.getCube`
     * caches the equirectangular-to-cubemap conversion of a backdrop on the texture and expires it
     * never, so a target redrawn in place hung the FIRST picture for ever — mean 184.76 across a
     * full source swap, 5.92 once this fires.
     */
    it('says a backdrop redrawn in place is not the picture three already converted', () => {
      const environment = environmentOf()
      const dropped = vi.fn()
      graded.addEventListener('dispose', dropped)
      environment.setTexture(new Texture())
      environment.setAdjustments(GRADED)
      expect(dropped).not.toHaveBeenCalled()

      environment.setAdjustments({ ...GRADED, exposure: 2 })

      expect(dropped).toHaveBeenCalled()
      graded.removeEventListener('dispose', dropped)
    })

    /**
     * A viewport whose backdrop is a COLOUR wrote it onto `scene.background` itself. Grading the
     * sky it is lit by must not wipe it: « do not show the picture » is not « show nothing ».
     */
    it('leaves a backdrop it did not hang alone', () => {
      const environment = environmentOf()
      environment.setTexture(new Texture())
      environment.setBackgroundVisible(false)
      const chosen = new Color('#123456')
      scene.background = chosen

      environment.setAdjustments(GRADED)

      expect(scene.background).toBe(chosen)
    })

    /**
     * Fired on a null source, `refresh` drops the room `setStudio` installed — and a sky that then
     * fails to decode would leave the scene with no image-based light at all.
     */
    it('prefilters nothing while the picture is still decoding', () => {
      const environment = environmentOf()
      environment.setStudio()
      const room = scene.environment

      environment.setAdjustments(GRADED)
      vi.advanceTimersByTime(PMREM_QUIET_MS)

      expect(scene.environment).toBe(room)
    })

    // The pass belongs to the ENGINE now, not to the environment: whoever built the port frees
    // it — see `glDriver`, which owns the grading and the generator together.
    it('frees the engine port it was built on', () => {
      const environment = environmentOf()
      environment.setTexture(new Texture())
      environment.setAdjustments(GRADED)

      environment.dispose()

      expect(disposeGenerator).toHaveBeenCalled()
    })
  })

  it('leaves the scene holding nothing, and frees what it built', () => {
    const environment = withPrefilteredMap()

    environment.dispose()

    expect(scene.background).toBeNull()
    expect(scene.environment).toBeNull()
    expect(targets[0]?.dispose).toHaveBeenCalled()
    expect(disposeGenerator).toHaveBeenCalled()
  })

  it('disposes without a map to free', () => {
    environmentOf().dispose()

    expect(disposeGenerator).toHaveBeenCalled()
  })
})
