import {
  CameraHelper,
  DirectionalLight,
  HemisphereLight,
  Line,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  SpotLight,
  type BufferGeometry,
  type Light,
  type Object3D,
  type PerspectiveCamera,
  type SpriteMaterial,
} from 'three'
import type {
  CameraDescriptor,
  GeometryDescriptor,
  LightDescriptor,
  MaterialDescriptor,
  PathDescriptor,
  SpriteDescriptor,
  Vector3,
} from '@shared/domain/scene'
import { pathPoints } from './cameraPath'
import {
  bareLight,
  dressWithRail,
  geometryFor,
  HANDLE_BAR_PREFIX,
  handlePartOf,
  isRailAid,
  knobIndexOf,
  knobName,
  placeHandles,
  PATH_CURVE_NAME,
  PATH_KNOB_PREFIX,
} from './threeFactory'
import { tileUvs } from './uvTiling'

const UNBOUNDED_POINT_SHADOW_FAR = 500

/*
 * Bringing an existing three.js object in line with an edited descriptor — the other half of
 * `three-factory`, which only ever builds. Out of `SceneRenderer` for the same reason: none of
 * it needs a GL context, so it is the half that can be tested.
 */

/**
 * Mutates the material rather than replacing it: a new `MeshStandardMaterial` costs a shader
 * program compiled on the next frame, and the inspector emits a value per pointer move.
 */
export function applyMaterial(
  material: MeshStandardMaterial,
  descriptor: MaterialDescriptor,
  fallbackColor: string,
): void {
  const color = descriptor.color ?? fallbackColor
  if (color) material.color.set(color)
  material.roughness = descriptor.roughness
  material.metalness = descriptor.metalness
}

/** Enough for the tool's own silhouette to read while the matter behind it still shows. */
const NEGATIVE_OPACITY = 0.45

/**
 * A shape MARKED as a tool, and the look Roblox gives one: translucent red, so what is about to
 * be taken away shows through what it will be taken out of.
 *
 * It REPLACES the descriptor's colour rather than tinting it, and owns `transparent`, `opacity`
 * and `depthWrite` on the material — a `MaterialDescriptor` that ever gains an opacity has to
 * settle with this. A texture still multiplies through: that slot belongs to the texture holder.
 */
export function applyNegative(
  material: MeshStandardMaterial,
  colour: string,
  negative: boolean,
): void {
  material.transparent = negative
  material.opacity = negative ? NEGATIVE_OPACITY : 1
  // Off, or a tool standing in front of the matter would hide it rather than show through it.
  material.depthWrite = !negative
  // The paint it wore, kept where the EXPORT can find it: `placedCopy` shares materials by
  // reference, so without this a marked cube shipped red at 45 % into every `.glb` written.
  if (negative) material.userData[NEGATIVE_PAINT] = material.color.getHex()
  else delete material.userData[NEGATIVE_PAINT]
  if (negative && colour) material.color.set(colour)
}

/** Where `applyNegative` leaves the paint a marked material had — read by `unmarkTools`. */
export const NEGATIVE_PAINT = 'negativePaint'

/**
 * The tool mark taken off a COPY, paint and all. A mark is an editing role, not a finish: Roblox
 * writes a negated part out as an ordinary one, and this studio's exports have to as well.
 */
export function unmarkTools(root: Object3D): void {
  root.traverse(child => {
    if (!(child instanceof Mesh)) return
    const material = standardMaterialOf(child)
    const paint: unknown = material?.userData[NEGATIVE_PAINT]
    if (!material || typeof paint !== 'number') return

    const own = material.clone()
    own.color.setHex(paint)
    own.transparent = false
    own.opacity = 1
    own.depthWrite = true
    delete own.userData[NEGATIVE_PAINT]
    child.material = own
  })
}

/** The second UV set an occlusion map needs. Absent from every primitive the studio builds. */
export function giveSecondUvSet(geometry: BufferGeometry): void {
  const uv = geometry.attributes.uv
  if (uv && !geometry.attributes.uv1) geometry.setAttribute('uv1', uv)
}

/**
 * Puts a mesh on another shape and hands back the one it was wearing, `null` when it already
 * wore it — for the caller to give back, since only it knows which cache lent it.
 */
