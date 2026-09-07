// SPDX-License-Identifier: MIT

import { INPUT_MAP_VERSION } from '../inputMap'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Component, JsonValue } from '@shared/domain/component'
import { newComponent, withComponentField } from '@shared/domain/componentRegistry'
import { createAnimators } from '../animators'
import { createIntents } from '../intents'
import { loadQuickjsScripts } from '../../host/quickjsScripts'
import type { ScriptFault } from '../../script/frame'
import type { ScriptPort } from '../../ports/scriptPort'
import { restingTransform } from '../entity'
import { STEP_SECONDS } from '../gameLoop'
import { testPorts, testWorld } from '../world-fixtures'
import type { World } from '../world'
import type { InputMap } from '../inputMap'
import { createScriptSystem } from './script'

const STEP = 1 / 60
const WALK = 'script:Walk.ts'

/** Fresh per case: a store shared between them would carry one test's ask into the next. */
let intents = createIntents()

const scripted = (body: string): string => `exports.default = defineScript({ ${body} })`

/**
 * 🛑 A whole frame, which `world.step` alone is NOT: the script budget is four milliseconds of
 * WALL CLOCK, and `script.ts` refills it in `lateUpdate` — « what the next one spends is a whole
 * budget again ». Stepping twice without it splits four milliseconds between two frames, and on a
 * loaded machine the second one never runs: empty intents, no fault, and a suite that goes red
 * for the machine it ran on. `gameLoop.ts` calls the pair; so does this.
 */
const frame = (world: World): void => {
  world.step(STEP)
  world.lateUpdate(0, STEP_SECONDS)
}

