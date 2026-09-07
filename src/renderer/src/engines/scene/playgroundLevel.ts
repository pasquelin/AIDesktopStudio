/**
 * The level the three character templates open on — a set built to be WALKED rather than looked
 * at. Everything is a primitive of the studio, so every part stays editable in the outliner.
 *
 * Every piece is written by its EDGES, never its centre — see `slab`: two parts that meet then
 * share the very same constant, which is what stops a stair ending half a step short.
 */
import type { Component } from '@shared/domain/component'
import type { MaterialDescriptor, Vector3 } from '@shared/domain/scene'
import { newComponent } from '@shared/domain/componentRegistry'
import { climbSurface, groundSurface, markSurface, obstacleSurface, surface } from './levelParts'
import { groupNode, meshNode, transformAt } from './nodeFactory'
import { IDENTITY_TRANSFORM, type SceneNode } from './sceneState'

/** Metres, and the whole set is laid out on a two-metre grid so nothing lands off it. */
const HALF_X = 20
const HALF_Z = 16

/**
 * A SLAB, not a plane — one sees it from below. THIN, measured: at three metres it is a mass the
 * orbiting camera spends its time inside, and from inside a solid one sees straight through it.
 */
const FLOOR_DEPTH = 0.5
const WALL_HEIGHT = 4
const WALL_THICKNESS = 0.5

/** The court sunk into the middle — a drop to fall into, cross over, and climb back out of. */
const COURT_HALF_X = 6
const COURT_HALF_Z = 4
const COURT_FLOOR = -2.5

const TERRACE_HEIGHT = 1.5
const TERRACE_EDGE_X = -8
const TERRACE_EDGE_Z = -10
const WALKWAY_HEIGHT = 3

/** The set is read from the start pad, looking down −Z, and everything is placed against that. */
const START_Z = 10

/** The six planes that bound a block — a part says where it STOPS, and its neighbour starts there. */
type Bounds = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }

/** Nothing here computes a centre by hand: that arithmetic had the four walls overlapping. */
function slab(
  bounds: Bounds,
  name: string,
  material: MaterialDescriptor,
  parentId: string,
): SceneNode {
  return meshNode(
    {
      kind: 'box',
      width: bounds.x1 - bounds.x0,
      height: bounds.y1 - bounds.y0,
      depth: bounds.z1 - bounds.z0,
    },
    {
      transform: transformAt({
        x: (bounds.x0 + bounds.x1) / 2,
        y: (bounds.y0 + bounds.y1) / 2,
        z: (bounds.z0 + bounds.z1) / 2,
      }),
      material,
      parentId,
      name,
    },
  )
}

/** Metres from the centre of the set, on each horizontal axis. */
type Extent = { x: number; z: number }

/**
 * The four bands filling the space between an inner rectangle and an outer one, mitred: north and
 * south run the FULL width and the other two fit between them, so no two overlap at a corner.
 */
function ring(
  span: { inner: Extent; outer: Extent; y0: number; y1: number },
  name: string,
  material: () => MaterialDescriptor,
  parentId: string,
): SceneNode[] {
  const { inner, outer } = span
  const height = { y0: span.y0, y1: span.y1 }

  const sides: [Bounds, string][] = [
    [{ x0: -outer.x, x1: outer.x, z0: -outer.z, z1: -inner.z, ...height }, `${name} North`],
    [{ x0: -outer.x, x1: outer.x, z0: inner.z, z1: outer.z, ...height }, `${name} South`],
    [{ x0: -outer.x, x1: -inner.x, z0: -inner.z, z1: inner.z, ...height }, `${name} West`],
    [{ x0: inner.x, x1: outer.x, z0: -inner.z, z1: inner.z, ...height }, `${name} East`],
  ]

  return sides.map(([bounds, side]) => slab(bounds, side, material(), parentId))
}

const COURT_WALL = 0.4

/**
 * The four sides of the sunken court, standing from its floor up to the UNDERSIDE of the walked
 * one — never through it, which would leave two faces fighting for the same depth all round the
 * opening. Outside the court's rectangle, so the opening stays exactly the size it claims.
 */
function courtWalls(parentId: string): SceneNode[] {
  return ring(
    {
      inner: { x: COURT_HALF_X, z: COURT_HALF_Z },
      outer: { x: COURT_HALF_X + COURT_WALL, z: COURT_HALF_Z + COURT_WALL },
      y0: COURT_FLOOR,
      y1: -FLOOR_DEPTH,
    },
    'Court Wall',
    groundSurface,
    parentId,
  )
}

