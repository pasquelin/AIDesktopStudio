import { mdiCubeOutline } from '@mdi/js'
import type {
  GeometryDescriptor,
  LightDescriptor,
  MaterialDescriptor,
  Transform,
  Vector3,
} from '@shared/domain/scene'
import { DEFAULT_CAMERA, DEFAULT_PATH, DEFAULT_PLAY, type FigureKind } from '@shared/domain/scene'
import type { CsgGraph } from '@shared/domain/csg'
import type { Component } from '@shared/domain/component'
import { COMPONENTS, newComponent } from '@shared/domain/componentRegistry'
import { armRestOffsets } from '@game/runtime/systems/springArmRig'
import { newId } from '@/helpers/ids'
import { defaultMeshMaterial } from './checkerTextures'
import { figureByKind, figureScaleWithin, type FigureDescriptor } from './figures'
import { lightByKind } from './lightTypes'
import { primitiveByKind } from './meshPrimitives'
import { shippedCharacterAssetId } from './shippedCharacter'
import { isPlayerModule, PLAYER_KIND } from './playerModule'
import {
  CAMERA_ICON,
  CARVED_ICON,
  GROUP_ICON,
  MODEL_ICON,
  PATH_ICON,
  PLAYER_ICON,
  SPRITE_ICON,
  TEXT_ICON,
} from './nodeKinds'
import {
  DEFAULT_MATERIAL,
  DEFAULT_SPRITE,
  DEFAULT_TEXT,
  IDENTITY_TRANSFORM,
  shadowDefaults,
  type SceneNode,
} from './sceneState'

/**
 * A node is named after its class, as in the three.js editor — `Box`, `SpotLight` — and never
 * after the translated menu row that made it: a name is document data, and a scene whose
 * contents are called `Cube` in French and `Box` in English cannot be shared between the two.
 */