/** A real sandbox: what this measures is the SYSTEM, and a fake one would prove nothing of it. */
describe('what a game does with its own code', () => {
  let port: ScriptPort
  let faults: ScriptFault[]

  beforeEach(async () => {
    port = await loadQuickjsScripts()
    faults = []
    intents = createIntents()
  })

  afterEach(() => {
    port.dispose()
  })

  function running(
    body: string,
    components: Component[] = [],
    inputMaps: readonly InputMap[] = [],
    bodyIdOf: (moduleId: string) => string | null = () => null,
    animatorIdOf: (moduleId: string) => string | null = () => null,
  ): World {
    const world = testWorld({
      ports: testPorts({ script: port }),
      inputMaps,
      systems: [
        createScriptSystem({
          animators: createAnimators(),
          animatorIdOf,
          modules: [{ script: WALK, code: scripted(body) }],
          onFault: fault => faults.push(fault),
          intents,
          bodyIdOf,
        }),
      ],
    })
    world.entities.add({
      id: 'e1',
      name: 'Walker',
      transform: restingTransform(),
      components: [withComponentField(newComponent('Script'), 'script', WALK), ...components],
    })
    return world
  }

  /**
   * 🛑 A module's script sits on the module and its animator on the mesh, so an event named for
   * its own entity reached nobody — the hook was unreachable from the very script a template
   * lays down.
   */
  it("hands an animation event of its module's animated part to the script", () => {
    const world = running(
      'onAnimationEvent(self, ctx, event) { game.log.info(event.payload.state) }',
      [],
      [],
      () => null,
      moduleId => (moduleId === 'e1' ? 'mesh' : null),
    )
    world.events.emit({ name: 'AnimationFinished', entity: 'mesh', payload: { state: 'jump' } })

    frame(world)
    frame(world)

    expect(world.ports.log.recent().map(entry => entry.message)).toContain('jump')
  })

  /** 🛑 The measure the lot is for: twenty lines of an author's code move something. */
  it('moves what a script tells it to move', () => {
    const world = running('onUpdate(self, ctx, dt) { self.moveBy(0, 0, -4 * dt) }')

    frame(world)
    frame(world)

    expect(world.entities.get('e1')?.transform.position.z).toBeCloseTo(-8 / 60, 6)
  })

  it('lands a walk in the intents rather than on the transform, so physics still rules', () => {
    const world = running('onStart(self) { self.walk(1, -2) }')

    frame(world)

    expect(intents.walkOf('e1')).toEqual({ x: 1, y: -2 })
    // 🛑 The node has NOT moved: a walk placed here would go through whatever wall is in the way.
    expect(world.entities.get('e1')?.transform.position).toEqual({ x: 0, y: 0, z: 0 })
  })

  /** The script sits on the MODULE in one template and on the capsule itself in two others. */
  it('reaches the module BODY when the script sits on the module', () => {
    const world = running('onStart(self) { self.jump() }', [], [], id =>
      id === 'e1' ? 'body' : null,
    )

    frame(world)

    expect(intents.jumped('body')).toBe(true)
    expect(intents.jumped('e1')).toBe(false)
  })

  it('applies context changes requested by a script', () => {
    const vehicle: InputMap = {
      version: INPUT_MAP_VERSION,
      id: 'vehicle',
      priority: 10,
      defaultActive: false,
      actions: [],
    }
    const world = running('onStart() { game.input.pushContext("vehicle") }', [], [vehicle])
    expect(world.inputContexts.active()).not.toContain('vehicle')

    frame(world)

    expect(world.inputContexts.active()).toContain('vehicle')
  })

  it('writes a field of a component the entity already carries', () => {
    const world = running('onUpdate(self) { self.set("Health", "current", 40) }', [
      newComponent('Health'),
    ])

    frame(world)

    expect(world.entities.get('e1')?.components.find(one => one.type === 'Health')?.current).toBe(
      40,
    )
  })

  /** A script cannot invent a component the studio has no descriptor for. */
  it('refuses to write a component the entity does not carry', () => {
    const world = running('onUpdate(self) { self.set("Weapon", "damage", 9) }')

    frame(world)

    expect(world.entities.get('e1')?.components.map(one => one.type)).toEqual(['Script'])
  })

  it('spawns and destroys through the world, so both land at the end of the step', () => {
    const world = running('onStart(self) { game.spawn("Crate", { x: 1, y: 2, z: 3 }) }')

    frame(world)

    const born = [...world.entities.all()].find(one => one.name === 'Crate')
    expect(born?.transform.position).toEqual({ x: 1, y: 2, z: 3 })
  })

  /** A name the closed union does not hold rides as DATA, which is what `Custom` is for. */
  it('puts what a script says on the bus as a custom event', () => {
    const world = running('onUpdate(self) { self.say("DoorOpened", { door: "north" }) }')
    const heard: string[] = []
    world.events.on('Custom', event =>
      heard.push(`${String(event.payload.name)}/${String(event.payload.door)}`),
    )

    frame(world)
    frame(world)

    expect(heard).toContain('DoorOpened/north')
  })

  it('hands an event to the script of the entity it happened to', () => {
    const world = running(
      'onCollision(self, ctx, event) { game.log.info("hit " + event.payload.other) }',
    )

    frame(world)
    world.events.emit({ name: 'Collided', entity: 'e1', payload: { other: 'wall' } })
    frame(world)
    frame(world)

    expect(world.ports.log.recent().map(entry => entry.message)).toContain('hit wall')
  })

  /** 🛑 The studio does not freeze, the fault is addressable, and the game keeps running. */
  it('survives a script that will not stop, and says which one it was', () => {
    const world = running('onUpdate() { while (true) {} }')

    frame(world)
    frame(world)

    expect(faults[0]?.script).toBe(WALK)
    expect(faults[0]?.entity).toBe('e1')
    expect(world.entities.count()).toBe(1)
  })

  it('forgets a script with the entity that carried it', () => {
    const world = running('onUpdate(self) { self.moveBy(0, 1, 0) }')

    frame(world)
    world.destroy('e1')
    frame(world)
    frame(world)

    expect(faults).toEqual([])
    expect(world.entities.count()).toBe(0)
  })

  /** 🛑 Once per entity, for the entity that JOINED — not for everyone already running. */
  it('opens a script once, however many entities join later', () => {
    const world = running('onCreate(self) { game.log.info("born " + self.id) }')

    frame(world)
    world.entities.add({
      id: 'e2',
      name: 'Second',
      transform: restingTransform(),
      components: [withComponentField(newComponent('Script'), 'script', WALK)],
    })
    frame(world)
    frame(world)

    const said = world.ports.log.recent().map(entry => entry.message)
    expect(said.filter(one => one === 'born e1')).toHaveLength(1)
    expect(said.filter(one => one === 'born e2')).toHaveLength(1)
  })

  /** 🛑 For the one that DIED, and where it died — a frame swept from the world holds neither. */
  it('closes a script for the entity that left, not for the ones that stayed', () => {
    const world = running(
      'onDestroy(self) { game.log.info("gone " + self.id + " at " + self.position.y) }',
    )
    world.entities.add({
      id: 'e2',
      name: 'Second',
      transform: { ...restingTransform(), position: { x: 0, y: 7, z: 0 } },
      components: [withComponentField(newComponent('Script'), 'script', WALK)],
    })

    frame(world)
    world.destroy('e2')
    frame(world)
    frame(world)

    const said = world.ports.log.recent().map(entry => entry.message)
    expect(said).toContain('gone e2 at 7')
    expect(said.some(one => one.startsWith('gone e1'))).toBe(false)
  })

  /** 🛑 The whole point of the inspector rows: one script, two entities, two settings. */
  it('hands each entity the settings its own component carries', () => {
    const world = testWorld({
      ports: testPorts({ script: port }),
      systems: [
        createScriptSystem({
          animators: createAnimators(),
          animatorIdOf: () => null,
          modules: [
            {
              script: WALK,
              code: scripted(
                'props: { speed: 1 }, onUpdate(self) { game.log.info(self.id + " at " + self.props.speed) }',
              ),
            },
          ],
          onFault: fault => faults.push(fault),
          intents,
          bodyIdOf: () => null,
        }),
      ],
    })
    const carrying: readonly [string, number | undefined][] = [
      ['e1', 7],
      ['e2', undefined],
    ]
    for (const [id, speed] of carrying) {
      world.entities.add({
        id,
        name: id,
        transform: restingTransform(),
        components: [
          {
            ...withComponentField(newComponent('Script'), 'script', WALK),
            ...(speed === undefined ? {} : { props: { speed } }),
          },
        ],
      })
    }

    world.step(STEP)

    const said = world.ports.log.recent().map(entry => entry.message)
    expect(said).toContain('e1 at 7')
    expect(said).toContain('e2 at 1')
  })

  /** What the sandbox is asked is what somebody WROTE: the rest never crosses the bridge. */
  it('asks the sandbox for nothing when no script declares the hook', () => {
    const world = running('onUpdate(self) { self.moveBy(0, 1, 0) }')
    frame(world)

    expect(port.declares('onUpdate')).toBe(true)
    expect(port.declares('onLateUpdate')).toBe(false)
    expect(port.declares('onMessage')).toBe(false)
  })
})

