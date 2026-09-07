// SPDX-License-Identifier: MIT

import type { Component, JsonValue } from '@shared/domain/component'
import type { GameEvent } from '@shared/domain/gameEvent'
import type { Animators } from '../animators'
import type { Intents } from '../intents'
import type { ScriptModule } from '../../ports/scriptPort'
import type {
  ScriptEntity,
  ScriptFault,
  ScriptFrame,
  ScriptIntent,
  ScriptOutcome,
} from '../../script/frame'
import { settingsOf, textOf } from '../componentFields'
import { componentOf, type Entity } from '../entity'
import { sayCustom } from '../sayCustom'
import type { System, World } from '../world'

export type ScriptSystemOptions = {
  /** Already transpiled by the studio: the sandbox runs JavaScript, an author writes TypeScript. */
  modules: readonly ScriptModule[]
  /** Told what went wrong, with the script and the entity it belongs to. */
  onFault: (fault: ScriptFault) => void
  /** Where a script's asks LAND — read by the three built-in controllers on the same step. */
  intents: Intents
  /**
   * The walking body of a module, resolved from the TREE — which the runtime does not hold. A
   * script sits on the module in one template and on the capsule itself in two others, and
   * `self.walk()` has to reach the body from both.
   */
  bodyIdOf: (moduleId: string) => string | null
  /**
   * The ANIMATED part of a module, resolved from the tree the same way its body is.
   *
   * 🛑 Never the same node as the body: a character's mesh hangs under the capsule that walks, so
   * `self.anim` asked from a script on the module would write where no animator ever reads.
   *
   * 🛑 Blind spot, written rather than hidden: it answers for the PLAYER's module alone, as
   * `bodyIdOf` does. A scripted module of any other kind writes on its own id, where nothing
   * reads — silently, exactly as an ask landing on a body no controller drives is dropped.
   */
  animatorIdOf: (moduleId: string) => string | null
  /** Where a script's animator asks LAND, read by the animator system on the same step. */
  animators: Animators
}

/** Shared and empty: a frame with nothing kept must not allocate an object per hook. */
const NOTHING_KEPT: Readonly<Record<string, JsonValue>> = Object.freeze({})

/** An entity as the sandbox hears of one it can no longer see: a name, and nowhere to be. */
const blank = (entity: string): ScriptEntity => ({
  entity,
  name: '',
  position: ZERO(),
  rotation: ZERO(),
  components: [],
})