/**
 * The floor, as four slabs around the court — a solid cannot be pierced, and the court is the
 * whole point: what a fall, a jump and the plank across it are all tested against.
 */
function floorSlabs(parentId: string): SceneNode[] {
  return [
    ...ring(
      {
        inner: { x: COURT_HALF_X, z: COURT_HALF_Z },
        outer: { x: HALF_X, z: HALF_Z },
        y0: -FLOOR_DEPTH,
        y1: 0,
      },
      'Floor',
      groundSurface,
      parentId,
    ),
    slab(
      {
        x0: -COURT_HALF_X,
        x1: COURT_HALF_X,
        y0: COURT_FLOOR - FLOOR_DEPTH,
        y1: COURT_FLOOR,
        z0: -COURT_HALF_Z,
        z1: COURT_HALF_Z,
      },
      'Court Floor',
      groundSurface(),
      parentId,
    ),
    slab(
      { x0: -1.5, x1: 1.5, y0: 0, y1: 0.05, z0: START_Z - 1.5, z1: START_Z + 1.5 },
      'Start',
      markSurface(),
      parentId,
    ),
  ]
}

/** The wall around it all, INSIDE the edge so the floor is not left hanging over its own. */
function walls(parentId: string): SceneNode[] {
  return ring(
    {
      inner: { x: HALF_X - WALL_THICKNESS, z: HALF_Z - WALL_THICKNESS },
      outer: { x: HALF_X, z: HALF_Z },
      y0: 0,
      y1: WALL_HEIGHT,
    },
    'Wall',
    () => surface('#6a737f'),
    parentId,
  )
}

/**
 * 🛑 The rise is DERIVED from the drop and the count, never written by hand — and that is what was
 * wrong with it. At five steps it came to 0,50 m, which is exactly the `stepHeight` a
 * `CharacterController` ships with, and exactly its `snapDistance`: the controller's own skin and a float
 * put the obstacle on either side of the limit from one step to the next, so a walker climbed one,
 * caught on the next, and was snapped back down onto the one before. Eight steps leave the margin.
 */
const STEP_COUNT = 8
const STEP_RISE = -COURT_FLOOR / STEP_COUNT
const STEP_RUN = 0.6

/**
 * The stair out of the court, its TOP step against the court's edge where the floor it leads to
 * stands — built the other way round, the climb ends at floor level in mid-court, over the drop.
 */
function courtStair(parentId: string): SceneNode[] {
  return Array.from({ length: STEP_COUNT }, (_, index) => {
    const x1 = COURT_HALF_X - (STEP_COUNT - 1 - index) * STEP_RUN

    return slab(
      {
        x0: x1 - STEP_RUN,
        x1,
        y0: COURT_FLOOR,
        y1: COURT_FLOOR + (index + 1) * STEP_RISE,
        // The southern half of the court, clear of the plank that crosses its middle.
        z0: 1,
        z1: COURT_HALF_Z,
      },
      `Court Step ${index + 1}`,
      climbSurface(),
      parentId,
    )
  })
}

const RAMP_RUN = 6
const RAMP_WIDTH = 3

/**
 * A raised floor along the north wall, and the slope onto it. A POSITIVE pitch about X raises the
 * -Z end, which is the end the terrace waits at; the centre stands at half the rise, which puts
 * the foot of the slope on the floor rather than under it.
 */
function terrace(parentId: string): SceneNode[] {
  return [
    slab(
      {
        x0: -HALF_X + WALL_THICKNESS,
        x1: TERRACE_EDGE_X,
        y0: 0,
        y1: TERRACE_HEIGHT,
        z0: -HALF_Z + WALL_THICKNESS,
        z1: TERRACE_EDGE_Z,
      },
      'Terrace',
      groundSurface(),
      parentId,
    ),
    meshNode(
      { kind: 'box', width: RAMP_WIDTH, height: 0.4, depth: RAMP_RUN },
      {
        transform: transformAt(
          { x: -14, y: TERRACE_HEIGHT / 2, z: TERRACE_EDGE_Z + RAMP_RUN / 2 },
          { x: Math.atan2(TERRACE_HEIGHT, RAMP_RUN), y: 0, z: 0 },
        ),
        material: climbSurface(),
        parentId,
        name: 'Ramp',
      },
    ),
  ]
}

/**
 * A walkway ACROSS the court on two legs — the height a fall is judged from. North of the plank,
 * never between the start pad and the court: laid there it hides the whole set behind it.
 */
