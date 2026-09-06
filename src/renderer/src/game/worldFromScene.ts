import { COMPONENTS } from '@shared/domain/componentRegistry'
import { enabledTerrains, type SceneWorld } from '@shared/domain/scene'
import type { HeightmapSamples } from '@shared/domain/heightmap'
import { copyTransform, IDENTITY_TRANSFORM, type Transform } from '@shared/domain/transform'
import type { GameApi } from '@game/api/gameApi'
import type { BodyDescriptor } from '@game/ports/physicsPort'
import { createCharacters } from '@game/runtime/characters'
import { createAnimators, type Animators } from '@game/runtime/animators'
import { createAnimatorSystem } from '@game/runtime/systems/animator'
import { createIntents, type Intents } from '@game/runtime/intents'
import { createPossessions } from '@game/runtime/possessions'
import { createPossessionSystem } from '@game/runtime/systems/possession'
import type { Entity } from '@game/runtime/entity'
import { STEP_SECONDS } from '@game/runtime/gameLoop'
import { createFollowSystem } from '@game/runtime/systems/follow'
import { createLookAtSystem } from '@game/runtime/systems/lookAt'
import { createMovementSystem } from '@game/runtime/systems/movement'
import { createOrbitSystem } from '@game/runtime/systems/orbit'
import { createPathSystem } from '@game/runtime/systems/path'
import { createPatrolSystem } from '@game/runtime/systems/patrol'
import { createSpinSystem } from '@game/runtime/systems/spin'
import { createPhysicsSystem } from '@game/runtime/systems/physics'
import { createPilots } from '@game/runtime/pilots'
import { createRigs } from '@game/runtime/rigs'
import { createAircraftSystem } from '@game/runtime/systems/aircraft'
import { createPlayCameraSystem } from '@game/runtime/systems/playCamera'
import { createSpringArmSystem } from '@game/runtime/systems/springArm'
import { createVehicleSystem } from '@game/runtime/systems/vehicle'
import { createScriptSystem, type ScriptSystemOptions } from '@game/runtime/systems/script'
import { createTimelineSystem } from '@game/runtime/systems/timeline'
import { createWorld, type System, type World } from '@game/runtime/world'
import type { ColliderShape } from '@game/physics/shape'
import type { SceneNode, SceneState } from '@/engines/scene/sceneState'
import { colliderFromNode } from './colliderFromNode'
import { colliderFromRelief } from './colliderFromRelief'
import { createHierarchy } from './hierarchy'
import { graphNamed } from './animatedNodes'
import { playerPartsOf, withBoundPlayerArm } from '@/engines/scene/playerModule'
import { bakedRuntimeNodes } from '@/engines/scene/bakedRuntimeNodes'
import { scatterGroundOf, scatterTerrainsOf } from '@shared/domain/scatterGround'
import { scatterCollisionOf } from './scatterCollision'
import type { InputMap } from '@shared/domain/inputMap'
import type { AnimationGraph, AnimationGraphModule } from '@shared/domain/animationGraph'
import type { InputControls } from '@game/runtime/inputControls'

/**
 * The scene's own floor is not a node, so it is not an entity either — and a game whose ground
 * nobody stands on is the first thing anyone tries. A dot keeps the name out of reach of a uuid.
 */
/** The scatter half of the statics, and what it could not place. */
function scatterBodies(
  world: SceneWorld,
  heightmaps: ReadonlyMap<string, HeightmapSamples>,
  warn: (message: string) => void,
): readonly BodyDescriptor[] {
  const terrains = scatterTerrainsOf(world, heightmaps)
  const scatter = scatterCollisionOf(world, scatterGroundOf(terrains))
  // Without one, every capsule lands at y = 0 — the relief branch already says so for its own
  // half, and a silent floor of props at the origin is the harder thing to diagnose.
  if (terrains.length === 0 && scatter.bodies.length > 0)
    warn(`scatter collision placed ${scatter.bodies.length} bodies with no heightmap loaded`)
  for (const refused of scatter.refused)
    warn(`scatter ${refused.layerId} collision refused for ${refused.count} instances`)
  return scatter.bodies
}

const GROUND_BODY = 'world.ground'
/** Deep enough that nothing falls through it in one step at terminal speed. */
const GROUND_DEPTH = 5
/**
 * The edit state, translated into something that runs.
 *
 * 🛑 A COPY, down to each vector: the world writes positions in place, and sharing the document's
 * own objects would let a step edit the scene the user is editing. Nothing here holds a reference
 * back to the store either — that absence is what makes STOP restore nothing.
 *
 * In the window rather than under `src/game`: `SceneState` is the studio's, and the runtime may
 * not import it. An exported game reads its `.gltf` instead, the same translation from the other
 * side.
 */