/** 🛑 A script never touches the world: it is handed a COPY — see `ScriptIntent` for why. */
export function createScriptSystem(options: ScriptSystemOptions): System {
  const known = new Set<string>()
  const seen = new Set<string>()
  const fresh: { entity: string; script: string; props: Record<string, JsonValue> }[] = []
  const freshIds = new Set<string>()
  const gone: ScriptEntity[] = []
  const pool: ScriptEntity[] = []
  // 🛑 Kept ONLY while a script declares `onDestroy`: by the time the system notices a death, the
  // entity has left the store, and its last position is the one thing the hook cannot ask for.
  const closing = new Map<string, ScriptEntity>()
  const entities: ScriptEntity[] = []
  const frame: ScriptFrame = {
    tick: 0,
    dt: 0,
    input: { held: [], pressed: [], released: [], pointer: { x: 0, y: 0, down: false } },
    actions: {},
    bindings: {},
    entities,
    kept: {},
  }
  const waiting: GameEvent[] = []
  // Read once, on the first step, and let go of afterwards: it is the JavaScript of every script
  // of the project, and the system would otherwise hold it for the whole session.
  let modules: readonly ScriptModule[] | null = options.modules
  let bindingsRevision = -1
  const onFault = options.onFault

  /** Once, on the first step the system runs: the machine is fed and the bus is listened to. */
  const loadOnFirstStep = (world: World, port: World['ports']['script']): void => {
    if (!modules) return
    port.seed(world.random.state())
    for (const fault of port.load(modules)) onFault(fault)
    modules = null
    // Never dropped by hand: STOP clears the bus whole, which takes this with it.
    world.events.onAny(event => waiting.push(event))
  }

  const took = (world: World, outcome: ScriptOutcome): void => {
    apply(world, outcome.intents, options)
    for (const fault of outcome.faults) onFault(fault)
  }

  /** Every scripted entity as the sandbox sees it, rebuilt in place rather than allocated. */
  const compose = (world: World, dt: number, only?: ReadonlySet<string>): ScriptFrame => {
    entities.length = 0
    for (const entity of world.entities.withComponent('Script')) {
      if (!known.has(entity.id)) continue
      if (only && !only.has(entity.id)) continue

      let held = pool[entities.length]
      if (!held) {
        held = {
          entity: '',
          name: '',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          components: [],
        }
        pool.push(held)
      }
      held.entity = entity.id
      held.name = entity.name
      held.position = entity.transform.position
      held.rotation = entity.transform.rotation
      held.components = entity.components
      held.anim = options.animators.playingOn(animatorFor(entity, options)) ?? undefined
      entities.push(held)
    }

    frame.tick = world.time.tick
    frame.dt = dt
    frame.input = world.input
    frame.actions = world.actions.values
    const revision = world.inputControls.revision()
    frame.bindings = revision === bindingsRevision ? undefined : world.inputControls.bindings()
    bindingsRevision = revision
    // Only when there IS something kept: the frame is serialized whole for every hook of every
    // step, and an inventory put aside at the menu would be paid for twice a step for ever.
    const kept = world.ports.scenes.kept()
    frame.kept = Object.keys(kept).length > 0 ? kept : NOTHING_KEPT
    return frame
  }

  const remember = (entity: Entity): void => {
    let held = closing.get(entity.id)
    if (!held) {
      held = blank(entity.id)
      closing.set(entity.id, held)
    }
    held.name = entity.name
    held.position = entity.transform.position
    held.rotation = entity.transform.rotation
    held.components = entity.components
  }

  const discover = (world: World, remembering: boolean): void => {
    for (const entity of world.entities.withComponent('Script')) {
      seen.add(entity.id)
      if (remembering) remember(entity)
      if (known.has(entity.id)) continue
      const held = componentOf(entity, 'Script')
      const script = textOf(held, 'script', '')
      if (script.length === 0) continue
      known.add(entity.id)
      fresh.push({ entity: entity.id, script, props: settingsOf(held, 'props') })
      freshIds.add(entity.id)
    }
  }

  const collectGone = (): void => {
    for (const name of known) {
      if (!seen.has(name)) gone.push(closing.get(name) ?? blank(name))
    }
    for (const one of gone) {
      known.delete(one.entity)
      closing.delete(one.entity)
    }
  }

  const sync = (world: World): void => {
    const port = world.ports.script
    const remembering = port.declares('onDestroy')
    seen.clear()
    fresh.length = 0
    freshIds.clear()
    gone.length = 0

    discover(world, remembering)
    collectGone()
    if (gone.length > 0) took(world, port.detach(gone))
    if (fresh.length > 0) {
      for (const fault of port.attach(fresh)) onFault(fault)
      // Composed over `freshIds` alone: the ones that were already running have had their turn.
      if (port.declares('onCreate')) took(world, port.run('onCreate', compose(world, 0, freshIds)))
      // A newcomer may be the FIRST to declare `onDestroy`, and the sweep above then remembered
      // nobody. Already remembering means every entity above went through `remember`.
      if (!remembering && port.declares('onDestroy'))
        for (const entity of world.entities.withComponent('Script')) remember(entity)
    }
  }

  return {
    name: 'script',
    reads: ['Script'],
    writes: [],

    fixedUpdate: (world: World, dt: number) => {
      const port = world.ports.script
      loadOnFirstStep(world, port)

      // Before a hook runs: what nobody asks for again hands the sticks back on that very step.
      options.intents.release()
      options.animators.release()

      sync(world)

      // Between two steps, never during one — a handler that spawned mid-sweep would walk what it
      // had just made. Emptied whether or not anyone listens, or a scriptless world hoards them.
      if (waiting.length > 0) {
        if (known.size > 0 && EVENT_HOOKS.some(hook => port.declares(hook)))
          took(world, port.deliver(compose(world, dt), routed(waiting, known, options)))
        waiting.length = 0
      }
      if (known.size === 0) return

      // `onStart` on the first step and `onUpdate` on the same one: an author who wrote both
      // means « once everything exists, then every step », not « one step later ».
      const opening = world.time.tick === 0 && port.declares('onStart')
      const stepping = port.declares('onUpdate')
      if (!opening && !stepping) return

      const composed = compose(world, dt)
      if (opening) took(world, port.run('onStart', composed))
      if (stepping) took(world, port.run('onUpdate', composed))
    },

    lateUpdate: (world: World) => {
      const port = world.ports.script
      if (modules) return
      if (known.size > 0 && port.declares('onLateUpdate'))
        took(world, port.run('onLateUpdate', compose(world, world.time.step)))
      // Last word of the rendered frame: what the next one spends is a whole budget again.
      port.refill()
    },

    /** 🛑 The sandbox outlives a swap; instances left in it tick for entities nobody holds. */
    dispose: (world: World) => {
      if (known.size === 0) return

      const port = world.ports.script
      // 🛑 What was queued for the NEXT step, delivered now: there will be no next step, and
      // `SceneLoading` — the « save before leaving » idiom — is exactly what waits here.
      if (waiting.length > 0 && EVENT_HOOKS.some(hook => port.declares(hook))) {
        took(world, port.deliver(compose(world, 0), waiting))
        waiting.length = 0
      }
      // 🛑 What `onDestroy` asked for, applied like any other outcome: a hook putting a key aside
      // on the way out had its intent dropped, and its faults with it.
      took(world, port.detach([...known].map(name => closing.get(name) ?? blank(name))))
      known.clear()
      closing.clear()
    },
  }
}