export function wearGeometry(mesh: Mesh, next: BufferGeometry): BufferGeometry | null {
  const previous = mesh.geometry
  if (previous === next) return null

  // The new shape inherits the second UV set, or an occlusion map already in place would stop
  // doing anything the moment a radius is nudged.
  if (previous.attributes.uv1) giveSecondUvSet(next)
  mesh.geometry = next
  return previous
}

/** The shape, with its maps repeated at the material's density — see `uvTiling` for how. */
export function tiledGeometry(
  descriptor: GeometryDescriptor,
  tilesPerMetre: number,
): BufferGeometry {
  const geometry = geometryFor(descriptor)
  tileUvs(geometry, descriptor, tilesPerMetre)
  return geometry
}

/**
 * The sprite's own parameters. `transparent` is deliberately left alone: `SpriteMaterial` turns
 * it on in its constructor — "sprite materials are transparent", says three.js — and switching it
 * off at full opacity would make every picture with an alpha channel draw its whole quad.
 */
export function applySprite(
  material: SpriteMaterial,
  descriptor: SpriteDescriptor,
  fallbackColor: string,
): void {
  material.color.set(descriptor.color ?? fallbackColor)
  material.opacity = descriptor.opacity
}

/** A light of the right class, carrying what its descriptor says. */
export function lightFor(descriptor: LightDescriptor): Light {
  const light = bareLight(descriptor.kind)
  applyLight(light, descriptor)
  return light
}

/**
 * 🛑 three.js follows a light target's world matrix only once the target stands in the scene:
 * without this a directional shadow is thrown at the world origin, and nothing says so.
 */
export function standTarget(light: Object3D, scene: Object3D): void {
  if (light instanceof DirectionalLight || light instanceof SpotLight) scene.add(light.target)
}

/**
 * The light's own parameters. Each branch checks the class it writes to rather than casting: a
 * mismatch leaves the light alone instead of throwing at the user.
 */
export function applyLight(light: Light, descriptor: LightDescriptor): void {
  light.intensity = descriptor.intensity
  if (descriptor.kind !== 'hemisphere') light.color.set(descriptor.color)

  switch (descriptor.kind) {
    case 'directional':
      if (light instanceof DirectionalLight) applyTarget(light, descriptor.target)
      return
    case 'hemisphere':
      if (!(light instanceof HemisphereLight)) return
      light.color.set(descriptor.skyColor)
      light.groundColor.set(descriptor.groundColor)
      return
    case 'point':
      if (!(light instanceof PointLight)) return
      light.distance = descriptor.distance
      light.decay = descriptor.decay
      fitPointShadowRange(light)
      return
    case 'spot':
      if (!(light instanceof SpotLight)) return
      light.distance = descriptor.distance
      light.angle = descriptor.angle
      light.penumbra = descriptor.penumbra
      light.decay = descriptor.decay
      applyTarget(light, descriptor.target)
  }
}

function fitPointShadowRange(light: PointLight): void {
  const far =
    light.distance > light.shadow.camera.near ? light.distance : UNBOUNDED_POINT_SHADOW_FAR
  if (light.shadow.camera.far === far) return
  light.shadow.camera.far = far
  light.shadow.camera.updateProjectionMatrix()
}

function applyTarget(light: DirectionalLight | SpotLight, target: Vector3): void {
  light.target.position.set(target.x, target.y, target.z)
  // The helper reads the target's world matrix, and nothing else updates it before the frame
  // that draws it: without this the beam points where the light aimed one edit ago.
  light.target.updateMatrixWorld()
}

/**
 * The lens of a camera of the scene, and the frustum drawn from it.
 *
 * The helper is updated by hand: it reads the projection matrix once, so a camera whose field of
 * view was just typed in would keep outlining the one it had before.
 */
export function applyCamera(
  camera: PerspectiveCamera,
  descriptor: CameraDescriptor,
  outlineFar: number = descriptor.far,
): void {
  camera.fov = descriptor.fov
  camera.near = descriptor.near
  camera.far = descriptor.far
  camera.updateProjectionMatrix()

  // Shortened for the outline and put straight back: `update` reads the projection matrix at the
  // moment it is called, and THIS camera is the one a preview and a film render through.
  camera.far = Math.min(descriptor.far, outlineFar)
  camera.updateProjectionMatrix()
  for (const child of camera.children) {
    if (child instanceof CameraHelper) child.update()
  }
  camera.far = descriptor.far
  camera.updateProjectionMatrix()
}

