// SPDX-License-Identifier: MIT

import type { BodyDescriptor, BodyPose, PhysicsPort } from '../ports/physicsPort'
import { restingTransform } from '../runtime/entity'
import { createRandom } from '../runtime/random'
import type { ColliderShape } from './shape'

/**
 * The four scenes both engines are read on, defined ONCE. A scene written again inside each bench
 * makes two columns look comparable while they answer different questions: the seed, the step,
 * the mix of shapes, the share of dynamic against fixed against kinematic, the masses and the
 * sensors have to be the SAME object, not the same intention.
 *
 * 🛑 `physics-5000-sleeping` is the one that matters most, and `awake()` is why: an engine that
 * puts bodies to sleep sooner reads faster for a reason that is not its solver. A bench that
 * prints milliseconds without printing how many bodies moved is not comparing anything.
 *
 * What is NOT held equal, because the port exposes no dial for it: each engine's own sleeping
 * thresholds. That is what a game gets, so that is what is measured.
 */
const BENCH_SEED = 20260901

const BENCH_STEP = 1 / 60

export type BenchScene = {
  name: string
  bodies: readonly BodyDescriptor[]
  /** Steps run before the clock starts, so what is timed is the state the name promises. */
  warmup: number
  /** How many bodies the warmup MEANS to leave in motion. `awake()` says how many there are. */
  moving: number
  /** The character each frame walks, when the scene is about the controller and nothing else. */
  walks: string | null
}

const body = (
  over: Partial<BodyDescriptor> & Pick<BodyDescriptor, 'body' | 'shape'>,
): BodyDescriptor => ({
  kind: 'dynamic',
  transform: restingTransform(),
  friction: 0.6,
  restitution: 0,
  mass: 0,
  gravityScale: 1,
  lockRotation: false,
  sensor: false,
  character: null,
  vehicle: null,
  ...over,
})

// 🛑 Not `IDENTITY_TRANSFORM` of `@shared/`: this tree is MIT and takes no VALUE from the shared
// one, which `main/game-imports.test.ts` holds.
const placed = (x: number, y: number, z: number) => ({
  ...restingTransform(),
  position: { x, y, z },
})

/** Four convex kinds rather than one, so a broadphase is not read on boxes alone. */
function shapeOf(index: number, size: number): ColliderShape {
  if (index % 4 === 1) return { kind: 'ball', radius: size }
  if (index % 4 === 2) return { kind: 'capsule', halfHeight: size * 0.5, radius: size * 0.6 }
  if (index % 4 === 3) return { kind: 'cylinder', halfHeight: size, radius: size * 0.8 }
  return { kind: 'cuboid', hx: size, hy: size, hz: size }
}

/** Where the pile kept moving stands, and where the one left to settle does. */
const MOVING_FLOOR = 'floor'
const SETTLED_FLOOR = 'rest'
const SETTLED_AT = 400

const SPACING = 1.2

/**
 * A cube of crates for the pile meant to keep moving — towers of mixed shapes topple, and a heap
 * settling into itself is what a frame of physics actually costs.
 *
 * 🛑 FLAT for the pile meant to sleep, and it is not a detail: piled up, the settled four
 * thousand never came to rest — measured 4 987 awake out of 5 000 under Rapier and 4 931 under
 * Jolt, which made the scene a second `physics-5000` under a name that promised the opposite.
 */
function pileInto(
  bodies: BodyDescriptor[],
  prefix: string,
  count: number,
  originX: number,
  seed: number,
  flat: boolean,
): void {
  const random = createRandom(seed)
  const side = Math.ceil(flat ? Math.sqrt(count) : Math.cbrt(count))
  const half = ((side - 1) * SPACING) / 2

  for (let index = 0; index < count; index++) {
    const size = 0.3 + random.next() * 0.2
    bodies.push(
      body({
        body: `${prefix}${index}`,
        shape: shapeOf(index, size),
        // Zero leaves each engine to weigh the shape, which is the default an author gets; one
        // crate in eight carries a mass, so the override is exercised on both sides.
        mass: index % 8 === 0 ? 1 + random.next() * 4 : 0,
        transform: placed(
          originX + (index % side) * SPACING - half,
          1 + (flat ? 0 : Math.floor(index / (side * side)) * SPACING),
          (Math.floor(index / side) % side) * SPACING - half,
        ),
      }),
    )
  }
}

