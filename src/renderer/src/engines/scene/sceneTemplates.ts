/**
 * What each scene template opens on, as plain state.
 *
 * A template is code and nothing else: no file to fetch, no model to download, no asset the
 * project has to hold first. What it may reference is what the app ships with — the working
 * textures — and a project that has not installed them yet gets plain surfaces rather than
 * nothing at all.
 *
 * No three.js here on purpose: this is reached from the door that creates a document, which the
 * rail and the home page both press, and neither may pull a renderer in to open a tab.
 */
import { EMPTY_TIMELINE, sheetFromAnimated, type AnimationTimeline } from '@shared/domain/animation'
import { newComponent, withComponentField } from '@shared/domain/componentRegistry'
import {
  DEFAULT_CAMERA,
  DEFAULT_GROUND,
  DEFAULT_WORLD,
  type MaterialDescriptor,
  type ScenePlay,
  type SceneWorld,
  type Vector3,
} from '@shared/domain/scene'
import {
  DEFAULT_SCENE_TEMPLATE,
  isSceneTemplateId,
  type SceneTemplateId,
} from '@shared/domain/sceneTemplate'
import { createDefaultScene } from './defaultScene'
import { airfieldNodes } from './airfieldLevel'
import { carNodes } from './carNodes'
import { CIRCUIT_START, CIRCUIT_START_YAW, circuitNodes } from './circuitLevel'
import { LYING_FLAT } from './levelParts'
import { MOUNTAIN_WORLD, mountainNodes } from './mountainLevel'
import { presetPatch } from './environmentPresets'
import { planeNodes } from './planeNodes'
import {
  aimedFrom,
  armRest,
  cameraNode,
  groupNode,
  lightNode,
  meshNode,
  pathNode,
  playerModuleNodes,
  transformAt,
} from './nodeFactory'
import { playgroundNodes } from './playgroundLevel'
import { postProcessingTemplate } from './postProcessingTemplate'
import { DEFAULT_ROLE_PATHS } from '@shared/domain/folderRole'
import { documentPathFor } from '@shared/domain/documentName'
import { refToString } from '@shared/domain/ref'
import type { TemplateScriptId } from '@shared/domain/templateScript'
import type { SceneNode, SceneState } from './sceneState'

const ORIGIN: Vector3 = { x: 0, y: 0, z: 0 }

/**
 * The same node, carrying the script that will drive it.
 *
 * 🛑 A template SHOWS: a player who walks off the built-in contexts alone leaves nothing in the
 * project to read, and nothing to change. `seedSceneScripts` writes the file this names.
 */
function scripted(node: SceneNode, script: TemplateScriptId, folder: string): SceneNode {
  return {
    ...node,
    components: [
      ...(node.components ?? []),
      // 🛑 A `script:<path>` REFERENCE, never the bare id: the kernel keys its modules by that
      // string, and anything else answers « script never loaded » without opening in the inspector.
      withComponentField(
        newComponent('Script'),
        'script',
        refToString({ kind: 'script', path: documentPathFor(script, 'script', folder) }),
      ),
    ],
  }
}

/** Its FIRST node carries it — a machine's own body, a module's root. */
function scriptedFirst(
  nodes: readonly SceneNode[],
  script: TemplateScriptId,
  folder: string,
): readonly SceneNode[] {
  const [first, ...rest] = nodes
  return first ? [scripted(first, script, folder), ...rest] : nodes
}

/**
 * The pitch that aims a camera standing at `height`, `distance` away on the +Z axis, at a point
 * `targetHeight` above the origin.
 *
 * Every camera below stands on that axis, and this is why: a node's rotation is read as Euler
 * XYZ, where a yaw and a pitch together do not compose the way a camera is aimed. With no yaw
 * the orders agree, and one angle says the whole thing.
 */
export function pitchTowards(height: number, distance: number, targetHeight = 0): number {
  return Math.atan2(targetHeight - height, distance)
}