/**
 * The events of an ANIMATED part, readdressed to the script that can hear them.
 *
 * 🛑 A module's script sits on the module and its animator on the mesh, so a hook named for the
 * event's own entity would reach nobody — `onAnimationEvent` was unreachable from the very script
 * a template lays down. Only when nothing scripts the part itself: a PNJ carrying both keeps its
 * own events.
 */
function routed(
  events: readonly GameEvent[],
  known: ReadonlySet<string>,
  { animatorIdOf }: ScriptSystemOptions,
): readonly GameEvent[] {
  if (!events.some(event => ANIMATION_EVENTS.includes(event.name))) return events

  return events.map(event => {
    if (!event.entity || known.has(event.entity) || !ANIMATION_EVENTS.includes(event.name))
      return event
    const owner = [...known].find(id => animatorIdOf(id) === event.entity)
    return owner ? { ...event, entity: owner } : event
  })
}

const ANIMATION_EVENTS: readonly GameEvent['name'][] = ['AnimationEvent', 'AnimationFinished']

/** What an event drives. A frame with none of them declared never crosses the bridge at all. */
const EVENT_HOOKS = [
  'onMessage',
  'onAnimationEvent',
  'onCollision',
  'onTriggerEnter',
  'onTriggerExit',
]

/** What the scripts asked for, done through the world's own gestures and nothing else. */
function apply(world: World, asks: readonly ScriptIntent[], options: ScriptSystemOptions): void {
  for (const intent of asks) {
    if (applyWorldIntent(world, intent)) continue
    const entity = world.entities.get(intent.entity)
    if (!entity) continue
    if (applyBodyIntent(entity, intent, options)) continue
    if (applyAnimatorIntent(entity, intent, options)) continue
    applyEntityIntent(world, entity, intent)
  }
}

/**
 * 🛑 Written into a MAGAZINE, never into a transform: a walk is what the character controller
 * then has to reconcile with gravity, a slope and whatever wall is in the way. Placing the body
 * here would put it through that wall, before `physics` ever heard about it.
 */
function applyBodyIntent(
  entity: Entity,
  intent: ScriptIntent,
  { intents, bodyIdOf }: ScriptSystemOptions,
): intent is BodyIntent {
  // The script's own entity when it walks itself, its module's body when it sits on the module.
  const body = bodyIdOf(entity.id) ?? entity.id

  if (intent.act === 'walk') intents.walk(body, intent.x, intent.z)
  else if (intent.act === 'jump') intents.jump(body)
  else if (intent.act === 'look') intents.look(body, intent.yaw, intent.pitch)
  else if (intent.act === 'drive')
    intents.drive(body, intent.throttle, intent.steer, intent.handBrake)
  else if (intent.act === 'fly')
    intents.fly(body, intent.pitch, intent.roll, intent.yaw, intent.throttle)
  else return false
  return true
}

/**
 * 🛑 The chain above discriminates ALONE, as `applyWorldIntent` does. A second list beside it
 * could drift, and what an act missing from one of the two falls through to is `destroy`.
 */