function walkway(parentId: string): SceneNode[] {
  const legs: [number, string][] = [
    [-COURT_HALF_X - 1.5, 'Walkway Leg West'],
    [COURT_HALF_X + 1.5, 'Walkway Leg East'],
  ]

  return [
    slab(
      { x0: -9, x1: 9, y0: WALKWAY_HEIGHT, y1: WALKWAY_HEIGHT + 0.3, z0: -3.2, z1: -1.6 },
      'Walkway',
      climbSurface(),
      parentId,
    ),
    ...legs.map(([x, name]) =>
      slab(
        { x0: x - 0.3, x1: x + 0.3, y0: 0, y1: WALKWAY_HEIGHT, z0: -3, z1: -1.8 },
        name,
        obstacleSurface(),
        parentId,
      ),
    ),
  ]
}

/**
 * Three blocks at rising heights, the gaps between them widening: the question a jump answers.
 *
 * 🛑 Cut to what a HUMAN clears, and measured against the port: a jump of 2,8 m/s reaches 0,40 m
 * and stays up 0,57 s, so it lands a block at 0,90 m and carries 2,3 m. The old course — 0,6 to
 * 1,8 m across gaps up to 3,4 — was drawn for the 5 m/s jump, which reached 1,27 m.
 */
function jumps(parentId: string): SceneNode[] {
  const blocks: SceneNode[] = []
  let x = 3

  for (const [index, gap] of [1, 1.5, 2].entries()) {
    blocks.push(
      slab(
        { x0: x, x1: x + 2, y0: 0, y1: 0.6 + index * 0.15, z0: -14, z1: -12 },
        `Jump Block ${index + 1}`,
        climbSurface(),
        parentId,
      ),
    )
    x += 2 + gap
  }

  return blocks
}

/** Pillars to go round, and the plank across the court — precision rather than speed. */
function obstacles(parentId: string): SceneNode[] {
  // In the open floor the course leaves free, never in the way of a climb or a jump.
  const pillars: [number, number, string][] = [
    [-14, 6, 'Pillar West'],
    [14, 8, 'Pillar East'],
    [12, -6, 'Pillar North'],
  ]

  return [
    ...pillars.map(([x, z, name]) =>
      meshNode(
        { kind: 'cylinder', radiusTop: 0.6, radiusBottom: 0.6, height: 3.2, segments: 24 },
        { transform: transformAt({ x, y: 1.6, z }), material: obstacleSurface(), parentId, name },
      ),
    ),
    // Flush with the floor it spans, so crossing the court is a matter of aim rather than of a
    // step up. Clear of the stair to its south and of the walkway to its north.
    slab(
      { x0: -COURT_HALF_X, x1: COURT_HALF_X, y0: -0.15, y1: 0, z0: -0.6, z1: 0.6 },
      'Plank',
      climbSurface(),
      parentId,
    ),
  ]
}

/**
 * One group per family: thirty parts flat in the outliner is a list nobody reads.
 *
 * 🛑 Every part is SOLID, groups included in the tidying: the physics composes a parent's place
 * now (`game/hierarchy.ts`), so a set can be both readable and something one bumps into. It was
 * the other way round for one lot — the floor at the root, the rest walked through.
 */
export function playgroundNodes(played = 'Character'): SceneNode[] {
  const ground = groupNode(IDENTITY_TRANSFORM, 'Ground')
  const enclosure = groupNode(IDENTITY_TRANSFORM, 'Enclosure')
  const course = groupNode(IDENTITY_TRANSFORM, 'Course')
  const machinery = groupNode(IDENTITY_TRANSFORM, 'Machines')

  return [
    ground,
    enclosure,
    course,
    machinery,
    ...[
      ...floorSlabs(ground.id),
      ...courtWalls(ground.id),
      ...walls(enclosure.id),
      ...courtStair(course.id),
      ...terrace(course.id),
      ...walkway(course.id),
      ...jumps(course.id),
      ...obstacles(course.id),
    ].map(solid),
    // 🛑 Outside the `map`, which REPLACES a node's components: a machine dressed by `solid`
    // would lose the very component that moves it.
    ...machines(machinery.id, played),
  ]
}

/** A part the physics feels — the shape it draws, read as the volume it stops you at. */
const solid = (node: SceneNode): SceneNode => ({ ...node, components: [newComponent('Collider')] })

/**
 * A part the game DRIVES: felt like a solid, and travelled by whatever component is handed in.
 *
 * 🛑 `kinematic`, and that is what makes it carry: a dynamic body would fall, and a fixed one
 * would not hear the transform the travelling system writes.
 */
