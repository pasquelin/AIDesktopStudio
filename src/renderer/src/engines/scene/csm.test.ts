import { DirectionalLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene } from 'three'
import { describe, expect, it } from 'vitest'
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

  it('gives the sun its own map back when the cascades go', () => {
    const { scene, sun } = litScene()
    const shadows = createCascadeShadows(scene, settings, () => {})
    shadows.dress(scene)

    shadows.release()

    expect(sun.castShadow).toBe(true)
    expect(scene.children.filter(child => child instanceof DirectionalLight)).toEqual([sun])
  })

  it('marks a dressed material for a rebuild: a define alone reaches no program', () => {
    const { scene, mesh } = litScene()
    const material = mesh.material
    if (Array.isArray(material)) throw new Error('one material')
    material.needsUpdate = false
    const shadows = createCascadeShadows(scene, settings, () => {})

    shadows.dress(scene)

    expect(material.defines?.USE_CSM).toBe(1)
    expect(material.version).toBeGreaterThan(0)
  })

  it('leaves a material that carries a patch of its own alone', () => {
    const { scene, mesh } = litScene()
    const material = mesh.material
    if (Array.isArray(material)) throw new Error('one material')
    const patch = () => {}
    material.onBeforeCompile = patch
    const shadows = createCascadeShadows(scene, settings, () => {})

    shadows.dress(scene)

    expect(material.onBeforeCompile).toBe(patch)
    expect(material.defines?.USE_CSM).toBeUndefined()
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

/** The lights the cascades brought — everything directional in the scene but the document's sun. */
function cascadeLightsOf(scene: Scene, sun: DirectionalLight): readonly DirectionalLight[] {
  return scene.children.filter(
    (child): child is DirectionalLight => child instanceof DirectionalLight && child !== sun,
  )
}
