// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { newComponent, withComponentField } from '@shared/domain/componentRegistry'
import type { Component, JsonValue } from '@shared/domain/component'
import { DEFAULT_PLAY } from '@shared/domain/scene'
import { createIntents } from '../intents'
import type { PhysicsPort } from '../../ports/physicsPort'
import { loadJoltPhysics } from '../../host/joltPhysics'
import {
  describedBody,
  notedPhysics,
  restingAt,
  type NotedPhysics,
} from '../../physics/physics-fixtures'
import { createCharacters } from '../characters'
import { createPossessions } from '../possessions'
import { restingTransform, type Entity } from '../entity'
import { STEP_SECONDS } from '../gameLoop'
import { createRigs, type Rigs } from '../rigs'
import { testPorts, testWorld } from '../world-fixtures'
import type { World } from '../world'
import { createSpringArmSystem } from './springArm'

const FRAME = 1 / 60

const armed = (over: Record<string, JsonValue> = {}): Component => {
  let arm = newComponent('SpringArm')
  for (const [key, value] of Object.entries({ subject: 'hero', camera: 'eye', ...over })) {
    arm = withComponentField(arm, key, value)
  }
  return arm
}

function rigged(
  over: Record<string, JsonValue> = {},
  lensOf: (entity: Entity) => number | null = () => 50,
  ported: PhysicsPort | null = null,
): {
  world: World
  rigs: Rigs
  physics: NotedPhysics
  hero: Entity
  eye: Entity
} {
  const physics = notedPhysics()
  const rigs = createRigs(null)
  const world = testWorld({
    play: { ...DEFAULT_PLAY, camera: 'thirdPerson' },
    ports: testPorts({ physics: ported ?? physics }),
    systems: [
      createSpringArmSystem({
        characters: createCharacters(
          createPossessions(),
          entity => entity.transform,
          createIntents(),
        ),
        rigs,
        // Flat: every node of these cases hangs from nothing, so its own frame IS the world's.
        worldOf: (_, own) => own,
        localOf: () => null,
        lensOf,
      }),
    ],
  })
  world.entities.add({ id: 'hero', name: 'hero', transform: restingTransform(), components: [] })
  world.entities.add({ id: 'eye', name: 'eye', transform: restingTransform(), components: [] })
  world.entities.add({
    id: 'arm',
    name: 'arm',
    transform: restingTransform(),
    components: [armed(over)],
  })

  return {
    world,
    rigs,
    physics,
    hero: world.entities.get('hero')!,
    eye: world.entities.get('eye')!,
  }
}