/**
 * The knobs of a rail, shown only on the rail being worked on.
 *
 * A sphere per point on every rail of the scene is what makes a five-camera sequence unreadable,
 * and only a SELECTED rail hands its points to the gizmo anyway — see `pathPointAt`. The line
 * stays either way, so a rail can still be clicked to become the selected one.
 */
export function showPathKnobs(object: Object3D, shown: boolean): void {
  for (const child of object.children) {
    if (child.name.startsWith(PATH_KNOB_PREFIX)) child.visible = shown
  }
}

/**
 * 🛑 The line of a BAND, shown only while it is worked on. A rail node keeps its own either way —
 * it is nothing but that line, and hiding it would leave nothing to click. A band is a surface
 * one clicks directly, so its line drew a permanent stripe down the middle, seen THROUGH the very
 * cars it was under.
 */
export function showRailLine(object: Object3D, shown: boolean): void {
  const line = object.getObjectByName(PATH_CURVE_NAME)
  if (line) line.visible = shown
}

/**
 * A rail brought in line with its descriptor: the sampled line, and one knob per control point.
 *
 * Knobs are added and removed rather than rebuilt whole: a drag of one point emits a descriptor
 * per pointer move, and disposing every sphere each time would churn the GPU for a curve that
 * has not changed shape.
 */
export function applyPath(object: Object3D, descriptor: PathDescriptor, colour: string): void {
  const line = object.getObjectByName(PATH_CURVE_NAME)
  if (line instanceof Line) line.geometry.setFromPoints(pathPoints(descriptor))

  const knobs = object.children.filter(
    (child): child is Mesh => knobIndexOf(child.name) !== null && child instanceof Mesh,
  )

  // A run that gained or lost an anchor is dressed again whole: every anchor carries three more
  // objects now, and threading an insertion through four parallel lists is where a leak lives.
  if (knobs.length !== descriptor.points.length) {
    const worn = knobs[0]?.material
    const through = worn instanceof MeshBasicMaterial && !worn.depthTest
    const colourNamed = (name: string | null): string | undefined => {
      const child = name
        ? object.getObjectByName(name)
        : object.children.find(one => handlePartOf(one.name))
      return child instanceof Mesh && child.material instanceof MeshBasicMaterial
        ? `#${child.material.color.getHexString()}`
        : undefined
    }
    // Read off what is already hung rather than passed in: the three colours are three tokens,
    // and dressing again in the anchors' would repaint the pair and the first point grey.
    // Read off what is already hung rather than passed in: the three are three tokens, and
    // dressing again in the anchors' would repaint the pair and the first point grey.
    const colours = { knob: colour, handle: colourNamed(null), start: colourNamed(knobName(0)) }
    // 🛑 The AIDS alone, by name: a band hangs them off its own mesh, and any node of the document
    // may be reparented under that mesh from the outliner. Swept whole, this took the reparented
    // node out of the scene and disposed a geometry the shared cache still counted as alive.
    for (const child of [...object.children].filter(one => isRailAid(one.name))) {
      object.remove(child)
      if (child instanceof Mesh || child instanceof Line) child.geometry.dispose()
    }
    dressWithRail(object, descriptor, colours, through)
    return
  }

  for (const [index, point] of descriptor.points.entries()) {
    knobs[index]?.position.set(point.x, point.y, point.z)
    placeHandles(object, descriptor, index, point)
  }
}

/**
 * The tangents shown on ONE anchor — the one being worked on — and on no other.
 *
 * 🛑 Every anchor at once is what makes a run of twenty-four unreadable: Photoshop shows the pair
 * of the point one clicked, and that is the gesture this follows.
 */
export function showPathHandles(object: Object3D, index: number | null): void {
  for (const child of object.children) {
    const part = handlePartOf(child.name)
    const bar = child.name.startsWith(HANDLE_BAR_PREFIX)
      ? Number(child.name.split('-').at(-1))
      : null
    if (part) child.visible = part.index === index
    else if (bar !== null) child.visible = bar === index
  }
}

/** The material a mesh was built with. Arrays are never built here, and neither is any other. */
export function standardMaterialOf(mesh: Mesh): MeshStandardMaterial | null {
  return mesh.material instanceof MeshStandardMaterial ? mesh.material : null
}
