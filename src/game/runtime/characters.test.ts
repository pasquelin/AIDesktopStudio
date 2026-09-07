// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from 'vitest'
import { newComponent, withComponentField } from '@shared/domain/componentRegistry'
import type { JsonValue } from '@shared/domain/component'
import { DEFAULT_PLAY } from '@shared/domain/scene'
import type { InputState } from '../ports/inputPort'
import { reading, standardGamepad } from './input-fixtures'
import type { CharacterMove } from '../ports/physicsPort'
import { createCharacters, type Characters } from './characters'
import { restingTransform } from './entity'
import { createIntents } from './intents'
import { createPossessions } from './possessions'
import { testWorld } from './world-fixtures'
import type { World } from './world'

const STEP = 1 / 60

let intents = createIntents()

/** One place the three arguments live: the next collaborator is a line, not thirty-five. */
const walkers = (): Characters =>
  createCharacters(createPossessions(), entity => entity.transform, intents)

const pressing = reading

const holding = (
  axes: Parameters<typeof standardGamepad>[0],
  pressed: Parameters<typeof standardGamepad>[1] = [],
): InputState => reading({ gamepads: [standardGamepad(axes, pressed)] })

function walking(gravity = 0, moveSpeed = 4, over: Record<string, JsonValue> = {}): World {
  const world = testWorld({ play: { ...DEFAULT_PLAY, gravity, moveSpeed } })
  let walker = newComponent('CharacterController')
  for (const [key, value] of Object.entries(over)) walker = withComponentField(walker, key, value)
  world.entities.add({
    id: 'walker',
    name: 'Walker',
    transform: restingTransform(),
    components: [walker],
  })
  return world
}

/** What the physics answers back: only whether the feet found anything ever varies here. */
const landed = (characters: Characters, grounded: boolean): void =>
  characters.settle([{ body: 'walker', moved: { x: 0, y: 0, z: 0 }, grounded }])

/** 🛑 A fresh walker has heard nothing back and counts as AIRBORNE, halving its first frame. */
function standing(world: World, characters: Characters): void {
  const held = world.input
  world.input = pressing()
  characters.intents(world, STEP)
  landed(characters, true)
  world.input = held
}

/** What the walker asks for once it has got up to pace — a start is a ramp, not a switch. */
function cruising(world: World, characters: Characters, steps = 120): CharacterMove | undefined {
  let last: CharacterMove | undefined
  standing(world, characters)
  for (let step = 0; step < steps; step++) {
    const [move] = characters.intents(world, STEP)
    landed(characters, true)
    last = move
  }
  return last
}