export function worldFromScene(
  documentId: string,
  given: SceneState,
  ports: GameApi,
  scripts: SceneScripts = {},
  seed = 1,
  heightmaps?: ReadonlyMap<string, HeightmapSamples>,
  inputMaps: readonly InputMap[] = [],
  inputControls?: InputControls,
  animationGraphs: readonly AnimationGraphModule[] = [],
): World {
  // A module's arm reads the TREE rather than its two written names. It rewrites the STATE where
  // `lensOf` and the seat stay closure arguments: `springArm` reads its two fields off the
  // ENTITY, so what the tree says has to be in the components an entity is built from.
  const state: SceneState = {
    ...given,
    nodes: bakedRuntimeNodes(withBoundPlayerArm(given.nodes)),
  }
  // 🛑 Made HERE and handed to both sides: the three controllers read what the scripts write, and
  // a second store would leave the feature dead with every suite green.
  const intents = createIntents(message => ports.log.write('warn', message))
  // 🛑 Made HERE and handed to both sides, as `intents` is: a second store leaves the surface dead.
  const animators = createAnimators()
  const told = scriptOptionsFor(state, ports, scripts, intents, animators)
  // Filled the line after the world stands, and read only once a step runs: what lets the
  // hierarchy compose a parent where the game has MOVED it — see `createHierarchy`.
  let living: World | null = null
  const world = createWorld({
    scene: { kind: 'document', id: documentId },
    ports,
    systems: systemsFor(
      state,
      ports,
      told,
      intents,
      animators,
      graphNamed(animationGraphs),
      id => living?.entities.get(id)?.transform ?? null,
      heightmaps,
    ),
    seed,
    step: STEP_SECONDS,
    play: state.world.play,
    inputMaps,
    inputControls,
  })
  living = world
  installEntities(world, state)
  return world
}
function installEntities(world: World, state: SceneState): void {
  for (const node of state.nodes) {
    world.entities.add({
      id: node.id,
      name: node.name,
      transform: copyTransform(node.transform),
      // 🛑 Deep, not a spread: a shallow copy leaves the DOCUMENT'S own component objects in the
      // world, and a system writing into one would edit the scene being edited — with no store
      // action, so `isSceneDirty` stays false and a ⌘S saves it. Safe because a component is pure
      // JSON by contract.
      components: structuredClone([...(node.components ?? [])]),
    })
  }
}
/** What a caller may SET: the two the world resolves for itself are not among them. */
type SceneScripts = Partial<Pick<ScriptSystemOptions, 'modules' | 'onFault'>>

/**
 * 🛑 One MODULE resolution for the whole world: `possession` freezes the body a rider carries and
 * a script's `walk` has to reach that same body — two answers would drift.
 */
function scriptOptionsFor(
  state: SceneState,
  ports: GameApi,
  scripts: SceneScripts,
  intents: Intents,
  animators: Animators,
): ScriptSystemOptions {
  const played = playerPartsOf(state.nodes)
  return {
    modules: scripts.modules ?? [],
    intents,
    bodyIdOf: moduleId => (moduleId === played?.module.id ? (played.body?.id ?? null) : null),
    animatorIdOf: moduleId =>
      moduleId === played?.module.id ? (played.animated?.id ?? null) : null,
    animators,
    // 🛑 The game's own log rather than nothing: without a studio listening, a fault that goes
    // nowhere is a script that silently never ran — and a caller passing an empty one is how
    // that happened in the exported game.
    onFault:
      scripts.onFault ??
      (fault => ports.log.write('error', `${fault.script}:${fault.line} — ${fault.message}`)),
  }
}