/**
 * A camera on the +Z axis, aimed by its pitch alone — see `pitchTowards`. `distance` is measured
 * from what it LOOKS AT, which is at the origin unless `targetZ` says otherwise: a camera placed
 * at its distance from zero would frame the origin rather than the subject standing away from it.
 */
function aimedCamera(height: number, distance: number, targetHeight = 0, targetZ = 0): SceneNode {
  const rotation = { x: pitchTowards(height, distance, targetHeight), y: 0, z: 0 }
  return cameraNode(transformAt({ x: 0, y: height, z: targetZ + distance }, rotation))
}

/**
 * A camera on an arm, wired to what it films, and SEATED where the arm will put it — see
 * `armRest`. Named parts, so an author can read the pair in the outliner and retune it.
 */
function cameraRig(
  machine: readonly [SceneNode, ...SceneNode[]],
  over: Record<string, string | number> = {},
): readonly SceneNode[] {
  const subject = machine[0]
  let arm = newComponent('SpringArm')
  for (const [key, value] of Object.entries({
    subject: subject.name,
    camera: CAMERA_NAME,
    ...over,
  })) {
    arm = withComponentField(arm, key, value)
  }
  // 🛑 The NODE's own pose, never the numbers it was built from: `carNodes` turns its body by
  // `heading + π` and lifts it by the ride height.
  const { pivot, seat } = armRest(subject.transform.position, subject.transform.rotation.y, arm)
  return [
    ...machine,
    { ...groupNode(transformAt(ORIGIN), 'Camera Rig'), components: [arm] },
    cameraNode(transformAt(seat, aimedFrom(seat, pivot))),
  ]
}

const CAMERA_NAME = 'Camera'

/**
 * The working floor: wearing the checker, catching shadows, throwing none. Its tiling is the
 * studio default of one square per metre, which holds whatever `size` says — see `uvTiling`.
 */
function floor(size: number): SceneNode {
  return meshNode(
    { kind: 'plane', width: size, height: size },
    { transform: transformAt(ORIGIN, LYING_FLAT), castShadow: false, name: 'Floor' },
  )
}

/**
 * Whoever is PLAYED — a body the size of a person, carrying what walks it. Its capsule is the
 * controller's own default to the millimetre, so what is felt is what is seen.
 *
 * Off the origin, which the playground turned into an eight-metre hole: framed there, the two
 * templates that show a silhouette opened on one standing over a void.
 */
function standIn(): SceneNode {
  return {
    ...meshNode(
      { kind: 'capsule', radius: 0.3, height: 1.2, capSegments: 8, radialSegments: 16 },
      { transform: transformAt({ x: 0, y: 0.9, z: STAND_IN_Z }), name: 'Character' },
    ),
    components: [newComponent('CharacterController')],
  }
}

/**
 * The player module, put down where the stand-in stands. It brings its own body, its own arm and
 * the eye it films through — nothing here names a camera, which is the whole of what it replaces.
 */
function playerModuleAt(
  z: number,
  view: 'firstPerson' | 'thirdPerson' = 'thirdPerson',
): readonly SceneNode[] {
  const [root, ...rest] = playerModuleNodes(view)
  return root ? [{ ...root, transform: transformAt({ x: 0, y: 0, z }) }, ...rest] : []
}

/** Clear of the pit, on the floor band the two framed views open on. */
const STAND_IN_Z = 10

const KEY_LIGHT: Vector3 = { x: 5, y: 10, z: 7.5 }

function sun(intensity: number, position: Vector3 = KEY_LIGHT): SceneNode {
  return lightNode({ kind: 'directional', color: '#ffffff', intensity, target: ORIGIN }, position)
}

function ambient(intensity: number): SceneNode {
  return lightNode({ kind: 'ambient', color: '#404040', intensity }, ORIGIN)
}

/**
 * Sky above, bounced ground below — what keeps the shaded side of a wall readable instead of
 * flat grey. An ambient fills every face with the same light, which is what made the set read
 * as cardboard: it is a set one walks through, so its corners have to have depth.
 */