describe('what a character asks to move', () => {
  beforeEach(() => {
    intents = createIntents()
  })

  it('walks where a SCRIPT asks, and the stick says nothing that step', () => {
    const world = walking()
    const characters = walkers()
    world.input = holding({ leftY: -1 })
    intents.walk('walker', 1, 0)

    const move = cruising(world, characters)

    expect(move?.wanted.x).toBeCloseTo(4 * STEP)
    expect(move?.wanted.z).toBeCloseTo(0)
  })

  /** 🛑 What a script cannot say by staying quiet, and the whole reason an intent REPLACES. */
  it('stands still on `walk(0, 0)` though the stick is pushed', () => {
    const world = walking()
    const characters = walkers()
    world.input = holding({ leftY: -1 })
    intents.walk('walker', 0, 0)

    const move = cruising(world, characters)

    expect(move?.wanted.z).toBeCloseTo(0)
  })

  it('hands the stick back on the step a script stops asking', () => {
    const world = walking()
    const characters = walkers()
    world.input = holding({ leftY: -1 })
    intents.walk('walker', 1, 0)
    cruising(world, characters)

    intents.release()
    const move = characters.intents(world, STEP)[0]

    expect(move?.wanted.z).toBeLessThan(0)
  })

  it('jumps on a script asking, with the same ground rule a button answers', () => {
    const world = walking(10)
    const characters = walkers()
    intents.jump('walker')

    const inAir = characters.intents(world, STEP)[0]?.wanted.y ?? 0
    landed(characters, true)
    const grounded = characters.intents(world, STEP)[0]?.wanted.y ?? 0

    expect(inAir).toBeLessThan(0)
    expect(grounded).toBeGreaterThan(0)
  })

  /** 🛑 The run belongs to the PLAYER: a cutscene walk doubled because somebody held Shift. */
  it('walks at the walking pace on a script ask, though the run key is held', () => {
    const world = walking(0, 4, { runSpeed: 8 })
    const characters = walkers()
    world.input = pressing({ held: ['ShiftLeft'] })
    intents.walk('walker', 0, -1)

    const move = cruising(world, characters)

    expect(move?.wanted.z).toBeCloseTo(-4 * STEP)
  })

  /** One finite number a script may pass, and the look is NaN for the rest of the session. */
  it('survives an absurd look, rather than keeping a NaN for ever', () => {
    const world = walking()
    const characters = walkers()
    intents.look('walker', 1e308, 0)

    characters.intents(world, STEP)

    expect(Number.isFinite(characters.look().yaw)).toBe(true)
  })

  it('turns the look where a script asks, ahead of the stick', () => {
    const world = walking()
    const characters = walkers()
    world.input = holding({ rightX: 1 })
    intents.look('walker', -1, 0)

    characters.intents(world, STEP)

    expect(characters.look().yaw).toBeGreaterThan(0)
  })

  it('walks on the left stick, with no input map and no script of its own', () => {
    const world = walking()
    world.input = holding({ leftY: -1 })

    const move = cruising(world, walkers())

    expect(move?.wanted.z).toBeCloseTo(-4 * STEP)
  })

  it('walks a stick held HALF way at half the pace, which no key can ask for', () => {
    const world = walking()
    world.input = holding({ leftY: -0.5 })

    const move = cruising(world, walkers())

    expect(move?.wanted.z).toBeCloseTo(-2 * STEP)
  })

  it('runs on the left stick pressed in, as Shift does', () => {
    const world = walking(0, 4, { runSpeed: 8 })
    world.input = holding({ leftY: -1 }, ['leftStickButton'])

    const move = cruising(world, walkers())

    expect(move?.wanted.z).toBeCloseTo(-8 * STEP)
  })

  it('turns the head on the right stick with NO button held, unlike a drag', () => {
    const world = walking()
    const characters = walkers()
    world.input = holding({ rightX: 1 })

    characters.intents(world, STEP)

    expect(characters.look().yaw).toBeLessThan(0)
  })

  it('leaves the look alone when the stick rests, so a drag is not fought over', () => {
    const world = walking()
    const characters = walkers()
    world.input = holding({})

    characters.intents(world, STEP)

    expect(characters.look()).toEqual({ yaw: 0, pitch: 0 })
  })

  it('turns the head ONCE a step, whatever a frame asks of the arm after it', () => {
    const world = walking()
    const characters = walkers()
    world.input = holding({ rightX: 1 })

    characters.intents(world, STEP)
    const once = characters.look().yaw
    characters.aim(world.input.pointer)

    expect(characters.look().yaw).toBe(once)
  })

  it('walks on two opposite keys held as it walks on none', () => {
    const world = walking()
    world.input = pressing({ held: ['KeyA', 'KeyD'] })

    const move = cruising(world, walkers())

    expect(move?.wanted.x).toBeCloseTo(0)
  })

  it('walks forward on the key under the finger, whatever it types', () => {
    const world = walking()
    world.input = pressing({ held: ['KeyW'] })

    const move = cruising(world, walkers())

    expect(move?.wanted.z).toBeCloseTo(-4 * STEP, 6)
    expect(move?.wanted.x).toBeCloseTo(0, 6)
  })

  /** Two keys held would otherwise walk at 1,41 times the pace the scene declares. */
  it('never walks faster on the diagonal', () => {
    const world = walking()
    world.input = pressing({ held: ['KeyW', 'KeyD'] })

    const move = cruising(world, walkers())

    expect(Math.hypot(move?.wanted.x ?? 0, move?.wanted.z ?? 0)).toBeCloseTo(4 * STEP, 6)
  })

  it('falls by the pull the SCENE declares, not by one of its own', () => {
    const world = walking(10)

    const [move] = createCharacters(
      createPossessions(),
      entity => entity.transform,
      intents,
    ).intents(world, STEP)

    expect(move?.wanted.y).toBeCloseTo(-10 * STEP * STEP, 8)
  })

  /** A jump from nothing is how a character climbs a wall it should not. */
  it('jumps only from the ground', () => {
    const world = walking(10)
    const characters = walkers()
    world.input = pressing({ held: ['Space'] })

    const inAir = characters.intents(world, STEP)[0]?.wanted.y ?? 0
    landed(characters, true)
    const grounded = characters.intents(world, STEP)[0]?.wanted.y ?? 0

    expect(inAir).toBeLessThan(0)
    expect(grounded).toBeGreaterThan(0)
  })

  /** A fall nobody stopped keeps getting faster, and a character standing still would sink. */
  it('stops gaining speed once it is standing on something', () => {
    const world = walking(10)
    const characters = walkers()

    for (let step = 0; step < 60; step++) {
      characters.intents(world, STEP)
      landed(characters, true)
    }

    expect(characters.intents(world, STEP)[0]?.wanted.y ?? 0).toBeGreaterThan(-0.05)
  })

  it('turns the heading with a drag, and never past straight up', () => {
    const characters = walkers()

    characters.aim({ x: 100, y: 100, down: true })
    characters.aim({ x: 0, y: -100000, down: true })

    expect(characters.look().yaw).toBeGreaterThan(0)
    expect(characters.look().pitch).toBeLessThan(Math.PI / 2)
  })

  /** 🛑 A frame the accumulator ran no step of must still turn the head — see `Characters.aim`. */
  it('turns the head without a step being run at all', () => {
    const characters = walkers()

    characters.aim({ x: 0, y: 0, down: true })
    characters.aim({ x: 200, y: 0, down: true })

    expect(characters.look().yaw).toBeCloseTo(-200 * 0.005, 6)
  })

  /**
   * 🛑 What lets TWO late systems each take the live pointer: `springArm` reads it before the
   * camera does, and the head must not turn twice as far because a scene holds an arm.
   */
  it('turns nothing on a second reading of one frame pointer', () => {
    const characters = walkers()
    characters.aim({ x: 0, y: 0, down: true })
    characters.aim({ x: 200, y: 40, down: true })
    const once = { ...characters.look() }

    characters.aim({ x: 200, y: 40, down: true })

    expect(characters.look()).toEqual(once)
  })

  it('walks at the pace of its own component, and at the scene own when it declares none', () => {
    const mine = walking(0, 4, { moveSpeed: 9 })
    const scene = walking(0, 4)
    mine.input = pressing({ held: ['KeyW'] })
    scene.input = pressing({ held: ['KeyW'] })

    const fast = cruising(mine, walkers())
    const plain = cruising(scene, walkers())

    expect(fast?.wanted.z).toBeCloseTo(-9 * STEP, 6)
    expect(plain?.wanted.z).toBeCloseTo(-4 * STEP, 6)
  })

  /** 🛑 What « c'est trop sec » was: full pace on the first frame, and zero on the release. */
  it('leans into its pace instead of reaching it whole on the first frame', () => {
    const world = walking(0, 4, { acceleration: 20 })
    world.input = pressing({ held: ['KeyW'] })
    const characters = walkers()
    standing(world, characters)

    const [first] = characters.intents(world, STEP)

    expect(-(first?.wanted.z ?? 0) / STEP).toBeCloseTo(20 * STEP, 6)
  })

  it('slides to a stop instead of dropping to nothing on the release', () => {
    const world = walking(0, 4, { deceleration: 20 })
    world.input = pressing({ held: ['KeyW'] })
    const characters = walkers()
    cruising(world, characters)

    world.input = pressing()
    const [move] = characters.intents(world, STEP)

    expect(-(move?.wanted.z ?? 0) / STEP).toBeCloseTo(4 - 20 * STEP, 6)
  })

  it('runs at the running pace while the run key is held', () => {
    const world = walking(0, 4, { runSpeed: 8 })
    world.input = pressing({ held: ['KeyW', 'ShiftLeft'] })

    const move = cruising(world, walkers())

    expect(move?.wanted.z).toBeCloseTo(-8 * STEP, 6)
  })

  it('answers the keys far less readily once its feet have left the ground', () => {
    const world = walking(0, 4, { acceleration: 20, airControl: 0.25 })
    world.input = pressing({ held: ['KeyW'] })
    const characters = walkers()
    standing(world, characters)
    characters.intents(world, STEP)
    landed(characters, false)

    const [move] = characters.intents(world, STEP)

    // One frame of full acceleration on the ground, then a quarter of one in the air.
    expect(-(move?.wanted.z ?? 0) / STEP).toBeCloseTo(20 * STEP + 20 * 0.25 * STEP, 6)
  })

  it('still jumps for a moment after walking off an edge', () => {
    const world = walking(10, 4, { coyoteTime: 0.2 })
    const characters = walkers()
    characters.intents(world, STEP)
    landed(characters, true)
    characters.intents(world, STEP)
    landed(characters, false)

    world.input = pressing({ held: ['Space'] })
    const [move] = characters.intents(world, STEP)

    expect(move?.wanted.y).toBeGreaterThan(0)
  })

  it('forgets a jump asked for long after the ground was left', () => {
    const world = walking(10, 4, { coyoteTime: 0.05 })
    const characters = walkers()
    characters.intents(world, STEP)
    landed(characters, false)
    for (let step = 0; step < 10; step++) {
      characters.intents(world, STEP)
      landed(characters, false)
    }

    world.input = pressing({ held: ['Space'] })
    const [move] = characters.intents(world, STEP)

    expect(move?.wanted.y).toBeLessThan(0)
  })

  it('holds a jump asked for just before landing, and spends it on the ground', () => {
    const world = walking(10, 4, { jumpBuffer: 0.2, coyoteTime: 0 })
    const characters = walkers()
    world.input = pressing({ held: ['Space'] })
    characters.intents(world, STEP)
    landed(characters, false)

    world.input = pressing()
    characters.intents(world, STEP)
    landed(characters, true)
    const [move] = characters.intents(world, STEP)

    expect(move?.wanted.y).toBeGreaterThan(0)
  })

  it('turns the body towards where it walks, at the speed asked for', () => {
    const world = walking(0, 4, { bodyTurnSpeed: 180 })
    world.input = pressing({ held: ['KeyD'] })
    const characters = walkers()

    const [move] = characters.intents(world, STEP)

    // Walking right off a level heading asks for a quarter turn; half a turn a second covers
    // three degrees of it in one frame, and never the whole ninety at once.
    expect(move?.facing).toBeCloseTo(-180 * STEP * (Math.PI / 180), 6)
  })

  /** 🛑 A heading is sent in WORLD: a walker starting at zero snapped a turned body on frame one. */
  it('starts from the heading the body was put at, rather than from nothing', () => {
    const world = walking(0, 4, { bodyTurnSpeed: 180 })
    world.entities.get('walker')!.transform.rotation.y = Math.PI / 2

    const [move] = createCharacters(
      createPossessions(),
      entity => entity.transform,
      intents,
    ).intents(world, STEP)

    expect(move?.facing).toBeCloseTo(Math.PI / 2, 6)
  })

  it('leaves the body facing where it was put when no turn speed is asked for', () => {
    const world = walking(0, 4)
    world.input = pressing({ held: ['KeyD'] })

    const [move] = createCharacters(
      createPossessions(),
      entity => entity.transform,
      intents,
    ).intents(world, STEP)

    expect(move?.facing).toBeNull()
  })

  it('names the first controller as the one the camera watches', () => {
    const world = walking()
    const characters = walkers()

    characters.intents(world, STEP)
    const leader = characters.leader()

    expect(leader?.id).toBe('walker')
    // 1,8 tall around a radius of 0,3: the straight part is what is left of it.
    const capsule = leader ? characters.capsuleOf(leader) : null
    expect(capsule?.halfHeight).toBeCloseTo(0.6, 6)
    expect(capsule?.radius).toBeCloseTo(0.3, 6)
  })
})

/** 🛑 The look belongs to the LEADER: a bystander walking by must not stand in for it. */
describe('who may turn the shared look', () => {
  it('leaves it alone while its owner drives, even with another walker afoot', () => {
    const world = walking()
    const held = createPossessions()
    world.entities.add({
      id: 'by',
      name: 'By',
      transform: restingTransform(),
      components: [newComponent('CharacterController')],
    })
    held.hold('walker')
    world.input = holding({ rightX: 1 })
    const characters = createCharacters(held, entity => entity.transform, intents)

    expect(characters.intents(world, STEP).map(one => one.body)).toEqual(['by'])
    expect(characters.look()).toEqual({ yaw: 0, pitch: 0 })
  })
})
