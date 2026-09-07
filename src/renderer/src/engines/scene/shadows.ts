import { BasicShadowMap, Box3, Light, Object3D, PCFShadowMap, Vector3 } from 'three'
import type { LightShadow, Matrix4, ShadowMapType } from 'three'
import type { ShadowQuality } from '@shared/domain/scene'
import type { RenderPolicy } from '@shared/domain/renderPolicy'
import { isRecord } from '@shared/guards'
import type { ShadowThrow } from './grouping'

/** The one place the studio's words meet three.js's map types. */
const MAP_TYPES: Record<ShadowQuality, ShadowMapType> = {
  hard: BasicShadowMap,
  soft: PCFShadowMap,
}

/** What of a renderer this reads — narrower than `WebGLRenderer`, which jsdom cannot build. */
type ShadowMapHolder = { shadowMap: { type: ShadowMapType } }

/**
 * Points the renderer at the map type a setting asks for, and nothing more: three.js watches the
 * type itself and recompiles what it has to.
 *
 * It does NOT reach the screen on its own. The scene viewport keeps `autoUpdate` off, so the
 * recompile lives inside a shadow pass that only runs on `needsUpdate` — the caller has to ask
 * for a frame, which `configure` does when the quality moved.
 */
export function applyShadowQuality(renderer: ShadowMapHolder, quality: ShadowQuality): void {
  renderer.shadowMap.type = MAP_TYPES[quality]
}

/**
 * What a renderer is told before it draws a shadow at all — the viewport at mount, a game at
 * creation. 🛑 `autoUpdate` stays OFF: left to itself three.js redraws every map of every casting
 * light on every frame, and the frames that owe one say so instead — `ViewportFrame` for the
 * editor, `draw` for a game.
 */
export function applyShadowPolicy(
  renderer: ShadowMapHolder & { shadowMap: { enabled: boolean; autoUpdate: boolean } },
  policy: Pick<RenderPolicy, 'shadows' | 'shadowQuality'>,
): void {
  renderer.shadowMap.enabled = policy.shadows
  applyShadowQuality(renderer, policy.shadowQuality)
  renderer.shadowMap.autoUpdate = false
}

type ShadowSwitch = { shadowMap: { enabled: boolean } }

/**
 * Turns shadow maps on or off, and makes the change actually reach the screen.
 *
 * `shadowMap.enabled` feeds the program cache key, but three re-reads that key only when a
 * material's own `version` moves or the lights state does — and this flag moves neither.
 * Switched alone it leaves every material still sampling a map nothing updates any more, so the
 * shadows freeze on screen instead of going away. Marking the materials is what closes it, and
 * it runs on the CROSSING alone: a recompile of the whole scene is not something to repeat.
 */
export function applyShadows(renderer: ShadowSwitch, enabled: boolean, root: Object3D): void {
  if (renderer.shadowMap.enabled === enabled) return
  renderer.shadowMap.enabled = enabled

  root.traverse(child => {
    const material: unknown = Reflect.get(child, 'material')
    for (const one of Array.isArray(material) ? material : [material]) {
      if (isMaterial(one)) one.needsUpdate = true
    }
  })
}

function isMaterial(value: unknown): value is { needsUpdate: boolean } {
  return isRecord(value) && 'isMaterial' in value
}

/**
 * The flags a node carries, put on the object that stands for it and on everything under it that
 * is only scenery: three.js reads them per mesh, and a model is one node over a whole imported
 * tree.
 *
 * It stops at a child that stands for a node of its own — `belongsElsewhere`, which has no default
 * on purpose: a caller who forgot it would silently reopen the defect below. A traversal that
 * went through wrote the parent's flags over a child's, and nothing ever put them back: `syncNode`
 * only rewrites them when they changed, and the child's had not. A theme reload replayed the
 * overwrite over the whole scene. A group is the extreme case, all of whose children are nodes.
 */
export function applyShadowFlags(
  object: Object3D,
  cast: boolean,
  receive: boolean,
  belongsElsewhere: (child: Object3D) => boolean,
): void {
  object.castShadow = cast
  object.receiveShadow = receive

  for (const child of object.children) {
    if (belongsElsewhere(child)) continue
    applyShadowFlags(child, cast, receive, belongsElsewhere)
  }
}

/**
 * Reads the engine's map of nodes as the stop condition above: a child stands for a node of its
 * own when the map, at that child's name, holds that very object.
 *
 * Identity rather than the name alone — an imported file names its own objects, and nothing stops
 * one from carrying a string that reads like an id.
 */
export function ownedByAnotherNode(
  objectOf: (id: string) => Object3D | undefined,
): (child: Object3D) => boolean {
  return child => objectOf(child.name) === child
}

/**
 * The side of the square map a light allocates. The map was sized when it was built, so it is
 * dropped rather than resized: three.js only reallocates one it finds missing.
 */