function skyLight(intensity: number): SceneNode {
  return lightNode(
    // A PALE ground colour, because the set has a pale floor: what bounces back is what stops a
    // wall in shade from going to the value of the sky behind it.
    { kind: 'hemisphere', skyColor: '#c2d8f2', groundColor: '#9a9384', intensity },
    { x: 0, y: 24, z: 0 },
  )
}

function pointLight(intensity: number, position: Vector3): SceneNode {
  return lightNode({ kind: 'point', color: '#ffffff', intensity, distance: 0, decay: 2 }, position)
}

/**
 * Plain white and no working texture: a backdrop is what a product is judged AGAINST, and it is
 * the one surface of the studio that is deliberately born bare — see `checkerTextures`.
 */
const BACKDROP: MaterialDescriptor = {
  kind: 'standard',
  color: '#f2f2f4',
  roughness: 1,
  metalness: 0,
  tilesPerMetre: 1,
  map: null,
  normalMap: null,
  roughnessMap: null,
  metalnessMap: null,
  aoMap: null,
  emissiveMap: null,
  displacementMap: null,
}
/**
 * Feet on the ground, walking speed, eyes at 1,70 m — what the character templates share, and
 * the values the player will read the day it exists.
 */
const EYE_HEIGHT = 1.7

const WALKING: Partial<ScenePlay> = { eyeHeight: EYE_HEIGHT, moveSpeed: 4, gravity: 9.81 }

/**
 * The level, its light, and what the view adds on top — the three character templates differ by
 * that last part alone, which is the whole claim they make.
 */
function characterView(
  view: readonly SceneNode[],
  play: Partial<ScenePlay>,
  played?: string,
): Template {
  return {
    nodes: [...playgroundNodes(played), sun(2.2, { x: 22, y: 26, z: 16 }), skyLight(1.3), ...view],
    // The outdoor preset for its haze and its grading, but a PLAIN SKY behind rather than the
    // procedural studio: that one is nearly black, and a wall turned away from the sun landed on
    // the same value as the background — which reads as a wall that vanishes when one turns.
    // The colour is the haze's own, so the horizon closes instead of ending on a line.
    world: { ...presetPatch('outdoor'), background: { kind: 'color', color: '#b6c6d8' } },
    play: { ...WALKING, ...play },
  }
}

/** What a template settles, over the studio's own defaults. */
type Template = {
  nodes: readonly SceneNode[]
  world?: Partial<SceneWorld>
  play?: Partial<ScenePlay>
  /**
   * What the band already holds. Only the demonstration template uses it, and it is what makes
   * that one a DEMONSTRATION rather than a set: the whole chain — a move, a rack focus, a bloom
   * and an exposure — is already keyed, so pressing Play judges it in one gesture.
   */
  animation?: Partial<AnimationTimeline>
}