/** The furniture a real scene carries beside its crates: walls, driven platforms, feeling volumes. */
function furnishInto(bodies: BodyDescriptor[], total: number): void {
  const each = Math.max(1, Math.round(total / 100))

  for (let index = 0; index < each * 2; index++) {
    bodies.push(
      body({
        body: `pillar${index}`,
        kind: 'fixed',
        shape: { kind: 'cuboid', hx: 0.4, hy: 3, hz: 0.4 },
        transform: placed(-40 + index * 2, 3, -18),
      }),
    )
  }
  for (let index = 0; index < each; index++) {
    bodies.push(
      body({
        body: `platform${index}`,
        kind: 'kinematic',
        shape: { kind: 'cuboid', hx: 1.5, hy: 0.2, hz: 1.5 },
        transform: placed(-30 + index * 4, 1.5, 18),
      }),
    )
  }
  for (let index = 0; index < each; index++) {
    bodies.push(
      body({
        body: `gate${index}`,
        kind: 'fixed',
        sensor: true,
        shape: { kind: 'cuboid', hx: 1.5, hy: 1.5, hz: 1.5 },
        transform: placed(-20 + index * 3, 1.5, 0),
      }),
    )
  }
}

function sceneOf(name: string, total: number, moving: number, warmup: number): BenchScene {
  const bodies: BodyDescriptor[] = [
    body({
      body: MOVING_FLOOR,
      kind: 'kinematic',
      shape: { kind: 'cuboid', hx: 120, hy: 0.5, hz: 120 },
      transform: placed(0, -0.5, 0),
    }),
  ]
  pileInto(bodies, 'moving', moving, 0, BENCH_SEED, false)

  if (total > moving) {
    bodies.push(
      body({
        body: SETTLED_FLOOR,
        kind: 'fixed',
        shape: { kind: 'cuboid', hx: 120, hy: 0.5, hz: 120 },
        transform: placed(SETTLED_AT, -0.5, 0),
      }),
    )
    pileInto(bodies, 'settled', total - moving, SETTLED_AT, BENCH_SEED + 1, true)
  }

  furnishInto(bodies, total)
  return { name, bodies, warmup, moving, walks: null }
}

/**
 * A series where ONLY the number of bodies changes: same geometry, same density, same drop, no
 * set — three layers on a floor that trembles, over a footprint that grows with the count.
 *
 * 🛑 It exists because `physics-500 → 2000 → 5000` is NOT monotonic, and that is measured: at
 * 5 000 the pile is sixteen layers, nineteen metres, and takes 120 steps to fall where the warmup
 * runs 90. Part of it is still in free fall at the clock, so interactions per active body are
 * LOWER there than at 2 000 — 0,95 against 1,42 under Rapier, 1,51 against 2,23 under Jolt. A gap
 * read on that series says the geometry, never the load.
 */
const SCALE_LAYERS = 3

function stackSceneOf(count: number, layers: number, name: string, warmup: number): BenchScene {
  const bodies: BodyDescriptor[] = [
    body({
      body: MOVING_FLOOR,
      kind: 'kinematic',
      shape: { kind: 'cuboid', hx: 120, hy: 0.5, hz: 120 },
      transform: placed(0, -0.5, 0),
    }),
  ]
  const random = createRandom(BENCH_SEED)
  const side = Math.ceil(Math.sqrt(count / layers))
  const half = ((side - 1) * SPACING) / 2

  for (let index = 0; index < count; index++) {
    const size = 0.3 + random.next() * 0.2
    const layer = Math.floor(index / (side * side))
    bodies.push(
      body({
        body: `scale${index}`,
        shape: shapeOf(index, size),
        mass: index % 8 === 0 ? 1 + random.next() * 4 : 0,
        // Just clear of the floor, so the whole slab has landed long before the clock starts.
        transform: placed(
          (index % side) * SPACING - half,
          0.7 + layer * 1.1,
          (Math.floor(index / side) % side) * SPACING - half,
        ),
      }),
    )
  }
  return { name, bodies, warmup, moving: count, walks: null }
}

