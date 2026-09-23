/**
 * Cascaded shadow maps: the sun's shadow split into one map per depth band of the view, instead
 * of one map stretched over everything the camera sees.
 *
 * OFF unless `RenderPolicy.csm` says otherwise, and that is not a taste. `CSM` adds three
 * directional lights of its own, rewrites a three.js shader chunk for the whole process, and
 * needs a define on every material that receives it — none of which a scene that was authored
 * without cascades may inherit silently.
 */
import {
  DirectionalLight,
  Matrix4,
  PerspectiveCamera,
  Vector3,
  type Camera,
  type Material,
  type Object3D,
} from 'three'
import { CSM } from 'three/addons/csm/CSM.js'
import type { RenderEngine } from '@shared/domain/renderEngine'
import type { RenderPolicy } from '@shared/domain/renderPolicy'
import { VIEW_DISTANCE } from '@shared/domain/renderPolicy'
import { shadowMapSizeFor } from './viewportQuality'
import { materialsOf } from './shadows'
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
 * Whether this scene is to be given cascades at all: what the policy asks for, AND what the
 * engine drawing it can put on screen.
 *
 * 🛑 The Compatible engine alone. `CSM` works through `onBeforeCompile`, a hook only
 * `WebGLRenderer` calls — three 0.185 names it nowhere under `renderers/common` or
 * `renderers/webgpu`. Built on the Advanced engine the patch would reach no program, while
 * `dress` would still take the document's sun off lighting and put three bands at its intensity
 * in its place: the scene lit three times and its shadow gone, which is the very fault the GL
 * path was fixed for on 2026-09-08. Refused rather than drawn wrong. **Not measured** — what an
 * Advanced scene under cascades looks like was never rendered, here or in the parity harness.
 */
export function cascadesWanted(
  policy: Pick<RenderPolicy, 'csm' | 'shadows'>,
  engine: RenderEngine,
): boolean {
  return policy.csm && policy.shadows && engine === 'gl'
}

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
  /**
   * The pane about to be drawn, and whether the bands moved — which is what tells the frame its
   * shadow maps are worth drawing again, exactly as a display mode does. Cascades follow the
   * EYE, so an orbit alone moves them, and the frame gates the whole shadow pass on this answer.
   */
  follow: (camera: Camera) => boolean
  /**
   * Walks the scene once: dresses every material that can receive cascades, and takes the
   * document's own directional lights off casting. Both are needed and both are idempotent —
   * a sun still drawing its single map would darken, a second time, everything the bands
   * already darkened.
   */
  dress: (root: Object3D) => void
  /**
   * Puts the SCENE back: lights out, defines off, patches handed back, materials rebuilt. Not
   * the process — `CSM` rewrites `ShaderChunk.lights_fragment_begin` for good, and nothing in
   * the addon restores it. Guarded by `USE_CSM`, so a material nobody dressed is unchanged.
   */
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

  /**
   * Per dressed material, the hook it carried before and the composed one installed over it.
   * Read as the DRESSED test: a material whose hook is no longer ours has been rebound since —
   * `bindReliefSplat` does exactly that when the ground is painted again — so it is dressed again.
   */
  const patched = new WeakMap<Material, { own: MaterialHook | null; composed: MaterialHook }>()
  /**
   * The sun the bands STAND IN FOR, and what it was lighting with before they did.
   *
   * Cascades are three directional lights of their own: left beside a sun that goes on lighting,
   * the scene gains their intensity on top of its own — and `CSM`'s default is 3 a piece. So the
   * first sun hands over its colour and its strength and stops lighting; a second one is left
   * exactly as the document wrote it.
   */
  let stood: StoodFor | null = null
  const own = new Set<Object3D>(csm.lights)
  /** Where `update` last put each cascade light — see `follow`, which redraws on the move. */
  const placed = csm.lights.map(light => light.position.clone())
  /** The projection the bands were cut out of, which is all `updateFrustums` reads of a camera. */
  const fitted = new Matrix4()

  return {
    aim: throwing => {
      const along = throwing?.along[0]
      if (!along) return

      // Compared AFTER normalising and on all three axes: `lightDirection` is kept normalised,
      // so measuring the raw reading against it refits on every pass — and a sun that only
      // rises, moving in `y` alone, refitted on none.
      AIMED.set(along.x, along.y, along.z).normalize()
      if (csm.lightDirection.equals(AIMED)) return

      csm.lightDirection.copy(AIMED)
      csm.updateFrustums()
      requestRender()
    },

    follow: camera => {
      csm.camera = camera
      // The PROJECTION and not the camera's identity: a zoom or a resize moves the frustum
      // under the same object, and bands left cut for the previous lens shadow the wrong depths.
      //
      // 🛑 A quad layout pays this on EVERY pane: its three extra views own their own cameras
      // (`ExtraPane`), so the projection differs from the one fitted a moment ago and the bands
      // are cut again — `updateFrustums` walks every dressed material, and the three maps are
      // then owed a pass. That is the price of ONE `CSM` shared by four panes, not waste: the
      // bands have to belong to the camera being drawn. **Not measured.**
      const refitted = !fitted.equals(camera.projectionMatrix)
      if (refitted) {
        csm.updateFrustums()
        fitted.copy(camera.projectionMatrix)
      }
      csm.update()
      if (!refitted && !lightsMoved(csm.lights, placed)) return false

      // Their own `autoUpdate` is off like every other light's, so a moved band has to ask.
      for (const light of csm.lights) light.shadow.needsUpdate = true
      return true
    },

    dress: root => {
      root.traverse(child => {
        if (child instanceof DirectionalLight && !own.has(child)) {
          stood = standFor(csm.lights, child, stood)
        }
        for (const material of materialsOf(child)) {
          if (!receivesCascades(material)) continue
          if (patched.get(material)?.composed === material.onBeforeCompile) continue
          dressOne(csm, patched, material)
        }
      })
    },

    release: () => {
      // Read BEFORE `dispose`, which deletes the hook off every material it dressed: after it,
      // nothing on the material says any more whether the patch there was ours to take back.
      const restoring: { material: Material; own: MaterialHook }[] = []
      parent.traverse(child => {
        for (const material of materialsOf(child)) {
          const held = patched.get(material)
          // Only what is still OURS: `clearReliefSplat` puts its own hook back when the terrain
          // goes, and writing over that would reinstall a patch whose uniforms are gone.
          if (held?.own && material.onBeforeCompile === held.composed) {
            restoring.push({ material, own: held.own })
          }
          patched.delete(material)
        }
      })
      // `dispose` deletes the hook and the defines off every material it dressed and marks them
      // for a rebuild; `remove` takes the three lights and their targets out of the scene.
      csm.dispose()
      csm.remove()
      for (const { material, own } of restoring) material.onBeforeCompile = own
      if (stood) {
        stood.light.castShadow = stood.castShadow
        stood.light.intensity = stood.intensity
        stood = null
      }
      fitted.identity()
      requestRender()
    },
  }
}

