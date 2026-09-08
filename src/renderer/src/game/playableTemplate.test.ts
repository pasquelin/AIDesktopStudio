import { describe, expect, it } from 'vitest'
import { STEP_SECONDS } from '@game/runtime/gameLoop'
import { TEMPLATES_BY_GROUP, type SceneTemplateId } from '@shared/domain/sceneTemplate'
import { createExportHost } from '@game/host/exportHost'
import { loadJoltPhysics } from '@game/host/joltPhysics'
import { notedPhysics } from '@game/physics/physics-fixtures'
import { reading } from '@game/runtime/input-fixtures'
import { axesOfEuler, restingAxes } from '@game/physics/quaternion'
import type { BodyDescriptor } from '@game/ports/physicsPort'
import type { CameraView } from '@game/ports/renderPort'
import { sceneFromTemplate } from '@/engines/scene/sceneTemplates'
import { worldFromScene } from './worldFromScene'

const STEP = 1 / 60

/** The document a person gets from « Nouveau document », run as the game it claims to be. */
function played(id: SceneTemplateId) {
  const views: (CameraView | null)[] = []
  const physics = notedPhysics()
  const world = worldFromScene('doc-1', sceneFromTemplate(id), {
    ...createExportHost({
      input: new EventTarget(),
      player: { id: 'p1', name: 'Alba', local: true },
      files: {},
    }),
    physics,
    render: { place: () => {}, view: view => views.push(view), veil: () => {} },
  })

  world.step(STEP)
  world.lateUpdate(0, STEP_SECONDS)
  return { views, bodies: physics.added ?? [] }
}

/**
 * 🛑 Read off the play CAMERA rather than off the components: the camera system says nothing at
 * all about a scene nobody walks, so a view landing here is the whole chain answering.
 */
describe('what « Nouveau document ▸ Third Person » opens on', () => {
  it('turns the third-person body into each movement direction while the camera follows it', async () => {
    const physics = await loadJoltPhysics()
    let input = reading()
    const view: { current: CameraView | null } = { current: null }
    const world = worldFromScene('doc-1', sceneFromTemplate('thirdPerson'), {
      ...createExportHost({
        input: new EventTarget(),
        player: { id: 'p1', name: 'Alba', local: true },
        files: {},
      }),
      physics,
      input: {
        state: () => input,
        pointer: () => input.pointer,
        endStep: () => {},
        detach: () => {},
      },
      render: {
        place: () => {},
        view: next => {
          view.current = next
        },
        veil: () => {},
      },
    })
    const tick = () => {
      world.step(STEP)
      world.lateUpdate(1, STEP)
    }
    try {
      tick()
      const body = [...world.entities.withComponent('CharacterController')][0]
      expect(body).toBeDefined()
      if (!body) return
      const axes = restingAxes()
      for (const key of ['KeyD', 'KeyS', 'KeyA', 'KeyW']) {
        input = reading({ held: [key] })
        for (let step = 0; step < 30; step++) tick()
        const before = { ...body.transform.position }
        tick()
        const dx = body.transform.position.x - before.x
        const dz = body.transform.position.z - before.z
        const distance = Math.hypot(dx, dz)
        const { forward } = axesOfEuler(body.transform.rotation, axes)
        expect(distance).toBeGreaterThan(0.01)
        expect((forward.x * dx + forward.z * dz) / distance).toBeGreaterThan(0.99)
      }
      input = reading()
      for (let step = 0; step < 60; step++) tick()
      const camera = view.current
      const pose = [...physics.poses()].find(one => one.body === body.id)
      expect(pose).toBeDefined()
      if (!camera || !pose) throw new Error('Missing player pose or camera')
      expect(camera.position.x).toBeCloseTo(pose.position.x, 2)
      expect(camera.position.z - pose.position.z).toBeCloseTo(4, 1)
      expect(camera.target.z).toBeLessThan(camera.position.z)
    } finally {
      world.dispose()
      physics.dispose()
    }
  })

  it.each(TEMPLATES_BY_GROUP.character)('gives %s a game somebody walks', id => {
    // The LENGTH first: a scene nobody walks is answered with no view at all, and `views[0]`
    // would then be `undefined` — which is not null either.
    const { views, bodies } = played(id)

    expect(views).toHaveLength(1)
    expect(views[0]).not.toBeNull()
    // 🛑 And a SET to stand on: the camera system answers for anyone carrying a controller, floor
    // or no floor. Measured — one body when the physics refused a parented node, 31 once it
    // composed them, so a number that low again means the whole set went back to being a picture.
    expect(bodies.filter(one => one.kind === 'fixed').length).toBeGreaterThan(20)
  })

  it('pulls whoever walks it down, which is what makes a floor mean anything', () => {
    for (const id of TEMPLATES_BY_GROUP.character) {
      expect(sceneFromTemplate(id).world.play.gravity).toBeGreaterThan(0)
    }
  })

  /** The ones nobody plays are sets, not games — and none of them claims otherwise. */
  it.each([...TEMPLATES_BY_GROUP.general, ...TEMPLATES_BY_GROUP.staging])(
    'leaves %s a set nobody is walked in',
    id => {
      expect(sceneFromTemplate(id).nodes.flatMap(node => node.components ?? [])).toEqual([])
    },
  )
})

