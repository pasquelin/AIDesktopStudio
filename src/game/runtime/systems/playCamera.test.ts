// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { createIntents } from '../intents'
import { STEP_SECONDS } from '../gameLoop'
import { newComponent } from '@shared/domain/componentRegistry'
import { DEFAULT_PLAY, type PlayCamera } from '@shared/domain/scene'
import type { InputPort, Pointer } from '../../ports/inputPort'
import type { CameraView } from '../../ports/renderPort'
import { createCharacters } from '../characters'
import { createPossessions } from '../possessions'
import { createPilots, PILOT_RANK } from '../pilots'
import { createRigs, type Rigs } from '../rigs'
import { restingTransform } from '../entity'
import { testPorts, testWorld } from '../world-fixtures'
import { createPlayCameraSystem } from './playCamera'

function watching(
  camera: PlayCamera,
  controlled = true,
  rigs: Rigs = createRigs(null),
  playerBodyId: string | null = null,
) {
  const pilots = createPilots()
  // The pointer the case moves between two frames, which is what the head is read off.
  const held: Pointer = { x: 0, y: 0, down: false }
  const heldInput: InputPort = {
    state: () => ({ held: [], pressed: [], released: [], pointer: { ...held } }),
    pointer: () => held,
    endStep: () => {},
    detach: () => {},
  }
  const views: (CameraView | null)[] = []
  const characters = createCharacters(
    createPossessions(),
    entity => entity.transform,
    createIntents(),
  )
  const world = testWorld({
    play: { ...DEFAULT_PLAY, camera },
    ports: testPorts({
      input: heldInput,
      render: { place: () => {}, view: view => views.push(view), veil: () => {} },
    }),
    systems: [createPlayCameraSystem({ characters, pilots, rigs, playerBodyId })],
  })
  if (controlled) {
    world.entities.add({
      id: 'hero',
      name: 'hero',
      transform: restingTransform(),
      components: [newComponent('CharacterController')],
    })
  }

  // Through the character system's own sweep: the camera watches whoever it named first.
  characters.intents(world, 1 / 60)
  return { world, views, held, pilots }
}

describe('the camera rank of a running game', () => {
  it('watches the character from its eyes, measured up from its feet', () => {
    const { world, views } = watching('firstPerson')

    world.lateUpdate(0, STEP_SECONDS)

    // A 1,8 capsule standing at the origin has its feet at −0,9.
    expect(views[0]?.position.y).toBeCloseTo(-0.9 + DEFAULT_PLAY.eyeHeight, 6)
  })

  /** A set flown by hand: writing the camera would fight whoever is dragging it. */
  it('leaves an orbited set alone', () => {
    const { world, views } = watching('orbit')

    world.lateUpdate(0, STEP_SECONDS)

    expect(views).toEqual([null])
  })

  /** 🛑 Sampled at the fixed step, a frame the accumulator ran none of ignored the mouse entirely. */
  it('follows the pointer on a frame no fixed step was run on', () => {
    const { world, views, held } = watching('firstPerson')
    held.down = true
    world.lateUpdate(0, STEP_SECONDS)
    // Read at once: `playView` hands back ONE view it rewrites, so two frames kept are one object.
    const before = views.at(-1)?.target.x ?? 0

    held.x = 200
    world.lateUpdate(0, STEP_SECONDS)

    expect(views.at(-1)?.target.x ?? 0).not.toBeCloseTo(before, 3)
  })

  /** Everything around the leader is drawn between two steps; what the picture HANGS on must be too. */
  it('frames the leader where it is drawn, not where the last step left it', () => {
    const { world, views } = watching('firstPerson')
    const hero = world.entities.get('hero')
    if (hero) hero.transform.position.x = 4
    world.step(1 / 60)
    if (hero) hero.transform.position.x = 6

    world.lateUpdate(0.5, STEP_SECONDS)

    expect(views.at(-1)?.position.x).toBeCloseTo(5, 6)
  })

  /**
   * 🛑 One writer of the view, always. An arm places a camera NODE; this reads it and films —
   * which is what lets an arm be optional without a second path through the renderer.
   */
  it('films through the camera node a spring arm placed', () => {
    const rigs = createRigs(null)
    const { world, views } = watching('thirdPerson', true, rigs)
    world.entities.add({
      id: 'eye',
      name: 'eye',
      transform: { ...restingTransform(), position: { x: 2, y: 3, z: 4 } },
      components: [],
    })
    const eye = world.entities.get('eye')
    if (eye) rigs.take(eye, 50)

    world.lateUpdate(0, STEP_SECONDS)

    expect(views.at(-1)?.position).toEqual({ x: 2, y: 3, z: 4 })
    // A camera at rest looks down −Z, so the mark it is aimed at is one metre that way.
    expect(views.at(-1)?.target.z).toBeCloseTo(3, 6)
  })

  /**
   * 🛑 The seat is emptied on EVERY frame, arm or no arm. `take` refuses a claim of equal rank
   * once the seat is full, so a seat kept while an arm films pins the first machine that ever
   * claimed it — and frames it still once it is destroyed.
   */
  it('lets the seat go on a frame a spring arm holds the shot', () => {
    const rigs = createRigs(null)
    const { world, pilots } = watching('thirdPerson', false, rigs)
    world.entities.add({ id: 'eye', name: 'eye', transform: restingTransform(), components: [] })
    world.entities.add({ id: 'car', name: 'car', transform: restingTransform(), components: [] })
    const eye = world.entities.get('eye')
    const car = world.entities.get('car')
    if (eye) rigs.take(eye, 50)
    if (car) pilots.take(car, 0, 5, PILOT_RANK.machine)

    world.lateUpdate(0, STEP_SECONDS)

    expect(pilots.leader()).toBeNull()
  })

  it('leaves an orbited set alone even when an arm placed a camera', () => {
    const rigs = createRigs(null)
    const { world, views } = watching('orbit', true, rigs)
    world.entities.add({ id: 'eye', name: 'eye', transform: restingTransform(), components: [] })
    const eye = world.entities.get('eye')
    if (eye) rigs.take(eye, 50)

    world.lateUpdate(0, STEP_SECONDS)

    expect(views).toEqual([null])
  })

  it('says nothing at all about a scene nobody walks', () => {
    const { world, views } = watching('firstPerson', false)

    world.lateUpdate(0, STEP_SECONDS)

    expect(views).toEqual([])
  })
})

/**
 * 🛑 Who the player is is a STRUCTURE, not the order a sweep met a component in. Two characters
 * in one scene used to frame whichever node the balayage reached first — invisible in the editor,
 * and impossible for an author to choose.
 */
describe('the body a player module designates', () => {
  it('frames the module body rather than the first walker the sweep met', () => {
    const { world, views } = watching('firstPerson', true, createRigs(null), 'second')
    world.entities.add({
      id: 'second',
      name: 'second',
      transform: { ...restingTransform(), position: { x: 8, y: 0, z: 0 } },
      components: [newComponent('CharacterController')],
    })

    world.lateUpdate(0, STEP_SECONDS)

    expect(views.at(-1)?.position.x).toBeCloseTo(8, 6)
  })

  /** Named a body the scene no longer holds, it frames whoever walks — never nothing at all. */
  it('falls back on the sweep where the body it names is gone', () => {
    const { world, views } = watching('firstPerson', true, createRigs(null), 'removed')

    world.lateUpdate(0, STEP_SECONDS)

    expect(views.at(-1)?.position.x).toBeCloseTo(0, 6)
  })
})