function classNameOf(kind: string): string {
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`
}

/** Where a node stands, at the scale it is built at — what every template and level places by. */
export function transformAt(position: Vector3, rotation: Vector3 = ORIGIN): Transform {
  return { ...IDENTITY_TRANSFORM, position, rotation }
}

const ORIGIN: Vector3 = { x: 0, y: 0, z: 0 }

/**
 * A solid, named after its class like every other node. The one place a mesh is built: the Add
 * menu and the scene templates both come through here, so neither can hand out a mesh wearing a
 * material the other does not — which is what the working texture depends on.
 */
export function meshNode(
  geometry: GeometryDescriptor,
  {
    transform = IDENTITY_TRANSFORM,
    material = defaultMeshMaterial(),
    castShadow,
    parentId = null,
    name = classNameOf(geometry.kind),
    negative = false,
  }: MeshOptions = {},
): SceneNode {
  return {
    id: newId(),
    parentId,
    name,
    visible: true,
    transform,
    ...shadowDefaults({ type: 'mesh' }),
    ...(castShadow === undefined ? {} : { castShadow }),
    type: 'mesh',
    geometry,
    material,
    // A node is BORN unmarked, and absent is what that means — so a fresh box carries no field.
    ...(negative ? { negative } : {}),
  }
}

/** What a caller may settle about a mesh. Everything left out is what the Add menu would give. */
export type MeshOptions = {
  transform?: Transform
  material?: MaterialDescriptor
  /** A floor throws no shadow, and taking it out of the depth pass is the point of saying so. */
  castShadow?: boolean
  /** Hangs it under a group — what a level built of thirty parts needs to stay readable. */
  parentId?: string | null
  /**
   * English like every other node name, and for the same reason as a group's. Left out, a mesh
   * is named after its class: fine for one added by hand, useless for a set of thirty where
   * eleven rows would read `Box`.
   */
  name?: string
  /** Marked as a tool for the next boolean — see `SceneNode`. What `separateNode` gives back. */
  negative?: boolean
}

export function lightNode(light: LightDescriptor, position: Vector3): SceneNode {
  return {
    id: newId(),
    parentId: null,
    name: `${classNameOf(light.kind)}Light`,
    visible: true,
    transform: { ...IDENTITY_TRANSFORM, position },
    ...shadowDefaults({ type: 'light', light }),
    type: 'light',
    light,
  }
}

/**
 * An imported model, as one node holding a reference. Named after the asset rather than after
 * its class: two cubes are both `Box`, but two imported models are two different files, and the
 * outliner is where you tell them apart.
 */
export function modelNode(assetId: string, name: string): SceneNode {
  return {
    id: newId(),
    parentId: null,
    name,
    visible: true,
    transform: IDENTITY_TRANSFORM,
    ...shadowDefaults({ type: 'model' }),
    type: 'model',
    model: { assetId },
  }
}

/**
 * A camera of the scene: what a render looks through, placed like anything else. Back and up a
 * little by default — a camera born inside the object at the centre would show nothing at all.
 */
export function cameraNode(
  transform: Transform = { ...IDENTITY_TRANSFORM, position: { x: 0, y: 2, z: 6 } },
): SceneNode {
  return {
    id: newId(),
    parentId: null,
    name: 'Camera',
    visible: true,
    transform,
    ...shadowDefaults({ type: 'camera' }),
    type: 'camera',
    camera: DEFAULT_CAMERA,
  }
}

/** A rail. Born with two points, since a curve through one is a point with a name. */
export function pathNode(): SceneNode {
  return {
    id: newId(),
    parentId: null,
    name: 'Path',
    visible: true,
    transform: IDENTITY_TRANSFORM,
    ...shadowDefaults({ type: 'path' }),
    type: 'path',
    path: DEFAULT_PATH,
  }
}

/**
 * A picture that always faces the camera. Built mapless: the picture is picked in the inspector
 * from the project's assets, and a sprite that demanded one before it could exist would be a
 * node the Add menu could not add.
 */
export function spriteNode(): SceneNode {
  return {
    id: newId(),
    parentId: null,
    name: 'Sprite',
    visible: true,
    transform: IDENTITY_TRANSFORM,
    ...shadowDefaults({ type: 'sprite' }),
    type: 'sprite',
    sprite: DEFAULT_SPRITE,
  }
}

/**
 * Words as a solid. Born with something written in it rather than empty: a text node that draws
 * nothing until someone finds the field is a node the Add menu appears to have failed at.
 */
function textNode(): SceneNode {
  return {
    id: newId(),
    parentId: null,
    name: 'Text',
    visible: true,
    transform: IDENTITY_TRANSFORM,
    ...shadowDefaults({ type: 'text' }),
    type: 'text',
    text: DEFAULT_TEXT,
    material: DEFAULT_MATERIAL,
  }
}

/** A solid, standing where the matter it was cut from stood, and wearing its material. */
export function carvedNode(
  carved: CsgGraph,
  {
    transform = IDENTITY_TRANSFORM,
    material = DEFAULT_MATERIAL,
    parentId = null,
    name = 'Solid',
    negative = false,
  }: {
    transform?: Transform
    material?: MaterialDescriptor
    parentId?: string | null
    name?: string
    negative?: boolean
  } = {},
): SceneNode {
  return {
    id: newId(),
    parentId,
    name,
    visible: true,
    transform,
    ...shadowDefaults({ type: 'carved' }),
    type: 'carved',
    carved,
    material,
    ...(negative ? { negative } : {}),
  }
}

/** An empty node others hang from. Its transform moves everything under it, and nothing else. */
export function groupNode(transform = IDENTITY_TRANSFORM, name = 'Group'): SceneNode {
  return {
    id: newId(),
    parentId: null,
    // Named after its class by default, like every other node: a scene whose contents are called
    // `Groupe` in French and `Group` in English cannot be shared between the two. A caller that
    // builds a set names its parts in English for the same reason — three rows reading `Group`
    // are three rows one has to open to tell apart.
    name,
    visible: true,
    transform,
    ...shadowDefaults({ type: 'group' }),
    type: 'group',
  }
}

/**
 * The capsule draws nothing of its own: `CharacterController` carries the height and radius the
 * physics feels, and what is SEEN is the figure under it — which a model replaces.
 */
export function playerModuleNodes(
  view: 'firstPerson' | 'thirdPerson' = 'thirdPerson',
): readonly SceneNode[] {
  const module: SceneNode = {
    ...groupNode(IDENTITY_TRANSFORM, 'Player_Module'),
    components: [newComponent('Player')],
  }
  const capsule: SceneNode = {
    // Half the controller's own height: a capsule stands ON the ground, and its node is its centre.
    ...groupNode(transformAt({ x: 0, y: WALKER_HEIGHT / 2, z: 0 }), 'Capsule'),
    parentId: module.id,
    components: [{ ...newComponent('CharacterController'), bodyTurnSpeed: 720 }],
  }
  // 🛑 A figure and not a capsule: what stands in a walking body is a BODY, and a capsule inside
  // a capsule showed nothing a cage does not already draw. Every part of it stays an editable
  // mesh — see `figures.ts` — so replacing the look of a player is replacing these nodes.
  const figure = figureNodesUnder(capsule.id, capsule.name)
  const arm: SceneNode = { ...groupNode(IDENTITY_TRANSFORM, 'SpringArm'), parentId: module.id }
  // 🛑 Where the arm will put it on the first frame of play, worked out from the very functions
  // the system uses. Left at its parent's origin, the camera stood at the player's feet, and
  // nothing in the editor moves it: an arm only acts once the scene is playing.
  // 🛑 Aimed at the PIVOT and not at the body: `lookAt` defaults to the pivot, so a node turned on
  // the feet made pressing Play tip the shot by 21,8° — measured 2026-09-03.
  const settings = playerArm(view, capsule.name)
  const { pivot, seat } = armRest(capsule.transform.position, 0, settings)
  const camera: SceneNode = {
    ...cameraNode(transformAt(seat, view === 'firstPerson' ? ORIGIN : aimedFrom(seat, pivot))),
    parentId: arm.id,
  }

  // 🛑 The NAMES its own children wear, never their ids: a uuid is a field nobody can read, and
  // the tree resolves these two inside the module at every world build — see `withBoundPlayerArm`.
  return [
    module,
    capsule,
    ...figure,
    {
      ...arm,
      components: [{ ...settings, camera: camera.name }],
    },
    camera,
  ]
}

function playerArm(view: 'firstPerson' | 'thirdPerson', subject: string): Component {
  return {
    ...newComponent('SpringArm'),
    // A camera that lags in height reads as the ground moving under a jump rather than the body
    // rising. It is the third person this buys: the first sets `positionLag` to zero outright.
    followVertical: true,
    ...(view === 'firstPerson'
      ? {
          length: 0,
          positionLag: 0,
          rotationLag: 0,
          height: DEFAULT_PLAY.eyeHeight - WALKER_HEIGHT / 2,
          collision: false,
        }
      : {}),
    subject,
  }
}

/** The controller's own defaults, read rather than copied: tuning one there moves the body here. */
const WALKER_HEIGHT = Number(COMPONENTS.CharacterController.defaults.height)
const WALKER_RADIUS = Number(COMPONENTS.CharacterController.defaults.radius)

/**
 * Where a resting arm hangs, over a body standing at `body` and turned by `yaw` — its `pivot` and
 * the `seat` it puts a camera at. 🛑 Off the very functions the SYSTEM rides: a template posing
 * its camera anywhere else opens on a shot the first frame throws away — 11,56 m, 2026-09-03.
 */
export function armRest(
  body: Vector3,
  yaw = 0,
  arm: Component = newComponent('SpringArm'),
): { pivot: Vector3; seat: Vector3 } {
  const lift = { ...ORIGIN }
  const back = { ...ORIGIN }
  armRestOffsets(arm, { yaw, pitch: 0 }, lift, back)
  const pivot = { x: body.x + lift.x, y: body.y + lift.y, z: body.z + lift.z }
  return { pivot, seat: { x: pivot.x + back.x, y: pivot.y + back.y, z: pivot.z + back.z } }
}

/**
 * How a camera at `from` is turned to look at `at`. 🛑 Three points a camera down its own −z, so
 * the yaw is measured from that axis — an editor showing a camera with its back to the body it
 * follows says nothing about what the arm does.
 */
export function aimedFrom(from: Vector3, at: Vector3): Vector3 {
  const dx = at.x - from.x
  const dy = at.y - from.y
  const dz = at.z - from.z
  return { x: Math.atan2(dy, Math.hypot(dx, dz)), y: Math.atan2(dx, dz) + Math.PI, z: 0 }
}

/**
 * A figure laid down as real nodes: one group, and a painted box per part. The one place a figure
 * becomes a scene, as `meshNode` is the one place a mesh does.
 *
 * `scale` sizes the whole thing without touching a part: a figure is a family of its own and
 * knows nothing of a controller, so it is the caller that fits one to the body it fills.
 */
export function figureNodes(
  figure: FigureDescriptor,
  scale = 1,
  parentId: string | null = null,
): readonly SceneNode[] {
  const root = {
    ...groupNode(transformAt({ x: 0, y: 0, z: 0 }), 'Figure'),
    parentId,
    transform: {
      ...transformAt({ x: 0, y: 0, z: 0 }),
      scale: { x: scale, y: scale, z: scale },
    },
  }
  return [
    root,
    ...figure.parts.map(part =>
      meshNode(
        { kind: 'box', width: part.size.x, height: part.size.y, depth: part.size.z },
        {
          // A fresh vector per part: `transformAt` KEEPS what it is handed, and the parts are a
          // module-level table — two figures shared one position each, and moving a leg on one
          // moved it on the other.
          transform: transformAt({ ...part.at }),
          // Composed here rather than through `levelParts.surface`, which would close an import
          // cycle back onto this module. A descriptor PER part: two nodes holding one object
          // would be recoloured together.
          material: { ...defaultMeshMaterial(), color: part.colour },
          name: part.name,
          parentId: root.id,
        },
      ),
    ),
  ]
}

/**
 * What a module is born wearing: the shipped character when the project holds it, and the figure
 * of boxes when it does not.
 *
 * 🛑 The fallback is not dead code. A project that cannot be written to installs nothing, and a
 * module without a body is a module nobody can see walking.
 */
function figureNodesUnder(bodyId: string, bodyName: string): readonly SceneNode[] {
  const character = shippedCharacterAssetId()
  if (character) {
    return [
      {
        ...modelNode(character, 'Character'),
        // 🛑 On the MESH and pointed at the capsule: what a graph reads is what the controller
        // walks, and the two are never the same node. The figure of boxes gets none — it carries
        // no skeleton, and an animator with nothing to pose would say nothing about why.
        components: [{ ...newComponent('Animator'), body: bodyName }],
        // Down by half the controller's height: the body's node is its CENTRE, and a character's
        // own origin is at its feet — left at the centre it would stand 90 cm in the air.
        // The shipped mesh faces +Z; the controller walks and faces -Z.
        transform: transformAt({ x: 0, y: -WALKER_HEIGHT / 2, z: 0 }, { x: 0, y: Math.PI, z: 0 }),
        parentId: bodyId,
      },
    ]
  }

  const figure = figureByKind(DEFAULT_FIGURE)?.create()
  if (!figure) return []

  const worn =
    (WALKER_HEIGHT / figure.height) * figureScaleWithin(figure, WALKER_HEIGHT, WALKER_RADIUS)
  return figureNodes(figure, worn, bodyId)
}

/** Which figure a fresh module stands in. Typed, so dropping it from the family breaks the build. */
const DEFAULT_FIGURE: FigureKind = 'humanoid'

/** The glyph belongs to the registry entry, not to whichever panel happens to draw the node. */
export function iconOf(node: SceneNode): string {
  // Before the type, and it is the only glyph read off a component: a module wearing a folder is
  // a module nobody finds in an outliner of thirty rows.
  if (isPlayerModule(node)) return PLAYER_ICON
  if (node.type === 'model') return MODEL_ICON
  if (node.type === 'group') return GROUP_ICON
  if (node.type === 'sprite') return SPRITE_ICON
  if (node.type === 'text') return TEXT_ICON
  if (node.type === 'camera') return CAMERA_ICON
  if (node.type === 'path') return PATH_ICON
  if (node.type === 'carved') return CARVED_ICON

  // Named rather than assumed: the fallthrough used to read `node.setPrimitiveParameters` on anything that was
  // not a light, so the next member of the union would have crashed here instead of taking the
  // default glyph.
  if (node.type === 'light') return lightByKind(node.light.kind)?.icon ?? mdiCubeOutline
  if (node.type !== 'mesh') return mdiCubeOutline
  return primitiveByKind(node.geometry.kind)?.icon ?? mdiCubeOutline
}

/**
 * What one Add gives the scene, and the door the toolbar, the panels and the native menu share —
 * three call sites building a node their own way is three ways for a mesh to arrive without a
 * material. A LIST, because a module is several nodes born parented.
 */
export function createNodesOf(kind: string): readonly SceneNode[] {
  if (kind === PLAYER_KIND) return playerModuleNodes()

  const figure = figureByKind(kind)
  if (figure) return figureNodes(figure.create())

  const node = createNodeOf(kind)
  return node ? [node] : []
}

/** The single-node half of the door above. Nothing adds through this one — see `createNodesOf`. */
export function createNodeOf(kind: string): SceneNode | null {
  const primitive = primitiveByKind(kind)
  if (primitive) return meshNode(primitive.create())

  if (kind === 'camera') return cameraNode()
  if (kind === 'sprite') return spriteNode()
  if (kind === 'text') return textNode()
  if (kind === 'path') return pathNode()

  const light = lightByKind(kind)
  return light ? lightNode(light.create(), IDENTITY_TRANSFORM.position) : null
}