/** Every system the studio runs today. A component gains its behaviour by joining this list. */
function systemsFor(
  state: SceneState,
  ports: GameApi,
  scripts: ScriptSystemOptions,
  intents: Intents,
  animators: Animators,
  graphOf: (ref: string) => AnimationGraph | null,
  liveOf: (nodeId: string) => Transform | null,
  heightmaps?: ReadonlyMap<string, HeightmapSamples>,
): readonly System[] {
  const { bodyIdOf } = scripts
  const byId = new Map(state.nodes.map(node => [node.id, node]))
  const hierarchy = createHierarchy(byId, liveOf)
  const placedAt = (entity: Entity, own: Transform): Transform => hierarchy.worldOf(entity.id, own)
  const systemsForStep1 = () => {
    const placed = (entity: Entity): Transform => placedAt(entity, entity.transform)
    const possessions = createPossessions()
    const characters = createCharacters(possessions, placed, intents)
    const systemsForStep2 = () => {
      const pilots = createPilots()
      const player = playerPartsOf(state.nodes)
      const rigs = createRigs(player?.eye?.id ?? null)
      const systemsForStep3 = () => {
        /**
         * 🛑 A node hanging from another is FELT now, and that closed the hole this carried since the
         * physics arrived: the body goes in at its composed place — see `hierarchy` — and what the step
         * moves is written back into the frame the node hangs in.
         *
         * What stays true: the SHAPE is the node's own, so a scaled parent stretches the mesh and not
         * the collider. Named here rather than discovered.
         */
        const shapeOf = (entity: Entity): ColliderShape | null => {
          const node = byId.get(entity.id)
          if (!node) return null
          const collider = colliderFromNode(node)
          if (!collider) {
            ports.log.write('warn', `${node.name} has no shape the physics can feel`)
            return null
          }
          if (!collider.exact) {
            ports.log.write(
              'warn',
              `${node.name} collides as a hull: its fidelity could not be met`,
            )
          }
          return collider.shape
        }
        return [
          createScriptSystem(scripts),
          createTimelineSystem({
            timeline: state.animation,
            assetRef: id => ({ kind: 'asset', id }),
          }),
          createMovementSystem(),
          createPathSystem(),
          createPatrolSystem(),
          createFollowSystem(),
          createOrbitSystem(),
          createSpinSystem(),
          createLookAtSystem(),
          createVehicleSystem(pilots, intents, placed),
          createAircraftSystem(pilots, intents, placed),
          createPossessionSystem({
            possessions,
            bodyIdOf,
            worldOf: placedAt,
            localOf: (entity, position, rotation) =>
              hierarchy.localOf(entity.id, position, rotation),
          }),
          createPhysicsSystem({
            shapeOf,
            characters,
            possessions,
            statics: staticsOf(state, heightmaps, message => ports.log.write('warn', message)),
            worldOf: placed,
            localOf: (entity, position, rotation) =>
              hierarchy.localOf(entity.id, position, rotation),
          }),
          createSpringArmSystem({
            characters,
            rigs,
            worldOf: placedAt,
            localOf: (entity, position, rotation) =>
              hierarchy.localOf(entity.id, position, rotation),
            lensOf: entity => cameraLensOf(byId.get(entity.id)),
          }),
          createAnimatorSystem({ graphOf, characters, animators }),
          createPlayCameraSystem({
            characters,
            worldOf: placedAt,
            pilots,
            rigs,
            playerBodyId: player?.body?.id ?? null,
          }),
        ]
      }
      return systemsForStep3()
    }
    return systemsForStep2()
  }
  return systemsForStep1()
}
/** The REST lens of a camera node — a game plays no timeline, so `lensAt` is never asked. */
function cameraLensOf(node: SceneNode | undefined): number | null {
  return node?.type === 'camera' ? node.camera.fov : null
}

/** The scene's ground as a slab, its top face at zero — where the studio draws it. */
function staticsOf(
  state: SceneState,
  heightmaps: ReadonlyMap<string, HeightmapSamples> | undefined,
  warn: (message: string) => void,
): readonly BodyDescriptor[] {
  const bodies: BodyDescriptor[] = []
  for (const relief of enabledTerrains(state.world.layers)) {
    const samples = heightmaps?.get(relief.heightmap.assetId)
    const shape = samples ? colliderFromRelief(relief, samples) : null
    if (shape) bodies.push(staticBody(`world.relief.${relief.id}`, shape))
    else warn(`relief ${relief.heightmap.assetId} has no heightmap the physics can feel`)
  }
  const ground = state.world.ground
  if (bodies.length === 0 && ground.visible) {
    bodies.push(
      staticBody(GROUND_BODY, {
        kind: 'cuboid',
        hx: ground.size / 2,
        hy: GROUND_DEPTH / 2,
        hz: ground.size / 2,
        at: { x: 0, y: -GROUND_DEPTH / 2, z: 0 },
      }),
    )
  }
  bodies.push(...scatterBodies(state.world, heightmaps ?? new Map(), warn))
  return bodies
}
function staticBody(body: string, shape: ColliderShape): BodyDescriptor {
  return {
    body,
    kind: 'fixed',
    shape,
    transform: IDENTITY_TRANSFORM,
    friction: Number(COMPONENTS.Collider.defaults.friction),
    restitution: Number(COMPONENTS.Collider.defaults.restitution),
    mass: 0,
    gravityScale: 1,
    lockRotation: false,
    sensor: false,
    character: null,
    vehicle: null,
  }
}