const driven = (node: SceneNode, ...travelling: readonly Component[]): SceneNode => ({
  ...node,
  components: [
    newComponent('Collider'),
    { ...newComponent('RigidBody'), kind: 'kinematic' },
    ...travelling,
  ],
})

/** A named place, and nothing else — what `Patrol` walks between. */
const post = (name: string, at: Vector3, parentId: string): SceneNode => ({
  ...groupNode(transformAt(at), name),
  parentId,
})

/**
 * The moving parts of the set.
 *
 * 🛑 Every one of them is built from a travelling COMPONENT and nothing else. A lift written by
 * hand here would be the same behaviour a second time, and the vehicle and aircraft templates
 * would each write a third — which is exactly how a set of components stops being used at all.
 *
 * 🛑 `played` is who the beacon and the drone watch, and it is a PARAMETER because the set is
 * driven as well as walked: a `Character` written here left both of them turning at a name the
 * car template does not carry — silently, the systems answering nothing for a name nobody wears.
 */
function machines(parentId: string, played: string): SceneNode[] {
  const bar = meshNode(
    { kind: 'box', width: 5, height: 0.4, depth: 0.4 },
    { transform: transformAt({ x: 0, y: 0.6, z: 6 }), material: climbSurface(), parentId },
  )

  return [
    travellingMachine(parentId, 'Lift', 2, 2, `-4 ${COURT_FLOOR + 0.15} 2, -4 0.15 2`, 1.5),
    travellingMachine(
      parentId,
      'Ferry',
      -2,
      2.5,
      `-4 ${COURT_FLOOR + 0.15} -2, 4 ${COURT_FLOOR + 0.15} -2`,
      2,
    ),
    driven({ ...bar, name: 'Turnstile' }, { ...newComponent('Spin'), axis: 'y', speed: 40 }),
    post('Post West', { x: -16, y: TERRACE_HEIGHT + 0.3, z: -12 }, parentId),
    post('Post East', { x: -10, y: TERRACE_HEIGHT + 0.3, z: -12 }, parentId),
    sentry(parentId),
    // Two components on one node, and they do not fight: `Orbit` writes the place, `LookAt` the
    // turn. The beacon circles the turnstile and keeps facing whoever is walking.
    beacon(parentId, played),
    drone(parentId, played),
  ]
}

function travellingMachine(
  parentId: string,
  name: string,
  z: number,
  width: number,
  waypoints: string,
  speed: number,
): SceneNode {
  const node = meshNode(
    { kind: 'box', width, height: 0.3, depth: 2 },
    {
      transform: transformAt({ x: -4, y: COURT_FLOOR + 0.15, z }),
      material: climbSurface(),
      parentId,
      name,
    },
  )
  return driven(node, { ...newComponent('Path'), waypoints, speed, mode: 'pingPong' })
}

function sentry(parentId: string): SceneNode {
  const node = meshNode(
    { kind: 'box', width: 0.6, height: 0.6, depth: 0.6 },
    {
      transform: transformAt({ x: -16, y: TERRACE_HEIGHT + 0.3, z: -12 }),
      parentId,
      name: 'Sentry',
    },
  )
  return driven(node, {
    ...newComponent('Patrol'),
    waypoints: 'Post West, Post East',
    speed: 1.5,
    waitSeconds: 1,
    mode: 'pingPong',
  })
}

function beacon(parentId: string, played: string): SceneNode {
  return {
    ...meshNode(
      { kind: 'sphere', radius: 0.3, widthSegments: 16, heightSegments: 12 },
      { transform: transformAt({ x: 3, y: 1.8, z: 6 }), parentId, name: 'Beacon' },
    ),
    components: [
      { ...newComponent('Orbit'), target: 'Turnstile', radius: 3, speed: 60, height: 1.2 },
      { ...newComponent('LookAt'), target: played, turnSpeed: 180 },
    ],
  }
}

function drone(parentId: string, played: string): SceneNode {
  return {
    ...meshNode(
      { kind: 'sphere', radius: 0.35, widthSegments: 16, heightSegments: 12 },
      { transform: transformAt({ x: 3.5, y: 3, z: 13 }), parentId, name: 'Drone' },
    ),
    components: [
      { ...newComponent('Follow'), target: played, speed: 2.5, stopDistance: 3, acceleration: 4 },
      { ...newComponent('LookAt'), target: played, turnSpeed: 120 },
    ],
  }
}
