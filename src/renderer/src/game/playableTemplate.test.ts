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