const BUILDERS: Record<SceneTemplateId, (scriptFolder: string) => Template> = {
  // The studio's own default, unchanged: three lights and nothing else. Lit rather than truly
  // bare — an unlit scene reads as a broken viewport, not as a document waiting to be filled.
  empty: () => ({ nodes: createDefaultScene().nodes }),

  // A floor, a sun, a fill, a camera — and a cube of one metre. The cube is what says how big a
  // metre is here, and it is the first thing to delete once a model of one's own arrives.
  basic: () => ({
    nodes: [
      floor(20),
      meshNode(
        { kind: 'box', width: 1, height: 1, depth: 1 },
        { transform: transformAt({ x: 0, y: 0.5, z: 0 }) },
      ),
      sun(2),
      ambient(0.6),
      aimedCamera(2, 6, 0.5),
    ],
  }),

  // The product preset brings the light ground and the filmic grading; what is added here is the
  // backdrop that turns a floor into a set, and the three-point rig standing on it.
  photoStudio: () => ({
    nodes: [
      meshNode(
        { kind: 'plane', width: 12, height: 8 },
        { transform: transformAt({ x: 0, y: 4, z: -5 }), material: BACKDROP, castShadow: false },
      ),
      floor(12),
      lightNode(
        {
          kind: 'spot',
          color: '#ffffff',
          intensity: 60,
          distance: 0,
          angle: 0.6,
          penumbra: 0.4,
          decay: 2,
          target: ORIGIN,
        },
        { x: 3, y: 5, z: 4 },
      ),
      pointLight(20, { x: -4, y: 2, z: 3 }),
      pointLight(15, { x: 0, y: 3, z: -3 }),
      aimedCamera(1.2, 4, 0.8),
    ],
    world: presetPatch('product'),
  }),

  // A camera AND the rail it runs along, which is the point of the template: the shot is already
  // a move rather than a still. The haze is what gives a set depth on camera.
  cinematic: () => ({
    nodes: [
      floor(60),
      sun(1.6, { x: -8, y: 6, z: 4 }),
      ambient(0.3),
      aimedCamera(1.6, 8, 1.2),
      pathNode(),
    ],
    world: {
      ...presetPatch('night'),
      fog: { kind: 'linear', color: '#1b2029', near: 12, far: 90 },
    },
  }),

  // The sky IS the backdrop, and the sun is low enough to cast the long shadows a facade reads
  // by. The floor is wide because a building is not a prop.
  archvis: () => ({
    nodes: [floor(200), sun(3, { x: -30, y: 25, z: 15 }), aimedCamera(1.7, 14, 3)],
    world: presetPatch('outdoor'),
    play: { ...WALKING, camera: 'firstPerson' },
  }),

  postProcessing: () =>
    postProcessingTemplate({ floor, sun, ambient, pointLight, aimedCamera, backdrop: BACKDROP }),

  // The three below open on the SAME level and differ by where the camera stands — which is what
  // these three views are. A cadrage over an empty floor proved nothing: what makes them worth
  // picking is a set one can climb, fall off and bump into.
  // On the start pad, at eye height and facing down the set — where the walk begins the day a
  // controller reads `play`, rather than somewhere on the floor with the court behind it.
  firstPerson: folder =>
    characterView(
      [...scriptedFirst(playerModuleAt(STAND_IN_Z, 'firstPerson'), 'player', folder)],
      { camera: 'firstPerson' },
      'Capsule',
    ),

  // The camera stands back BEHIND the stand-in, which stands at z = 10 — over the shoulder means
  // both on the same axis, and the aim is at chest height.
  // 🛑 The module and nothing else: it carries the body, the arm and the camera, bound by the
  // TREE. The trio it replaces bound them by name, and a second `Camera` captured the arm.
  thirdPerson: folder =>
    characterView(
      [...scriptedFirst(playerModuleAt(STAND_IN_Z), 'player', folder)],
      { camera: 'thirdPerson' },
      'Capsule',
    ),

  topDown: folder =>
    characterView([scripted(standIn(), 'player', folder), aimedCamera(16, 11, 0.9, STAND_IN_Z)], {
      camera: 'topDown',
      moveSpeed: 6,
    }),

  // 🛑 No stand-in, and that is not an omission: a walker wins the camera seat over a machine,
  // so a silhouette left on the pad would frame the car from a pair of feet.
  // 🛑 The arm aims down the CAR's own nose, not where the pointer looks: a car turning under a
  // camera the mouse alone aims reads as a car sliding sideways.
  car: folder => ({
    nodes: [
      ...circuitNodes(),
      sun(2.4, { x: 60, y: 70, z: 40 }),
      skyLight(1.3),
      ...cameraRig(scriptedCar(folder), {
        orientation: 'subject',
        length: 8,
        height: 2.4,
      }),
    ],
    world: {
      ...presetPatch('outdoor'),
      background: { kind: 'color', color: '#b6c6d8' },
      // 🛑 The preset's own haze closes at 140 m and the circuit is 250 m across: the far side of
      // the loop was solid grey, which is why its shape could not be read at a glance.
      fog: { kind: 'linear', color: '#b6c6d8', near: 60, far: 420 },
      ground: { ...DEFAULT_GROUND, visible: true, size: 400, color: '#5c6b4f' },
    },
    play: { ...WALKING, camera: 'thirdPerson', played: CAR_NAME },
  }),

  plane: folder => ({
    nodes: [
      ...airfieldNodes(),
      ...mountainNodes(),
      sun(2.6, { x: 40, y: 50, z: 20 }),
      skyLight(1.4),
      ...scriptedFirst(planeNodes({ x: 0, y: CRUISE_ALTITUDE, z: 60 }), 'plane', folder),
      aimedCamera(CRUISE_ALTITUDE + 6, 30, CRUISE_ALTITUDE, 60),
    ],
    world: {
      ...presetPatch('outdoor'),
      background: { kind: 'color', color: '#9fc0e0' },
      // 🛑 The preset closes its haze at 140 m and this map is flown at 120: everything but the
      // wingtips was inside the fog. It now closes just short of the camera's own far plane, so
      // the horizon fades instead of being cut off.
      fog: { kind: 'linear', color: '#9fc0e0', near: 250, far: DEFAULT_CAMERA.far - 100 },
      // 🛑 Catches NO shadow: the map is kilometres across, so one shadow texel covers metres —
      // on a flat ground that reads as a grey moiré staircase, which made the editor unusable.
      ground: {
        ...DEFAULT_GROUND,
        visible: true,
        size: MOUNTAIN_WORLD,
        color: '#6f7f63',
        receiveShadow: false,
      },
    },
    play: { ...WALKING, camera: 'thirdPerson' },
  }),
}