/** 🛑 The multi-scene lot's own surface: a script sends the game somewhere, and puts a key aside. */
describe('what a script asks about its scenes', () => {
  let port: ScriptPort
  const wanted: { scene: string; fade: number }[] = []
  const held: Record<string, JsonValue> = {}

  beforeEach(async () => {
    port = await loadQuickjsScripts()
    wanted.length = 0
    for (const key of Object.keys(held)) delete held[key]
  })

  afterEach(() => {
    port.dispose()
  })

  const walking = (body: string, extra: Component[] = []): World => {
    const world = testWorld({
      ports: testPorts({
        script: port,
        scenes: {
          load: (scene, fade) => void wanted.push({ scene, fade }),
          keep: (key, value) => {
            held[key] = value
          },
          kept: () => held,
        },
      }),
      systems: [
        createScriptSystem({
          animators: createAnimators(),
          animatorIdOf: () => null,
          modules: [{ script: WALK, code: scripted(body) }],
          onFault: () => {},
          intents,
          bodyIdOf: () => null,
        }),
      ],
    })
    world.entities.add({
      id: 'e1',
      name: 'Walker',
      transform: restingTransform(),
      components: [withComponentField(newComponent('Script'), 'script', WALK), ...extra],
    })
    return world
  }

  it('sends the game to another scene, with the fade it asked for', () => {
    const world = walking("onUpdate() { game.scene.load('World01', { fade: 0.5 }) }")

    frame(world)

    expect(wanted[0]).toEqual({ scene: 'World01', fade: 0.5 })
  })

  /**
   * 🛑 The whole round trip: the intent reaches the host, the store rides back in the next frame,
   * and the kernel reads it there. Asserting the store alone would miss the half that costs.
   */
  it('puts a value aside and reads it back on the next step', () => {
    const world = walking(
      "onUpdate(self) { game.scene.keep('coins', 7); self.set('Health', 'current', game.scene.kept('coins') || 0) }",
      [newComponent('Health')],
    )

    frame(world)
    frame(world)

    expect(held.coins).toBe(7)
    expect(world.entities.get('e1')?.components[1]?.current).toBe(7)
  })
})
