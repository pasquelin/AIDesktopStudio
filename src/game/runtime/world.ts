// SPDX-License-Identifier: MIT

import type { Component, ComponentType } from '@shared/domain/component'
import type { Ref } from '@shared/domain/ref'
import type { ScenePlay } from '@shared/domain/scene'
import type { Transform } from '@shared/domain/transform'
import type { GameApi } from '../api/gameApi'
import { createEventBus, type EventBus } from '../events/eventBus'
import type { InputState } from '../ports/inputPort'
import type { InputMap } from './inputMap'
import type { InputActions } from './inputActions'
import { createWorldInput } from './worldInput'
import { createInputContexts, type InputContexts } from './inputContexts'
import { createInputControls, type InputControls } from './inputControls'
import { clonedTransform, copyTransformInto, restingTransform, type Entity } from './entity'
import { createEntityStore, type EntityStore } from './entityStore'
import { createRandom, type Random } from './random'
import { orderedByDeclaration, writeConflicts, type SystemShape } from './systemOrder'

export type System = SystemShape & {
  fixedUpdate?: (world: World, dt: number) => void
  /** `dt` is the FRAME's seconds, not the step's: what smoothing must be written against. */
  lateUpdate?: (world: World, alpha: number, dt: number) => void
  /** Gives back what the system took from a PORT it does not own — bodies, voices, handles. */
  dispose?: (world: World) => void
}

/**
 * 🛑 The world is MUTABLE and holds no reference to the document store — not by convention, by
 * absence of a path. That is what makes Play Mode safe: the runtime cannot write into the edit
 * state, so stopping restores nothing because nothing was touched.
 */
export type World = {
  readonly scene: Ref
  readonly entities: EntityStore
  readonly systems: readonly System[]
  readonly events: EventBus
  readonly random: Random
  readonly ports: GameApi
  /**
   * How the scene is WALKED rather than watched — the camera, the eye height, the pace and the
   * pull. Written into documents since 20/08 and read by nothing until the controller arrived.
   */
  readonly play: ScenePlay
  /** The clock, in TICKS first: a tick is the unit the network counts in. */
  readonly time: { tick: number; elapsed: number; readonly step: number }
  /** The input as of the step being run — DATA of the tick, never a live read. */
  input: InputState
  /**
   * The same input read as NAMED actions of the active contexts, sampled once a step. What the
   * built-in controllers answer, so a stick and a key reach them by one path.
   */
  readonly actions: InputActions
  readonly inputContexts: InputContexts
  readonly inputControls: InputControls
  /**
   * The four gestures a SYSTEM uses, all of them landing at the END of the step.
   *
   * 🛑 A `Set` visits what is added to it while it is being walked, so a system spawning — or
   * attaching what it sweeps for — would walk what it just made, for ever. The editor writes
   * through `entities` directly; a system never does.
   */
  spawn: (request: {
    name: string
    transform?: Transform
    components?: readonly Component[]
  }) => Entity
  destroy: (id: string) => void
  attach: (entity: Entity, component: Component) => void
  detach: (entity: Entity, type: ComponentType) => void
  /**
   * One fixed step: the pose to interpolate FROM, the input snapshot, the systems in order, then
   * the births, the deaths and the events.
   */
  step: (dt: number) => void
  lateUpdate: (alpha: number, dt: number) => void
  /** Drops every subscription and gives every system's port holdings back. Idempotent. */
  dispose: () => void
}

export type WorldOptions = {
  scene: Ref
  ports: GameApi
  systems: readonly System[]
  /** Same seed, same world — what a replay, a test and network prediction all rest on. */
  seed: number
  step: number
  play: ScenePlay
  inputMaps?: readonly InputMap[]
  inputControls?: InputControls
}