describe('the arm a camera hangs on', () => {
  it('hangs the camera behind the subject, at the length and the height asked for', () => {
    const { world, eye } = rigged({ length: 4, height: 1.6 })

    world.lateUpdate(0, FRAME)

    // A look of zero points down −Z, so the camera stands four metres the other way.
    expect(eye.transform.position).toEqual({ x: 0, y: 1.6, z: 4 })
  })

  it('pushes the camera off the centre line by the shoulder asked for', () => {
    const { world, eye } = rigged({ shoulder: 0.7 })

    world.lateUpdate(0, FRAME)

    expect(eye.transform.position.x).toBeCloseTo(0.7, 6)
  })

  it('names the camera it placed, so one system alone composes the shot', () => {
    const { world, rigs, eye } = rigged()

    world.lateUpdate(0, FRAME)

    expect(rigs.leader()).toBe(eye)
  })

  it('pulls the camera in to what stands between it and its subject', () => {
    const { world, physics, eye } = rigged({
      length: 4,
      height: 0,
      collisionInLag: 0,
    })
    physics.answers.cast = 0.25

    world.lateUpdate(0, FRAME)

    // A quarter of four metres, less the tenth of a metre every arm keeps in hand by default.
    expect(eye.transform.position.z).toBeCloseTo(0.9, 6)
    // The subject and the camera are both left out, or the arm butts against what it films.
    expect(physics.probes[0]?.ignore).toEqual(['hero', 'eye'])
    expect(physics.probes[0]?.radius).toBe(0.2)
  })

  it('probes nothing at all when it is told not to avoid walls', () => {
    const { world, physics } = rigged({ collision: false })

    world.lateUpdate(0, FRAME)

    expect(physics.probes).toEqual([])
  })

  /**
   * 🛑 The whole reason a late pass is handed the frame's seconds. Written against a constant per
   * frame, the same lag settles twice as fast on a screen drawing twice as often.
   */
  it('lags by the same amount whether the screen draws once or twice', () => {
    const slow = rigged({ positionLag: 0.2 })
    const fast = rigged({ positionLag: 0.2 })
    slow.world.lateUpdate(0, FRAME)
    fast.world.lateUpdate(0, FRAME)

    slow.hero.transform.position.x = 10
    fast.hero.transform.position.x = 10
    slow.world.lateUpdate(0, 1 / 30)
    fast.world.lateUpdate(0, FRAME)
    fast.world.lateUpdate(0, FRAME)

    expect(fast.eye.transform.position.x).toBeCloseTo(slow.eye.transform.position.x, 6)
    // And it really did lag: a camera that snapped would already stand at ten.
    expect(slow.eye.transform.position.x).toBeLessThan(9)
  })

  it('takes the subject up at once on the frame it first sees it', () => {
    const { world, hero, eye } = rigged({ positionLag: 0.2 })
    hero.transform.position.x = 10

    world.lateUpdate(0, FRAME)

    expect(eye.transform.position.x).toBeCloseTo(10, 6)
  })

  it('follows the subject vertically without lag when vertical following is enabled', () => {
    const { world, hero, eye } = rigged({ positionLag: 0.2, followVertical: true })

    world.lateUpdate(0, FRAME)
    hero.transform.position.y = 2
    world.lateUpdate(0, FRAME)

    expect(eye.transform.position.y).toBeCloseTo(3.6, 6)
  })

  it('smooths vertical following when the option is disabled', () => {
    const { world, hero, eye } = rigged({ positionLag: 0.2 })

    world.lateUpdate(0, FRAME)
    hero.transform.position.y = 2
    world.lateUpdate(0, FRAME)

    expect(eye.transform.position.y).toBeGreaterThan(1.6)
    expect(eye.transform.position.y).toBeLessThan(3.6)
  })

  /** Everything else is drawn between two steps; what the picture hangs on must be too. */
  it('anchors on the subject where it is drawn, not where the last step left it', () => {
    const { world, hero, eye } = rigged({ positionLag: 0 })
    hero.transform.position.x = 4
    world.step(STEP_SECONDS)
    hero.transform.position.x = 6

    world.lateUpdate(0.5, FRAME)

    expect(eye.transform.position.x).toBeCloseTo(5, 6)
  })

  it('aims down the subject own nose when it is told to follow it', () => {
    const { world, hero, eye } = rigged({ orientation: 'subject', length: 4, height: 0 })
    // A quarter turn to the left: the subject now faces −X, so the arm stands at +X behind it.
    hero.transform.rotation.y = Math.PI / 2

    world.lateUpdate(0, FRAME)

    expect(eye.transform.position.x).toBeCloseTo(4, 5)
    expect(eye.transform.position.z).toBeCloseTo(0, 5)
  })

  it('turns the camera back towards what it films', () => {
    const { world, hero, eye } = rigged({ orientation: 'subject', length: 4, height: 0 })
    hero.transform.rotation.y = Math.PI / 2

    world.lateUpdate(0, FRAME)

    expect(eye.transform.rotation.y).toBeCloseTo(Math.PI / 2, 5)
  })

  /**
   * 🛑 `turnTowards` leaves a rotation alone for a direction of NOTHING, and the camera sits ON
   * the pivot whenever the arm is short or the probe leaves no room — so it would keep whatever
   * was written before. TWO turns, or the module scratch answers the first by having held it.
   */
  it('still looks where the arm points when the arm has no length', () => {
    const { world, hero, eye } = rigged({ orientation: 'subject', length: 0, rotationLag: 0 })
    hero.transform.rotation.y = Math.PI / 2
    world.lateUpdate(0, FRAME)
    const first = eye.transform.rotation.y

    hero.transform.rotation.y = -Math.PI / 2
    world.lateUpdate(0, FRAME)

    expect(first).toBeCloseTo(Math.PI / 2, 5)
    expect(eye.transform.rotation.y).toBeCloseTo(-Math.PI / 2, 5)
  })

  it('still looks where the arm points when the probe leaves no room at all', () => {
    const { world, physics, hero, eye } = rigged({
      orientation: 'subject',
      length: 4,
      rotationLag: 0,
    })
    physics.answers.cast = 0
    hero.transform.rotation.y = Math.PI / 2
    world.lateUpdate(0, FRAME)
    const first = eye.transform.rotation.y

    hero.transform.rotation.y = -Math.PI / 2
    world.lateUpdate(0, FRAME)

    expect(first).toBeCloseTo(Math.PI / 2, 5)
    expect(eye.transform.rotation.y).toBeCloseTo(-Math.PI / 2, 5)
  })

  /**
   * 🛑 An arm on a MESH places it and stops there. Filming through it would take the shot from
   * inside the model — measured, before the window was asked what a camera is.
   */
  it('places a node that is not a camera without filming through it', () => {
    const { world, rigs, eye } = rigged({ length: 4, height: 1.6 }, () => null)

    world.lateUpdate(0, FRAME)

    expect(eye.transform.position).toEqual({ x: 0, y: 1.6, z: 4 })
    expect(rigs.leader()).toBeNull()
  })

  it('stops the camera short of the surface by the safety margin asked for', () => {
    const { world, physics, eye } = rigged({
      length: 4,
      height: 0,
      safetyMargin: 0.5,
      collisionInLag: 0,
    })
    physics.answers.cast = 0.5

    world.lateUpdate(0, FRAME)

    // Two metres of clear way, half a metre of it left unspent so the near plane keeps out.
    expect(eye.transform.position.z).toBeCloseTo(1.5, 6)
  })

  it('never pushes the camera past the pivot to make room for its margin', () => {
    const { world, physics, eye } = rigged({
      length: 4,
      height: 0,
      safetyMargin: 2,
      collisionInLag: 0,
    })
    physics.answers.cast = 0.25

    world.lateUpdate(0, FRAME)

    expect(eye.transform.position.z).toBe(0)
  })

  /** 🛑 Both directions in one case: a lag written on the wrong side would else still pass. */
  it('comes in faster than it goes out, and snaps in neither direction', () => {
    const { world, physics, eye } = rigged({
      length: 4,
      height: 0,
      safetyMargin: 0,
      hysteresis: 0,
      positionLag: 0,
      collisionInLag: 0.04,
      collisionOutLag: 0.25,
    })
    world.lateUpdate(0, FRAME)
    physics.answers.cast = 0.25

    world.lateUpdate(0, FRAME)
    const met = 4 - eye.transform.position.z

    physics.answers.cast = null
    const held = eye.transform.position.z
    world.lateUpdate(0, FRAME)

    // Neither move is the whole way, and coming in covers more of it than going out.
    expect(met).toBeGreaterThan(0)
    expect(met).toBeLessThan(3)
    expect(eye.transform.position.z - held).toBeGreaterThan(0)
    expect(eye.transform.position.z - held).toBeLessThan(met)
  })

  /**
   * 🛑 Measured against a real 0,90 m pillar: the probe and the margin hold the shot 1,25 m off on
   * their own. A floor on the LENGTH was tried and dropped — it seated the camera inside the wall.
   */
  it('holds the shot off what it met by the probe and the margin, and never enters it', () => {
    const { world, physics, hero, eye } = rigged({
      length: 4,
      height: 0,
      probeRadius: 0.2,
      safetyMargin: 0.1,
      positionLag: 0,
      collisionInLag: 0,
    })
    // A quarter of the way is 1 m; the margin takes a tenth of it off.
    physics.answers.cast = 0.25

    for (let frame = 0; frame < 30; frame++) world.lateUpdate(0, FRAME)

    const back = Math.hypot(
      eye.transform.position.x - hero.transform.position.x,
      eye.transform.position.z - hero.transform.position.z,
    )
    expect(back).toBeCloseTo(0.9, 4)
  })

  /** 🛑 A deadband in METRES cannot be cleared by an arm shorter than itself — it stayed pinned. */
  it('comes back out of an arm shorter than the hysteresis it was given', () => {
    const { world, physics, eye } = rigged({
      length: 0.05,
      height: 0,
      safetyMargin: 0,
      hysteresis: 0.5,
      positionLag: 0,
      collisionInLag: 0,
      collisionOutLag: 0,
    })
    physics.answers.cast = 0.25
    world.lateUpdate(0, FRAME)

    physics.answers.cast = null
    world.lateUpdate(0, FRAME)

    expect(eye.transform.position.z).toBeCloseTo(0.05, 6)
  })

  it('holds the pitch inside the bounds asked for, so the shot never climbs overhead', () => {
    const { world, eye } = rigged({
      length: 4,
      height: 0,
      pitchMin: -30,
      rotationLag: 0,
      positionLag: 0,
    })
    world.ports.input.pointer = () => ({ x: 0, y: 0, down: true })
    world.lateUpdate(0, FRAME)
    // Dragged far enough to ask for a plunging shot, which is what lifts a camera overhead.
    world.ports.input.pointer = () => ({ x: 0, y: 400, down: true })

    world.lateUpdate(0, FRAME)

    // Thirty degrees of plunge and no more: four metres of arm lifts the seat by two, not by four.
    expect(eye.transform.position.y).toBeCloseTo(2, 4)
  })

  /** 🛑 A node an author pitched is where they put it — the bounds hold the POINTER, not the scene. */
  it('leaves an arm pointed by its own node outside the pitch bounds it was given', () => {
    const { world, hero, eye } = rigged({
      orientation: 'subject',
      length: 4,
      height: 0,
      pitchMin: -10,
      pitchMax: 10,
      rotationLag: 0,
      positionLag: 0,
      collision: false,
    })
    hero.transform.rotation.x = -Math.PI / 4

    world.lateUpdate(0, FRAME)

    // Forty-five degrees of plunge kept whole: ten would have lifted the seat by 0,69 instead.
    expect(eye.transform.position.y).toBeCloseTo(Math.SQRT2 * 2, 4)
  })

  it('turns the camera on the subject itself when it is told to look at it', () => {
    const { world, eye } = rigged({ length: 4, height: 2, lookAt: 'subject', rotationLag: 0 })

    world.lateUpdate(0, FRAME)

    // Standing two metres up and four back, aiming at the feet tips the shot down by a quarter turn.
    expect(eye.transform.rotation.x).toBeLessThan(0)
    expect(eye.transform.rotation.x).toBeCloseTo(-Math.atan2(2, 4), 5)
  })

  it('does nothing at all for an arm whose subject or camera nobody wears', () => {
    const { world, eye } = rigged({ subject: 'nobody' })

    world.lateUpdate(0, FRAME)

    expect(eye.transform.position).toEqual({ x: 0, y: 0, z: 0 })
  })
})

