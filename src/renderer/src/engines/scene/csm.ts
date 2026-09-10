/**
 * Cascaded shadow maps: the sun's shadow split into one map per depth band of the view, instead
 * of one map stretched over everything the camera sees.
 *
 * OFF unless `RenderPolicy.csm` says otherwise, and that is not a taste. `CSM` adds three
 * directional lights of its own, rewrites a three.js shader chunk for the whole process, and
 * needs a define on every material that receives it — none of which a scene that was authored
 * without cascades may inherit silently.
 */
import { DirectionalLight, Object3D, PerspectiveCamera, type Camera, type Material } from 'three'
import { CSM } from 'three/addons/csm/CSM.js'
import type { RenderPolicy } from '@shared/domain/renderPolicy'
import { VIEW_DISTANCE } from '@shared/domain/renderPolicy'
import { shadowMapSizeFor } from './viewportQuality'
import type { ShadowThrow } from './grouping'

/** What a policy buys: how many bands, how big each map, and how far the last one reaches. */
export type CascadeSettings = { cascades: number; mapSize: number; maxFar: number }

/**
 * Three bands and no setting for it: two leave a visible seam in the middle distance, four cost
 * a depth pass each for a band most sets never fill. The number is what the material's
 * `CSM_CASCADES` define holds, so moving it recompiles every dressed material.
 */
const CASCADES = 3

/**
 * The maps a policy asks for, through the very cap a single shadow map goes through — a quality
 * level that halves one light's map has to halve all three, or the setting means nothing here.
 */
export function cascadeSettingsFor(
  policy: Pick<RenderPolicy, 'quality' | 'shadowMapSize'>,
  reach = VIEW_DISTANCE,
): CascadeSettings {
  return {
    cascades: CASCADES,
    mapSize: shadowMapSizeFor(policy.quality, policy.shadowMapSize),
    // Never past what the camera draws: a band beyond the far plane is a depth pass for pixels
    // that are clipped before they are lit.
    maxFar: reach,
  }
}

export type CascadeShadows = {
  /**
   * Where the sun comes from, off the same reading the ordinary shadow pass fits its frustums
   * with. Nothing at all while the scene has no directional light: with no direction to give,
   * the cascades would light it from three's own default and contradict the lamps on screen.
   */
  aim: (throwing: ShadowThrow | null) => void
  /** The pane about to be drawn. Refits only when that camera is not the one already fitted. */
  follow: (camera: Camera) => void
  /**
   * Walks the scene once: dresses every material that can receive cascades, and takes the
   * document's own directional lights off casting. Both are needed and both are idempotent —
   * a sun still drawing its single map would darken, a second time, everything the bands
   * already darkened.
   */
  dress: (root: Object3D) => void
  /** Puts the scene back exactly as it was: lights out, defines off, materials rebuilt. */
  release: () => void
}

export function createCascadeShadows(
  parent: Object3D,
  settings: CascadeSettings,
  /** Asked for a frame when the cascades moved something the picture shows. */
  requestRender: () => void,
): CascadeShadows {
  const csm = new CSM({
    // Replaced at the first `follow`, which is the pane's own camera. A placeholder rather than
    // nothing: the constructor fits its frustums against whatever it is given.
    camera: PLACEHOLDER,
    parent,
    cascades: settings.cascades,
    maxFar: settings.maxFar,
    shadowMapSize: settings.mapSize,
  })
  // A cascade light is drawn on the pass the engine asks for, like every other one — the scene
  // viewport keeps `shadowMap.autoUpdate` off, and a map left on three's own cadence would be
  // the only thing in the frame redrawn sixty times a second.
  for (const light of csm.lights) light.shadow.autoUpdate = false

  /** What was dressed, so a scene of ten thousand meshes is walked without dressing twice. */
  const dressed = new WeakSet<Material>()
  /** The suns that were casting when the cascades took over, to be given their maps back. */
  const held = new Set<DirectionalLight>()
  const own = new Set<Object3D>(csm.lights)
  let fitted: Camera | null = null

  return {
    aim: throwing => {
      const along = throwing?.along[0]
      if (!along) return
      if (csm.lightDirection.x === along.x && csm.lightDirection.z === along.z) return

      csm.lightDirection.set(along.x, along.y, along.z).normalize()
      csm.updateFrustums()
      requestRender()
    },

    follow: camera => {
      // The identity, not the matrix: a quad layout hands four cameras and each one wants its
      // own bands, while an orbit on one camera moves the position the update already reads.
      if (fitted !== camera) {
        csm.camera = camera
        csm.updateFrustums()
        fitted = camera
      }
      csm.update()
      for (const light of csm.lights) light.shadow.needsUpdate = true
    },

    dress: root => {
      root.traverse(child => {
        if (child instanceof DirectionalLight && !own.has(child)) {
          if (child.castShadow) held.add(child)
          child.castShadow = false
        }
        for (const material of materialsOf(child)) {
          if (dressed.has(material) || !receivesCascades(material)) continue
          dressed.add(material)
          csm.setupMaterial(material)
          // The addon leaves this out, and a define written onto a material already compiled
          // reaches no program: a scene switched to cascades mid-session went on drawing the
          // sun's single map until something else invalidated it.
          material.needsUpdate = true
        }
      })
    },

    release: () => {
      // `dispose` deletes the hook and the defines off every material it dressed and marks them
      // for a rebuild; `remove` takes the three lights and their targets out of the scene.
      csm.dispose()
      csm.remove()
      for (const light of held) light.castShadow = true
      held.clear()
      fitted = null
      requestRender()
    },
  }
}

/**
 * Whether a material may be dressed. Anything already carrying an `onBeforeCompile` is left
 * alone: `setupMaterial` OVERWRITES that hook and `dispose` deletes it outright, so the relief
 * splat — the one material of the scene with a patch of its own — would lose its program for
 * good. A lit material only: a helper's line or a sprite receives no shadow to cascade.
 */
function receivesCascades(material: Material): boolean {
  // `hasOwn` rather than a comparison: three declares the hook on `Material.prototype`, so a
  // material carries one of its OWN exactly when somebody assigned it.
  return 'isMeshStandardMaterial' in material && !Object.hasOwn(material, 'onBeforeCompile')
}

function materialsOf(object: Object3D): readonly Material[] {
  const material: unknown = Reflect.get(object, 'material')
  if (Array.isArray(material)) return material
  return isMaterial(material) ? [material] : []
}

function isMaterial(value: unknown): value is Material {
  return typeof value === 'object' && value !== null && 'isMaterial' in value
}

/** Fitted against nothing until the first pane says which camera it draws with. */
const PLACEHOLDER = new PerspectiveCamera()