export function resizeShadowMap(object: Object3D, size: number): void {
  if (!castsShadow(object) || object.shadow.mapSize.width === size) return

  object.shadow.mapSize.set(size, size)
  object.shadow.map?.dispose()
  object.shadow.map = null
}

/**
 * What a shadow frustum is cut to: the box the casters occupy, and a floor under its width — the
 * editor's grid, so an empty scene still gets a frustum and the first mesh laid down casts.
 */
export type ShadowFrame = { bounds: Box3; floor: number }

/**
 * How far the shadows of a frame travel — the DIAGONAL of the ground it covers, under the floor:
 * a sun comes in at an angle, and the far corner of a set throws its shadow clear across it.
 */
export function shadowReachOf(bounds: Box3, floor: number): number {
  if (bounds.isEmpty()) return floor

  const size = bounds.getSize(SIZE)
  return Math.max(Math.max(size.x, size.z) * Math.SQRT2, floor)
}

/**
 * Which ways the shadows fall — one direction per casting light, read off its target.
 * Shared by both engines so a cell just out of frame still throws onto the ground the camera sees.
 */
export function throwsOf(
  lights: readonly Object3D[],
  bounds: Box3,
  reach: number,
): ShadowThrow | null {
  const along: { x: number; y: number; z: number }[] = []
  for (const light of lights) {
    const target: unknown = Reflect.get(light, 'target')
    if (target instanceof Object3D) target.getWorldPosition(AT)
    else AT.set(0, 0, 0)
    const direction = AT.sub(light.getWorldPosition(FROM)).normalize()
    if (direction.lengthSq() === 0) continue
    along.push({ x: direction.x, y: direction.y, z: direction.z })
  }
  if (along.length === 0) return null
  return { along, floor: bounds.isEmpty() ? 0 : bounds.min.y, reach }
}

const AT = new Vector3()
const FROM = new Vector3()

/** What a tuning pass settled: the lights it framed, and the reach it framed them to. */
export type TunedShadows = { framed: readonly Object3D[]; reach: number }

/**
 * Sizes every light's shadow map and fits the ones that frame a box to what the scene occupies.
 *
 * Shared by the editor and an exported game rather than written twice: a map sized on one side
 * alone is the same scene lit two ways. `frameOf` is read only when a light would use it — a set
 * lit by point lights alone has no box to size, and measuring one would be a pass for nothing.
 */
export function tuneShadowMaps(
  lights: Iterable<Object3D>,
  size: number,
  frameOf: () => ShadowFrame,
): TunedShadows | null {
  const framed: Object3D[] = []
  for (const light of lights) {
    resizeShadowMap(light, size)
    if (needsShadowFrustum(light)) framed.push(light)
  }
  if (framed.length === 0) return null

  const frame = frameOf()
  for (const light of framed) fitShadowCamera(light, frame)
  return { framed, reach: shadowReachOf(frame.bounds, frame.floor) }
}

/** Leaves unchanged lights out of one viewport shadow pass, then restores export behaviour. */
export function limitShadowUpdates(
  lights: Iterable<Object3D>,
  refreshAll: boolean,
  changed: ReadonlySet<Object3D>,
): () => void {
  const held: { shadow: LightShadow; autoUpdate: boolean }[] = []
  for (const light of lights) {
    if (!castsShadow(light)) continue
    held.push({ shadow: light.shadow, autoUpdate: light.shadow.autoUpdate })
    light.shadow.autoUpdate = refreshAll || changed.has(light)
  }

  return () => {
    for (const { shadow, autoUpdate } of held) shadow.autoUpdate = autoUpdate
  }
}

/**
 * Takes a light's map off three's per-frame redraw for good: from here it is drawn on the pass
 * `oweShadowPass` asks for, and on no other. What a game does once per light, where the editor
 * narrows one pass at a time with `limitShadowUpdates`.
 */
export function holdShadowMap(light: Object3D): void {
  if (castsShadow(light)) light.shadow.autoUpdate = false
}

/** Marks the maps of these lights to be drawn on the next pass the renderer runs. */
export function oweShadowPass(lights: Iterable<Object3D>): void {
  for (const light of lights) oweShadowMap(light)
}

/** The same for one light — read per moved light per frame, so no list is built for it. */
export function oweShadowMap(light: Object3D): void {
  if (castsShadow(light)) light.shadow.needsUpdate = true
}

/**
 * Fits a directional light's shadow frustum to what the scene occupies, seen FROM the light: the
 * box's corners are projected into the light's own view, so a set standing away from the light's
 * target is framed where it stands rather than clipped by a frustum centred on that target — the
 * default frustum is ten units wide around the target, and a set laid down twenty metres off it
 * threw nothing, with no hint as to why.
 *
 * The floor is a minimum width around the box, and the whole width of an empty one: a frustum of
 * width zero projects to Infinity and rasterises nothing. The depth runs from the nearest corner
 * to the farthest plus the reach, so the ground a shadow lands on past the casters is inside it.
 */