/** Who the set's beacon and drone watch here, the stand-in being nowhere on this template. */
const CAR_NAME = 'Car'

/** The seeded file, named on every Animator the template laid down — empty stays the shipped preset. */
function withAnimatorGraph(nodes: readonly SceneNode[], graph: string): SceneNode[] {
  return nodes.map(node => {
    if (!node.components?.some(one => one.type === 'Animator')) return node
    return {
      ...node,
      components: node.components.map(one =>
        one.type === 'Animator' ? withComponentField(one, 'graph', graph) : one,
      ),
    }
  })
}

/** `cameraRig` needs the pair typed as a non-empty tuple, which `scriptedFirst` cannot promise. */
function scriptedCar(folder: string): [SceneNode, ...SceneNode[]] {
  const [body, ...rest] = carNodes(CIRCUIT_START, CAR_NAME, CIRCUIT_START_YAW)
  return [scripted(body, 'car', folder), ...rest]
}

/** Metres. High enough that a plane finding its speed has room to dip while it does. */
const CRUISE_ALTITUDE = 120

/**
 * The scene a template opens on. A fresh state on every call, ids included — two documents made
 * from one template share nothing.
 */
export function sceneFromTemplate(
  id: SceneTemplateId = DEFAULT_SCENE_TEMPLATE,
  scriptFolder: string = DEFAULT_ROLE_PATHS.code,
  graph?: string,
): SceneState {
  // Checked although the type says it cannot be wrong: the id crosses the boundary from the
  // naming window, and one this build has never heard of would throw on `BUILDERS[id]()`.
  const template = BUILDERS[isSceneTemplateId(id) ? id : DEFAULT_SCENE_TEMPLATE](scriptFolder)

  return {
    nodes: graph ? withAnimatorGraph(template.nodes, graph) : [...template.nodes],
    selectedIds: [],
    world: {
      ...DEFAULT_WORLD,
      ...template.world,
      play: { ...DEFAULT_WORLD.play, ...template.play },
    },
    animation: template.animation
      ? {
          ...EMPTY_TIMELINE,
          ...template.animation,
          // Derived rather than spelled out beside the tracks: a sheet written by hand drifts
          // from `readSheet` the day either moves, and an animated scene showing no line is a
          // state no file can be in.
          sheet: sheetFromAnimated(template.animation.tracks ?? [], template.animation.shots ?? []),
        }
      : EMPTY_TIMELINE,
  }
}