/**
 * 🛑 Not `joltPhysics.test.ts`: a flight of loose boxes measures the CONTROLLER, and it climbs one.
 * What a person cannot climb is THIS geometry, so this is where the case has to stand.
 */
describe('the court stair of the set a character template opens on', () => {
  it('is climbed by a capsule pushed up it at walking pace', async () => {
    const port = await loadJoltPhysics()
    port.setGravity(-9.81)
    // The set as the physics system builds it, minus whoever walks it: a walker of our own is put
    // at the foot of the stair instead, so nothing here depends on where a template stands.
    port.add([
      ...played('firstPerson').bodies.filter(one => one.character === null),
      WALKER_AT_THE_FOOT,
    ])

    for (let step = 0; step < 240; step++) {
      port.moveCharacters([
        { body: 'walker', wanted: { x: 4 / 60, y: -1 / 60, z: 0 }, facing: null },
      ])
      port.step(STEP)
    }

    const walker = [...port.poses()].find(pose => pose.body === 'walker')
    port.dispose()
    // Out of the court, whose floor is at -2,5: standing on the floor above puts the capsule's
    // centre at 0,9, and anything below zero is a walker still down in the hole.
    expect(walker?.position.y ?? -99).toBeGreaterThan(0.5)
  })
})

/** In the court, one step short of the first riser, facing the climb. */
const WALKER_AT_THE_FOOT: BodyDescriptor = {
  body: 'walker',
  kind: 'kinematic',
  shape: { kind: 'capsule', halfHeight: 0.6, radius: 0.3 },
  transform: {
    position: { x: 0.6, y: -1.6, z: 2.5 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  },
  friction: 0.6,
  restitution: 0,
  mass: 0,
  gravityScale: 1,
  lockRotation: true,
  sensor: false,
  character: { stepHeight: 0.5, slopeLimit: 45, snapDistance: 0.5 },
  vehicle: null,
}

it('keeps the first-person view forward while the player walks sideways', async () => {
  const physics = await loadJoltPhysics()
  const host = createExportHost({
    input: new EventTarget(),
    player: { id: 'p1', name: 'Alba', local: true },
    files: {},
  })
  const input = reading({ held: ['KeyD'] })
  const views: CameraView[] = []
  const world = worldFromScene('doc-1', sceneFromTemplate('firstPerson'), {
    ...host,
    physics,
    input: { ...host.input, state: () => input },
    render: {
      ...host.render,
      view: view => {
        if (view) views.push(structuredClone(view))
      },
    },
  })
  try {
    for (let step = 0; step < 30; step++) {
      world.step(STEP)
      world.lateUpdate(1, STEP)
    }
    const view = views.at(-1)
    if (!view) throw new Error('Missing first-person view')
    expect(view.position.x).toBeGreaterThan(0.1)
    expect(view.target.x - view.position.x).toBeCloseTo(0)
    expect(view.target.z - view.position.z).toBeCloseTo(-1)
  } finally {
    world.dispose()
    physics.dispose()
  }
})

it('keeps the first-person camera at eye height throughout a jump', async () => {
  const physics = await loadJoltPhysics()
  const host = createExportHost({
    input: new EventTarget(),
    player: { id: 'p1', name: 'Alba', local: true },
    files: {},
  })
  let input = reading()
  const views: CameraView[] = []
  const world = worldFromScene('doc-1', sceneFromTemplate('firstPerson'), {
    ...host,
    physics,
    input: { ...host.input, state: () => input },
    render: {
      ...host.render,
      view: view => {
        if (view) views.push(structuredClone(view))
      },
    },
  })
  try {
    world.step(STEP)
    world.lateUpdate(1, STEP)
    const standingView = views.at(-1)
    if (!standingView) throw new Error('Missing standing first-person view')
    const standing = standingView.position.y

    input = reading({ pressed: ['Space'] })
    world.step(STEP)
    world.lateUpdate(1, STEP)

    const jumpingView = views.at(-1)
    if (!jumpingView) throw new Error('Missing jumping first-person view')
    expect(jumpingView.position.y).toBeGreaterThan(standing)
    const body = [...world.entities.withComponent('CharacterController')][0]
    const pose = body ? [...physics.poses()].find(one => one.body === body.id) : undefined
    expect(pose).toBeDefined()
    expect(jumpingView.position.y).toBeCloseTo((pose?.position.y ?? 0) + 0.8, 5)

    input = reading()
    for (let frame = 0; frame < 30; frame++) {
      world.step(STEP)
      world.lateUpdate(1, STEP)
      const view = views.at(-1)
      const currentPose = body ? [...physics.poses()].find(one => one.body === body.id) : undefined
      if (!view || !currentPose) throw new Error('Missing first-person jump pose')
      expect(view.position.y).toBeCloseTo(currentPose.position.y + 0.8, 5)
    }
  } finally {
    world.dispose()
    physics.dispose()
  }
})

/** Six frames of a straight vertical climb, as the height the body reached and the one filmed. */
function climbedHeights(template: 'firstPerson' | 'thirdPerson'): { body: number; view: number }[] {
  const physics = notedPhysics()
  const views: CameraView[] = []
  const world = worldFromScene('doc-1', sceneFromTemplate(template), {
    ...createExportHost({
      input: new EventTarget(),
      player: { id: 'p1', name: 'Alba', local: true },
      files: {},
    }),
    physics,
    render: {
      place: () => {},
      view: view => {
        if (view) views.push(structuredClone(view))
      },
      veil: () => {},
    },
  })
  try {
    const body = [...world.entities.withComponent('CharacterController')][0]
    if (!body) throw new Error('Missing climbing character')

    return Array.from({ length: 6 }, (_, step) => {
      body.transform.position.y = 0.9 + step * 0.35
      world.lateUpdate(0, STEP)
      const view = views.at(-1)
      if (!view) throw new Error('Missing climbing view')
      return { body: body.transform.position.y, view: view.position.y }
    })
  } finally {
    world.dispose()
    physics.dispose()
  }
}

it('follows the first-person camera through a vertical climb', () => {
  for (const frame of climbedHeights('firstPerson')) {
    expect(frame.view).toBeCloseTo(frame.body + 0.8, 5)
  }
})

// The arm that films it lags on purpose, and that lag stops at the height: an eye held back on the
// way up reads as the ground dropping away rather than the body rising.
it('follows the over-the-shoulder camera through a vertical climb', () => {
  const frames = climbedHeights('thirdPerson')
  const first = frames[0]
  if (!first) throw new Error('Missing over-the-shoulder climb')

  for (const frame of frames)
    expect(frame.view).toBeCloseTo(frame.body + (first.view - first.body), 5)
})