export function createWorld(options: WorldOptions): World {
  const systems = orderedByDeclaration(options.systems)
  const born: Entity[] = []
  const bornIds = new Set<string>()
  const doomed: string[] = []
  const doomedIds = new Set<string>()
  const attaching: { entity: Entity; component: Component }[] = []
  const detaching: { entity: Entity; type: ComponentType }[] = []
  let minted = 0
  const inputControls = options.inputControls ?? createInputControls(options.inputMaps ?? [])
  const saidOfInput = (message: string): void => options.ports.log.write('warn', message)
  const contexts = createInputContexts(inputControls.maps(), saidOfInput)
  const input = createWorldInput(inputControls, contexts, options.ports.input.state(), saidOfInput)

  // Not `messageOf` of `@shared/guards`: this tree is MIT and ships without the rest, so a VALUE
  // taken from `@shared/` would carry PolyForm code into an exported game.
  const said = (error: unknown): string => (error instanceof Error ? error.message : String(error))

  const runFixed = (world: World, dt: number): void => {
    for (const system of systems) {
      if (!system.fixedUpdate) continue
      try {
        system.fixedUpdate(world, dt)
      } catch (error) {
        world.ports.log.write('error', `system ${system.name} threw: ${said(error)}`)
      }
    }
  }

  const applyPending = (world: World): void => {
    for (const entity of born) world.entities.add(entity)
    born.length = 0
    bornIds.clear()
    for (const wanted of attaching) world.entities.attach(wanted.entity, wanted.component)
    attaching.length = 0
    for (const wanted of detaching) world.entities.detach(wanted.entity, wanted.type)
    detaching.length = 0
    for (const id of doomed) world.entities.remove(id)
    doomed.length = 0
    doomedIds.clear()
  }

  const world: World = {
    scene: options.scene,
    entities: createEntityStore(),
    systems,
    events: createEventBus((error, event) =>
      options.ports.log.write('error', `handler of ${event.name} threw: ${said(error)}`),
    ),
    random: createRandom(options.seed),
    ports: options.ports,
    play: options.play,
    time: { tick: 0, elapsed: 0, step: options.step },
    get input() {
      return input.state()
    },
    set input(state: InputState) {
      input.take(state)
    },
    get actions() {
      return input.actions
    },
    inputContexts: contexts,
    inputControls,

    spawn: request => {
      // Counted rather than drawn from `crypto.randomUUID`: two runs of one seed must mint the
      // same identifiers. Taken ones are stepped over, so a world restored from a save cannot
      // mint an identifier it already carries.
      do minted += 1
      while (world.entities.get(`spawn_${minted}`) !== null)

      const entity: Entity = {
        id: `spawn_${minted}`,
        name: request.name,
        transform: request.transform ?? restingTransform(),
        components: [...(request.components ?? [])],
      }
      born.push(entity)
      bornIds.add(entity.id)
      world.events.emit({ name: 'EntitySpawned', entity: entity.id, payload: {} })
      return entity
    },

    destroy: id => {
      // A death announced for an entity that never lived is a handler acting on nothing. Killing
      // one twice says so once.
      const lives = world.entities.get(id) !== null || bornIds.has(id)
      if (!lives || doomedIds.has(id)) return

      doomed.push(id)
      doomedIds.add(id)
      world.events.emit({ name: 'EntityDestroyed', entity: id, payload: {} })
    },

    attach: (entity, component) => {
      attaching.push({ entity, component })
    },

    detach: (entity, type) => {
      detaching.push({ entity, type })
    },

    step: dt => {
      // 🛑 Here and not in `createGameLoop`: `world.step` is what DEFINES a step, and a second
      // caller — a hand-driven step, a replay — would otherwise draw with no pose to come from.
      for (const entity of world.entities.all()) keepPose(entity)
      world.input = world.ports.input.state()

      runFixed(world, dt)
      applyPending(world)
      world.events.drain()
      world.ports.input.endStep()

      world.time.tick += 1
      world.time.elapsed += dt
    },

    lateUpdate: (alpha, dt) => {
      for (let index = 0; index < systems.length; index++) {
        const system = systems[index]
        if (!system?.lateUpdate) continue
        try {
          system.lateUpdate(world, alpha, dt)
        } catch (error) {
          world.ports.log.write('error', `system ${system.name} threw: ${said(error)}`)
        }
      }
    },

    dispose: () => {
      // Guarded like every other system call: one that throws must not keep the rest holding on.
      for (const system of systems) {
        try {
          system.dispose?.(world)
        } catch (error) {
          world.ports.log.write('error', `system ${system.name} threw on dispose: ${said(error)}`)
        }
      }
      world.events.clear()
    },
  }

  // Said once, at build time: which system owns a component is not a thing a running step can
  // work out, and two writers means the winner is whichever order happened to be declared.
  for (const type of writeConflicts(systems)) {
    world.ports.log.write('warn', `two systems write ${type}`)
  }

  return world
}

function keepPose(entity: Entity): void {
  const held = entity.previous
  if (held) copyTransformInto(held, entity.transform)
  else entity.previous = clonedTransform(entity.transform)
}
