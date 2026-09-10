import {
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from 'three'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_RENDER_POLICY } from '@shared/domain/renderPolicy'
import { cascadeSettingsFor, createCascadeShadows } from './csm'

const settings = cascadeSettingsFor(DEFAULT_RENDER_POLICY)

function litScene(): { scene: Scene; sun: DirectionalLight; mesh: Mesh } {
  const scene = new Scene()
  const sun = new DirectionalLight()
  sun.castShadow = true
  const mesh = new Mesh(undefined, new MeshStandardMaterial())
  scene.add(sun, mesh)
  return { scene, sun, mesh }
}

describe('what a policy buys in cascades', () => {
  it('caps the maps by the quality level, exactly as a single shadow map is capped', () => {
    const asked = { ...DEFAULT_RENDER_POLICY, shadowMapSize: 4096 }

    expect(cascadeSettingsFor({ ...asked, quality: 'high' }).mapSize).toBe(4096)
    expect(cascadeSettingsFor({ ...asked, quality: 'performance' }).mapSize).toBeLessThan(4096)
  })

  it('never reaches past what the camera draws', () => {
    expect(cascadeSettingsFor(DEFAULT_RENDER_POLICY, 300).maxFar).toBe(300)
  })
})

describe('cascaded shadows on a scene', () => {
  it('lights the scene with one shadow-casting light per band', () => {
    const { scene, sun } = litScene()
    createCascadeShadows(scene, settings, () => {})

    expect(cascadeLightsOf(scene, sun).filter(light => light.castShadow)).toHaveLength(
      settings.cascades,
    )
  })

  it('takes the scene sun off casting, so nothing is darkened twice', () => {
    const { scene, sun } = litScene()
    const shadows = createCascadeShadows(scene, settings, () => {})

    shadows.dress(scene)

    expect(sun.castShadow).toBe(false)
  })

  it('stands in for the sun rather than lighting beside it', () => {
    // Three lights of their own at three's default intensity would add nine units of white on
    // top of a scene lit by one — the picture jumps the moment the option is switched on.
    const { scene, sun } = litScene()
    sun.intensity = 2
    sun.color.set('#ff8800')
    const shadows = createCascadeShadows(scene, settings, () => {})

    shadows.dress(scene)

    expect(sun.intensity).toBe(0)
    for (const band of cascadeLightsOf(scene, sun)) {
      expect(band.intensity).toBe(2)
      expect(band.color.getHexString()).toBe('ff8800')
    }
  })

  it('gives the sun back its light and its map when the cascades go', () => {
    const { scene, sun } = litScene()
    sun.intensity = 2
    const shadows = createCascadeShadows(scene, settings, () => {})
    shadows.dress(scene)

    shadows.release()

    expect(sun.intensity).toBe(2)
    expect(sun.castShadow).toBe(true)
    expect(scene.children.filter(child => child instanceof DirectionalLight)).toEqual([sun])
  })

  it('marks a dressed material for a rebuild: a define alone reaches no program', () => {
    const { scene, mesh } = litScene()
    const material = oneMaterialOf(mesh)
    material.needsUpdate = false
    const shadows = createCascadeShadows(scene, settings, () => {})

    shadows.dress(scene)

    expect(material.defines?.USE_CSM).toBe(1)
    expect(material.version).toBeGreaterThan(0)
  })

  it('composes with a material that carries a patch of its own', () => {
    // The relief splat is the one that does: it rewrites `map_fragment` where cascades read
    // `lights_fragment_begin`, so terrain must receive both rather than lose either.
    const { scene, mesh } = litScene()
    const material = oneMaterialOf(mesh)
    const own = vi.fn()
    material.onBeforeCompile = own
    const shadows = createCascadeShadows(scene, settings, () => {})

    shadows.dress(scene)
    material.onBeforeCompile(shaderStub(), rendererStub())

    expect(own).toHaveBeenCalledOnce()
    expect(material.defines?.USE_CSM).toBe(1)
  })

  it('hands that patch back when the cascades go', () => {
    const { scene, mesh } = litScene()
    const material = oneMaterialOf(mesh)
    const own = () => {}
    material.onBeforeCompile = own
    const shadows = createCascadeShadows(scene, settings, () => {})
    shadows.dress(scene)

    shadows.release()

    expect(material.onBeforeCompile).toBe(own)
  })

  it('dresses a material again once something has rebound its patch', () => {
    const { scene, mesh } = litScene()
    const material = oneMaterialOf(mesh)
    const shadows = createCascadeShadows(scene, settings, () => {})
    shadows.dress(scene)
    // What `bindReliefSplat` does when the ground is painted again: it writes over the hook.
    const rebound = vi.fn()
    material.onBeforeCompile = rebound

    shadows.dress(scene)
    material.onBeforeCompile(shaderStub(), rendererStub())

    expect(rebound).toHaveBeenCalledOnce()
  })

  it('cuts each band a frustum of its own out of the camera it follows', () => {
    const { scene, sun } = litScene()
    const shadows = createCascadeShadows(scene, settings, () => {})
    const camera = new PerspectiveCamera()
    camera.position.set(0, 4, 12)

    shadows.follow(camera)

    // Growing, near band to far one: a set close to the eye is framed tightly and gets the
    // texels a single map stretched over the whole view could never give it.
    const widths = cascadeLightsOf(scene, sun).map(light => light.shadow.camera.right)
    expect(widths).toHaveLength(settings.cascades)
    expect([...widths].sort((one, other) => one - other)).toEqual(widths)
  })

  it('turns the cascades to where the scene says the light comes from', () => {
    const { scene, sun } = litScene()
    const shadows = createCascadeShadows(scene, settings, () => {})

    shadows.aim({ along: [{ x: 0, y: -1, z: 0 }], floor: 0, reach: 50 })
    shadows.follow(new PerspectiveCamera())

    const cascade = cascadeLightsOf(scene, sun)[0]
    const aimed = cascade?.target.position.clone().sub(cascade.position)
    expect(aimed?.normalize().y).toBeCloseTo(-1)
  })
})

function oneMaterialOf(mesh: Mesh): MeshStandardMaterial {
  const material = mesh.material
  if (Array.isArray(material) || !(material instanceof MeshStandardMaterial)) {
    throw new Error('this mesh was built with one standard material')
  }
  return material
}

/**
 * The two arguments three hands a compile hook. `as` twice: what the hooks under test do with
 * them is call each other, and neither a program nor a renderer can be built under node.
 */
function shaderStub(): WebGLProgramParametersWithUniforms {
  return { uniforms: {} } as WebGLProgramParametersWithUniforms
}

function rendererStub(): WebGLRenderer {
  return {} as WebGLRenderer
}

/** The lights the cascades brought — everything directional in the scene but the document's sun. */
function cascadeLightsOf(scene: Scene, sun: DirectionalLight): readonly DirectionalLight[] {
  return scene.children.filter(
    (child): child is DirectionalLight => child instanceof DirectionalLight && child !== sun,
  )
}