type MaterialHook = Material['onBeforeCompile']

/** What a band replaced, so the sun can be given its light and its map back. */
type StoodFor = { light: DirectionalLight; castShadow: boolean; intensity: number }

/**
 * The bands take a sun's place. Idempotent, and it has to be: `dress` runs on every pass, and a
 * light the document has just rewritten carries an intensity again — which is the reading to
 * keep, not the zero this left behind. A SECOND sun is left exactly as the document wrote it.
 */
function standFor(
  bands: readonly DirectionalLight[],
  light: DirectionalLight,
  stood: StoodFor | null,
): StoodFor | null {
  const previous = releasedIfGone(stood, light)
  if (previous && previous.light !== light) return previous
  const held = previous ?? { light, castShadow: light.castShadow, intensity: light.intensity }
  if (previous && light.intensity !== 0) held.intensity = light.intensity

  for (const band of bands) {
    band.color.copy(light.color)
    // Not divided: the patched chunk lights a fragment from ONE band, the one its depth falls
    // in — see `CSMShader.lights_fragment_begin`, which masks `RE_Direct` per cascade.
    band.intensity = held.intensity
  }
  light.castShadow = false
  light.intensity = 0
  return held
}

/**
 * The sun the bands stand for, or `null` where it has LEFT the document — handed back what it
 * had on the way out, so a light reused elsewhere is not stuck at zero.
 *
 * 🛑 Without it, deleting the sun and adding another lights the scene TWICE: the bands keep the
 * dead light's colour and intensity while the new sun keeps its own, and `release` then restores
 * a light no document holds. A second sun standing beside the first is a different case and is
 * left exactly as the document wrote it.
 */
function releasedIfGone(stood: StoodFor | null, light: DirectionalLight): StoodFor | null {
  if (!stood || stood.light === light || stood.light.parent !== null) return stood
  stood.light.castShadow = stood.castShadow
  stood.light.intensity = stood.intensity
  return null
}

/** Whether `update` moved a band since the last frame — the reading `placed` is refreshed from. */
function lightsMoved(bands: readonly DirectionalLight[], placed: readonly Vector3[]): boolean {
  let moved = false
  for (const [at, band] of bands.entries()) {
    const held = placed[at]
    if (!held || held.equals(band.position)) continue
    held.copy(band.position)
    moved = true
  }
  return moved
}

/**
 * Cascades on top of whatever the material already did. `setupMaterial` OVERWRITES the hook, so
 * the relief splat — the one material of a scene with a patch of its own — would lose its
 * program. The two compose: the splat rewrites `map_fragment` and `normal_fragment_maps`,
 * cascades add uniforms and read `lights_fragment_begin`.
 */
function dressOne(
  csm: CSM,
  patched: WeakMap<Material, { own: MaterialHook | null; composed: MaterialHook }>,
  material: Material,
): void {
  const before = ownHookOf(material)
  csm.setupMaterial(material)
  const cascade = material.onBeforeCompile
  const composed: MaterialHook = before
    ? (shader, renderer) => {
        cascade.call(material, shader, renderer)
        before.call(material, shader, renderer)
      }
    : cascade
  material.onBeforeCompile = composed
  patched.set(material, { own: before, composed })
  // The addon leaves this out, and a define written onto a material already compiled reaches no
  // program: a scene switched to cascades mid-session went on drawing the sun's single map until
  // something else invalidated it.
  material.needsUpdate = true
}

/** A lit material only: a helper's line or a sprite receives no shadow to cascade. */
function receivesCascades(material: Material): boolean {
  return 'isMeshStandardMaterial' in material
}

/**
 * The hook a material carries of its OWN, or nothing. `hasOwn` rather than a comparison: three
 * declares one on `Material.prototype`, so a material has its own exactly when somebody assigned
 * it — and calling the prototype's empty body on every compile would be work for nothing.
 */
function ownHookOf(material: Material): MaterialHook | null {
  return Object.hasOwn(material, 'onBeforeCompile') ? material.onBeforeCompile : null
}

/** Fitted against nothing until the first pane says which camera it draws with. */
const PLACEHOLDER = new PerspectiveCamera()

/** Scratch: `aim` runs on every tuning pass, and allocates nothing on the way. */
const AIMED = new Vector3()