/** 🛑 Against the real engine: the fixture only ever answers the fraction a case chose itself. */
describe('the arm against the physics it will be ridden with', () => {
  it('meets a real post in one frame and clears it over many', async () => {
    const physics = await loadJoltPhysics()
    physics.add([
      describedBody({
        body: 'floor',
        kind: 'fixed',
        shape: { kind: 'cuboid', hx: 20, hy: 0.5, hz: 20 },
        transform: restingAt(0, -0.5, 0),
      }),
      describedBody({
        body: 'post',
        kind: 'fixed',
        shape: { kind: 'cuboid', hx: 0.15, hy: 1.5, hz: 0.15 },
        transform: restingAt(-1, 1.5, 2),
      }),
    ])
    const { world, hero, eye } = rigged({ length: 4, height: 1.6 }, () => 50, physics)

    const reach: number[] = []
    // Walking left at the scene's own pace, straight past the post.
    for (let frame = 0; frame < 90; frame++) {
      hero.transform.position.x -= 4 * FRAME
      physics.step(FRAME)
      world.lateUpdate(0, FRAME)
      reach.push(
        Math.hypot(
          eye.transform.position.x - hero.transform.position.x,
          eye.transform.position.z - hero.transform.position.z,
        ),
      )
    }
    physics.dispose()

    const cut = reach.findIndex(one => one < 3)
    const back = reach.findIndex((one, frame) => frame > cut && one > 3.9)
    // The post really did cut the arm, and really did let it go again.
    expect(cut).toBeGreaterThan(0)
    expect(back).toBeGreaterThan(cut)
    // 🛑 Never nearer than the minimum: a camera pulled onto the pivot films forward, and the
    // character it was watching is gone — what a wide pillar did on screen, 2026-09-03.
    expect(Math.min(...reach)).toBeGreaterThanOrEqual(1.2)
    // Cleared over many more frames than it was met in, and neither in one.
    expect(back - cut).toBeGreaterThan(cut - reach.findIndex(one => one < 3.9))
  })
})