export const SCALE_SCENES: readonly BenchScene[] = [500, 1000, 2000, 3500, 5000].map(count =>
  stackSceneOf(count, SCALE_LAYERS, `physics-scale-${count}`, 300),
)

/**
 * Two thousand bodies, always, and ONLY the depth of the stack changes. The one series that
 * answers « does the cost per contact point follow the length of the contact chains? » — measured
 * at 0,9 µs under Rapier whatever the geometry, and from 1,1 to 2,8 µs under Jolt.
 */
export const DEPTH_SCENES: readonly BenchScene[] = [1, 2, 4, 8, 16].map(layers =>
  stackSceneOf(2000, layers, `physics-depth-${layers}`, 400),
)

export const BENCH_SCENES: readonly BenchScene[] = [
  sceneOf('physics-500', 500, 500, 90),
  sceneOf('physics-2000', 2000, 2000, 90),
  sceneOf('physics-5000', 5000, 5000, 90),
  sceneOf('physics-5000-sleeping', 5000, 1000, 400),
]

/**
 * The character on its own, which is what elected Rapier over Jolt in the first place. Not one of
 * the four: it answers a different question, and the switch is not decided on it.
 */
export const CHARACTER_SCENE: BenchScene = {
  name: 'a character walking, floor and controller',
  warmup: 30,
  moving: 1,
  walks: 'walker',
  bodies: [
    body({
      body: 'floor',
      kind: 'fixed',
      shape: { kind: 'cuboid', hx: 60, hy: 0.5, hz: 60 },
      transform: placed(0, -0.5, 0),
    }),
    body({
      body: 'walker',
      kind: 'kinematic',
      shape: { kind: 'capsule', halfHeight: 0.6, radius: 0.3 },
      transform: placed(0, 0.9, 0),
      character: { stepHeight: 0.5, slopeLimit: 45, snapDistance: 0.5 },
    }),
  ],
}

/** Small and steady: what the controller costs is not what a walk goes anywhere. */
const WALK = [{ body: 'walker', wanted: { x: 0.05, y: -0.02, z: 0 }, facing: null }]

export type BenchRun = {
  /** The filled port, for a bench that times one CALL rather than a whole frame. */
  port: PhysicsPort
  /** One frame as a bench times it: the kinematics driven, the step, the poses read back. */
  frame: () => void
  /** How many bodies the last frame moved — what makes two timings comparable. */
  awake: () => number
  dispose: () => void
}

/**
 * Fills a port with a scene, runs its warmup, and hands back the one call a bench repeats.
 * Nothing here allocates per frame: the poses driven are built once and rewritten in place.
 */
export async function loadScene(
  scene: BenchScene,
  engine: () => Promise<PhysicsPort>,
): Promise<BenchRun> {
  const port = await engine()
  port.setGravity(-9.81)
  port.add(scene.bodies)

  const driven: BodyPose[] = scene.bodies
    .filter(one => one.kind === 'kinematic')
    .map(one => ({
      body: one.body,
      position: { ...one.transform.position },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    }))
  const resting = driven.map(pose => pose.position.y)
  let at = 0

  // 🛑 Enough to keep every contact of the moving pile live, and far too little to move it
  // anywhere. A pile left alone settles within a few steps, and every iteration after that would
  // time a sleeping scene under a name that promises a moving one.
  const frame = (): void => {
    const offset = Math.sin((at += 1) * 0.3) * 0.002
    for (let index = 0; index < driven.length; index++) {
      const pose = driven[index]
      const rest = resting[index]
      if (pose && rest !== undefined) pose.position.y = rest + offset
    }
    port.place(driven)
    if (scene.walks) port.moveCharacters(WALK)
    port.step(BENCH_STEP)
    port.poses()
  }

  for (let step = 0; step < scene.warmup; step++) frame()

  return {
    frame,
    // `poses` walks the ACTIVE island alone on both engines, so its length IS the awake count.
    port,
    awake: () => port.poses().length,
    dispose: () => port.dispose(),
  }
}