type BodyIntent = Extract<ScriptIntent, { act: 'walk' | 'jump' | 'look' | 'drive' | 'fly' }>

/**
 * 🛑 Its own chain, ahead of `applyEntityIntent`: that one ends in an unguarded `destroy`, so an
 * act it does not name would DELETE the entity that asked for it.
 */
function applyAnimatorIntent(
  entity: Entity,
  intent: ScriptIntent,
  options: ScriptSystemOptions,
): intent is AnimatorIntent {
  const { animators } = options
  const animated = animatorFor(entity, options)

  if (intent.act === 'animParam') animators.set(animated, intent.param, intent.value)
  else if (intent.act === 'animPlay') animators.play(animated, intent.state)
  else if (intent.act === 'animStop') animators.stop(animated)
  else return false
  return true
}

/** The script's own entity when it carries the animator, its module's animated part otherwise. */
const animatorFor = (entity: Entity, { animatorIdOf }: ScriptSystemOptions): string =>
  animatorIdOf(entity.id) ?? entity.id

type AnimatorIntent = Extract<ScriptIntent, { act: 'animParam' | 'animPlay' | 'animStop' }>

type WorldIntent = Extract<
  ScriptIntent,
  {
    act: 'log' | 'spawn' | 'emit' | 'scene' | 'keep' | 'inputContext' | 'inputRebind' | 'inputReset'
  }
>
type EntityIntent = Exclude<ScriptIntent, WorldIntent | BodyIntent | AnimatorIntent>

function applyWorldIntent(world: World, intent: ScriptIntent): intent is WorldIntent {
  if (intent.act === 'log') world.ports.log.write(intent.level, intent.message)
  else if (intent.act === 'spawn') world.spawn({ name: intent.name, transform: placed(intent.at) })
  else if (intent.act === 'emit')
    sayCustom(world, intent.name, intent.entity ?? undefined, intent.payload)
  else if (intent.act === 'scene') world.ports.scenes.load(intent.scene, intent.fade)
  else if (intent.act === 'keep') world.ports.scenes.keep(intent.key, intent.value)
  else if (intent.act === 'inputContext') world.inputContexts[intent.action](intent.id)
  else if (intent.act === 'inputRebind')
    world.inputControls.rebind(intent.context, intent.action, intent.index, intent.binding)
  else if (intent.act === 'inputReset') world.inputControls.reset(intent.context, intent.action)
  else return false
  return true
}

function applyEntityIntent(world: World, entity: Entity, intent: EntityIntent): void {
  if (intent.act === 'move') {
    entity.transform.position.x += intent.by.x
    entity.transform.position.y += intent.by.y
    entity.transform.position.z += intent.by.z
  } else if (intent.act === 'place') {
    entity.transform.position.x = intent.at.x
    entity.transform.position.y = intent.at.y
    entity.transform.position.z = intent.at.z
  } else if (intent.act === 'turn') {
    entity.transform.rotation.x = intent.to.x
    entity.transform.rotation.y = intent.to.y
    entity.transform.rotation.z = intent.to.z
  } else if (intent.act === 'field') write(world, entity, intent.type, intent.key, intent.value)
  else if (intent.act === 'destroy') world.destroy(intent.entity)
  // 🛑 Named rather than fallen through to: this chain used to END on `destroy`, so an act added
  // to `ScriptIntent` and forgotten here DELETED the entity that asked for it — and compiled.
  else unroutedIntent(intent)
}

const unroutedIntent = (intent: never): void => void intent

/**
 * 🛑 One field the component ALREADY carries. `newComponent` fills every declared field, so a key
 * that is not there is one nobody declared — it would enter the document and never leave.
 */
function write(world: World, entity: Entity, type: string, key: string, value: JsonValue): void {
  for (const held of entity.components) {
    if (held.type !== type) continue
    if (key === 'type' || !(key in held)) return
    const next: Component = { ...held, [key]: value, type: held.type }
    // Through the WORLD, which defers to the end of the step — `entityStore` writes at once, and
    // a system must not add to an index it is walking.
    world.attach(entity, next)
    return
  }
}

const placed = (at: { x: number; y: number; z: number } | null) =>
  at ? { position: { ...at }, rotation: ZERO(), scale: { x: 1, y: 1, z: 1 } } : undefined

const ZERO = () => ({ x: 0, y: 0, z: 0 })