export function fitShadowCamera(object: Object3D, frame: ShadowFrame): void {
  if (!needsShadowFrustum(object) || !(object instanceof Light)) return

  const camera = object.shadow.camera
  const fit = frustumFor(object, frame, camera)
  if (sameFrustum(camera, fit)) return

  camera.left = fit.left
  camera.right = fit.right
  camera.top = fit.top
  camera.bottom = fit.bottom
  camera.near = fit.near
  camera.far = fit.far
  // three.js never reads these back on its own, exactly like a perspective `fov`.
  camera.updateProjectionMatrix()
}

type Frustum = Omit<Orthographic, 'updateProjectionMatrix' | 'matrixWorldInverse'>

/** Written into one scratch: the editor fits on every placement, and allocates nothing for it. */
function frustumFor(light: FramedLight, frame: ShadowFrame, held: Frustum): Frustum {
  const floor = Math.max(frame.floor, SLIMMEST)
  if (frame.bounds.isEmpty()) {
    FIT.left = -floor / 2
    FIT.right = floor / 2
    FIT.top = floor / 2
    FIT.bottom = -floor / 2
    FIT.near = held.near
    FIT.far = held.far
    return FIT
  }

  const seen = seenFrom(light, frame.bounds)
  const width = Math.max(seen.max.x - seen.min.x, floor)
  const height = Math.max(seen.max.y - seen.min.y, floor)
  const centreX = (seen.min.x + seen.max.x) / 2
  const centreY = (seen.min.y + seen.max.y) / 2
  FIT.left = centreX - width / 2
  FIT.right = centreX + width / 2
  FIT.top = centreY + height / 2
  FIT.bottom = centreY - height / 2
  // The view looks down -z: the nearest corner is the greatest z, the farthest the least. The
  // depth never falls under three's own default: a low sun lays a shadow far past the casters.
  FIT.near = Math.max(NEAREST, -seen.max.z - 1)
  FIT.far = Math.max(-seen.min.z + shadowReachOf(frame.bounds, frame.floor), FARTHEST)
  return FIT
}

/**
 * The box seen from the light — through the very view three.js draws the shadow pass with,
 * `updateMatrices`: the light's world position looking at its target's. Both matrices are
 * refreshed first, since three reads them as they stand.
 */
function seenFrom(light: FramedLight, bounds: Box3): Box3 {
  light.updateWorldMatrix(true, false)
  const target: unknown = Reflect.get(light, 'target')
  if (target instanceof Object3D) target.updateWorldMatrix(true, false)
  light.shadow.updateMatrices(light)
  return SEEN.copy(bounds).applyMatrix4(light.shadow.camera.matrixWorldInverse)
}

type FramedLight = Light & { shadow: LightShadow & { camera: Orthographic } }

const sameFrustum = (one: Frustum, other: Frustum): boolean =>
  one.left === other.left &&
  one.right === other.right &&
  one.top === other.top &&
  one.bottom === other.bottom &&
  one.near === other.near &&
  one.far === other.far

/** A caster can stand around the light itself: the depth range then starts at the lens. */
const NEAREST = 0.05

/** What `DirectionalLightShadow` builds its camera with, and what every fit used to keep. */
const FARTHEST = 500

/** The narrowest frustum ever written: one of width zero projects to Infinity and draws nothing. */
const SLIMMEST = 1

// Scratch for a fit, which the editor runs on every placement: no allocation on the way.
const SIZE = new Vector3()
const SEEN = new Box3()
const FIT: Frustum = { left: 0, right: 0, top: 0, bottom: 0, near: 0, far: 0 }

/**
 * Whether sizing a frustum for this light means anything — a caller that measures the whole
 * scene to answer `extent` can skip the walk entirely when no light would read it.
 */
export function needsShadowFrustum(
  object: Object3D,
): object is Object3D & { shadow: LightShadow & { camera: Orthographic } } {
  return castsShadow(object) && isOrthographic(object.shadow.camera)
}

// Structural rather than `instanceof`: three exports `LightShadow` as a type alone.
function castsShadow(object: Object3D): object is Object3D & { shadow: LightShadow } {
  return 'shadow' in object && isRecord(object.shadow) && 'mapSize' in object.shadow
}

type Orthographic = {
  left: number
  right: number
  top: number
  bottom: number
  near: number
  far: number
  matrixWorldInverse: Matrix4
  updateProjectionMatrix: () => void
}

/** A spot and a point light shadow through a perspective camera, which has no box to size. */
function isOrthographic(camera: unknown): camera is Orthographic {
  return isRecord(camera) && 'isOrthographicCamera' in camera
}
