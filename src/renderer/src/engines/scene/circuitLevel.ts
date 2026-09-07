// SPDX-License-Identifier: MIT

/**
 * 🛑 Written by its CENTRE LINE, never corner by corner. A track laid as a list of boxes drifts —
 * the kerbs stop matching the tarmac, and a car finds a wall in the middle of a straight.
 */
import { bezierPathOf, type MaterialDescriptor, type Vector3 } from '@shared/domain/scene'
import { groupNode, meshNode, transformAt } from './nodeFactory'
import {
  climbSurface,
  dense,
  fieldNode,
  fixedBody,
  grassSurface,
  groundSurface,
  markSurface,
  obstacleSurface,
} from './levelParts'
import { curveOf, turnRadiusAt } from './cameraPath'
import { offsetRun, sampledRun } from './ribbonGeometry'
import { IDENTITY_TRANSFORM, type SceneNode } from './sceneState'

/** Metres. Wide enough for two cars and for a mistake, which is what makes a corner worth taking. */
const TRACK_WIDTH = 12
const TARMAC_DEPTH = 0.2

/** How far the tarmac's top face stands over the ground the car actually rests on. */
const TARMAC_PROUD = 0.03

/** The line is LAID on the tarmac, so its own thickness sits above it rather than half inside. */
const LINE_DEPTH = 0.04

/**
 * 🛑 A kerb SHAKES a car, it does not stop one. At ninety centimetres it was a wall painted like a
 * kerb, and one object carried both roles — where the track ends, and what a car that leaves it meets.
 */
const KERB_HEIGHT = 0.07
const KERB_THICKNESS = 2

/**
 * 🛑 How far a kerb sits ON the tarmac, and it is not decoration: a band offset by its own points
 * bows OUTWARD between them, and laid edge to edge it opened up to 67 cm of grass down the straight.
 */
const KERB_BITE = 0.75

/** Where a kerb's inner edge lands: on the tarmac, by `KERB_BITE`. */
const KERB_INNER = TRACK_WIDTH / 2 - KERB_BITE

/** The other half of that split: what stops a car, held back in the grass past the kerb. */
const BARRIER_HEIGHT = 0.9
const BARRIER_THICKNESS = 0.6

/** Metres of grass between the outer edge of a kerb and the barrier — the room to gather a slide. */
const BARRIER_CLEARANCE = 3

/**
 * How many points the loop is drawn through, and how wide it is before the harmonics stretch it.
 * Twenty-four of a 600 m lap is a 25 m chord — short enough to read as a curve.
 */
const MARKS = 24
const BASE_RADIUS = 95

/**
 * 🛑 At 0,34 and 0,16 the tightest radius was 10 m for a track 12 m wide, and a barrier held
 * 10,3 m out folded through itself. These leave 46 m.
 */
const OVAL_PULL = 0.2
const SYMMETRY_BREAK = 0.08

/**
 * Fifteen cross-sections per mark. Measured on the loop: the tightest turn goes from 50,4° a
 * section to 10,7°, where ten sections leave it at 16,1° — the hairpin is where it shows.
 */
const CURVE_SEGMENTS = MARKS * 15

/**
 * 🛑 Metres between squares. The studio default of one turned a 340 m field into noise and a
 * one-metre kerb into a stack of cubes.
 */
const TARMAC_TILE = 5
const KERB_TILE = 3
const BARRIER_TILE = 2
const GRASS_TILE = 12.5
const PADDOCK_TILE = 2

/** How far the finish line stands down the track from the grid, and the car behind it. */
const LINE_AHEAD = 6
const CAR_BEHIND = 3

/**
 * 🛑 The centre line as the bands are SWEPT, not the two dozen anchors it is written through: a
 * chord between two marks is 26 m long, and a heading read off one points where the curve does not.
 */
const CENTRE_PATH = bezierPathOf(circuitLine(0), true)
const CENTRE_CURVE = sampledRun(CENTRE_PATH, CURVE_SEGMENTS)

/** Where a lap starts, as an abscissa: the straightest run of the loop, where a grid belongs. */
const GRID_U = straightestOf(CENTRE_CURVE) / CENTRE_CURVE.length

const START = alongCurve(CAR_BEHIND)
export const CIRCUIT_START_YAW = START.yaw
export const CIRCUIT_START: Vector3 = START.at

/**
 * 🛑 The straightest stretch, measured over a car's length either side: a grid laid at the first
 * mark fell in a corner, and its line stood across the track at an angle.
 */
function straightestOf(curve: readonly Vector3[]): number {
  const reach = Math.max(2, Math.round((curve.length * 8) / curveOf(CENTRE_PATH).getLength()))
  const radii = curve.map((_, at) => turnRadiusAt(curve, at, reach))
  return radii.indexOf(Math.max(...radii))
}

/** A point `ahead` metres ALONG the curve from the grid, and the way the track runs there. */
function alongCurve(ahead: number): { at: Vector3; yaw: number } {
  const curve = curveOf(CENTRE_PATH)
  const wrap = (u: number): number => ((u % 1) + 1) % 1
  const step = ahead / curve.getLength()
  const at = curve.getPointAt(wrap(GRID_U + step))
  // A metre further on names the heading; the tangent itself would need the curve's derivative.
  const next = curve.getPointAt(wrap(GRID_U + step + 1 / curve.getLength()))

  return { at: { x: at.x, y: 0, z: at.z }, yaw: Math.atan2(next.x - at.x, next.z - at.z) }
}

/**
 * 🛑 POLAR, and that is the whole point: a loop written as a list of corners crossed itself six
 * times. A radius that stays positive cannot — every ray from the centre meets it once.
 */
export function circuitLine(atHeight: number): Vector3[] {
  return Array.from({ length: MARKS }, (_, index) => {
    const angle = (index / MARKS) * Math.PI * 2
    // Two harmonics: the second stretches the loop into a long oval, the third breaks its
    // symmetry so no two corners of the lap are taken the same way.
    const radius =
      BASE_RADIUS * (1 + OVAL_PULL * Math.cos(2 * angle) + SYMMETRY_BREAK * Math.sin(3 * angle))
    return { x: Math.sin(angle) * radius, y: atHeight, z: Math.cos(angle) * radius }
  })
}

/** ONE mesh a piece, mitred at every joint — see `GeometryDescriptor` for what boxes could not do. */
function ribbonNode(band: {
  points: readonly Vector3[]
  width: number
  height: number
  material: MaterialDescriptor
  parentId: string
  name: string
}): SceneNode {
  return meshNode(
    {
      kind: 'ribbon',
      // A CLOSED Bézier rail: the curve through the marks is what rounds a corner off, and every
      // mark carries the pair of tangents an author drags to set the angle at it.
      path: bezierPathOf(band.points, true),
      width: band.width,
      height: band.height,
      segments: CURVE_SEGMENTS,
    },
    {
      transform: IDENTITY_TRANSFORM,
      material: band.material,
      parentId: band.parentId,
      name: band.name,
    },
  )
}

/** 🛑 None of it is felt: a car that clips the scenery is not where a lap is decided. */
function surroundings(): SceneNode[] {
  const grounds = groupNode(IDENTITY_TRANSFORM, 'Grounds')

  // ONE field, never the six bands it was: six planes drew six times to say what one says.
  const grass = fieldNode({
    at: { x: 0, y: 0.02, z: 0 },
    width: 340,
    depth: 340,
    material: grassSurface(),
    tilesPerMetre: 1 / GRASS_TILE,
    parentId: grounds.id,
    name: 'Grass',
  })

  // 🛑 Past the WIDEST radius of the loop: placed by eye it stood 6,00 m from the centre line —
  // the edge of the tarmac — and covered nineteen metres of a corner.
  const paddock = meshNode(
    { kind: 'box', width: 46, height: 7, depth: 18 },
    {
      transform: transformAt({ x: 0, y: 3.5, z: BASE_RADIUS * (1 + OVAL_PULL) + 58 }),
      material: dense(obstacleSurface(), PADDOCK_TILE),
      parentId: grounds.id,
      name: 'Paddock',
    },
  )

  const posts = Array.from({ length: 10 }, (_, index) => {
    const angle = (index / 10) * Math.PI * 2
    return meshNode(
      { kind: 'cylinder', radiusTop: 0.2, radiusBottom: 0.2, height: 4, segments: 8 },
      {
        transform: transformAt({ x: Math.sin(angle) * 162, y: 2, z: Math.cos(angle) * 162 }),
        material: markSurface(),
        parentId: grounds.id,
        name: `Post ${index + 1}`,
      },
    )
  })

  return [grounds, grass, paddock, ...posts]
}

/** The pair a track wears on both sides, swept along the same centre line. */
function sideBands(
  parentId: string,
  centre: readonly Vector3[],
  band: {
    offset: number
    width: number
    height: number
    material: MaterialDescriptor
    name: string
  },
): SceneNode[] {
  return [-1, 1].map(side =>
    ribbonNode({
      points: offsetRun(centre, side * band.offset, true),
      width: band.width,
      height: band.height,
      material: band.material,
      parentId,
      name: `${band.name} ${side < 0 ? 'Left' : 'Right'}`,
    }),
  )
}

export function circuitNodes(): SceneNode[] {
  const circuit = groupNode(IDENTITY_TRANSFORM, 'Circuit')
  const centre = circuitLine(0)

  // 🛑 Nearly SUNK: laid on the ground the car rests on, 57 % of each wheel sat inside the slab;
  // sunk to it exactly, the tarmac could not be seen at all. Three centimetres is both.
  const road = circuitLine(TARMAC_PROUD - TARMAC_DEPTH)

  const kerbs = sideBands(circuit.id, centre, {
    offset: KERB_INNER + KERB_THICKNESS / 2,
    width: KERB_THICKNESS,
    height: KERB_HEIGHT,
    material: dense(climbSurface(), KERB_TILE),
    name: 'Kerb',
  })

  const barriers = sideBands(circuit.id, centre, {
    offset: KERB_INNER + KERB_THICKNESS + BARRIER_CLEARANCE + BARRIER_THICKNESS / 2,
    width: BARRIER_THICKNESS,
    height: BARRIER_HEIGHT,
    material: dense(obstacleSurface(), BARRIER_TILE),
    name: 'Barrier',
  })

  return [
    circuit,
    ...surroundings(),
    {
      ...ribbonNode({
        points: road,
        width: TRACK_WIDTH,
        height: TARMAC_DEPTH,
        material: dense(groundSurface(), TARMAC_TILE),
        parentId: circuit.id,
        name: 'Tarmac',
      }),
      // Flat and 250 m across: one shadow texel covers metres there, and what it draws is moiré.
      receiveShadow: false,
      castShadow: false,
    },
    // 🛑 `trimesh`: a closed band is not convex, and its hull is the whole infield — a car would
    // meet a wall the moment it left the grid.
    ...[...kerbs, ...barriers].map(band => ({ ...band, components: fixedBody('trimesh') })),
    startLine(circuit.id),
  ]
}

/**
 * 🛑 ACROSS the track, never along it: built from a leg it took the leg's own length and became a
 * thirty-metre slab of chequer. Only the YAW comes from the run.
 */
function startLine(parentId: string): SceneNode {
  // Its OWN heading, six metres down the track: the grid's would lay it at an angle across a turn.
  const line = alongCurve(CAR_BEHIND + LINE_AHEAD)

  return meshNode(
    // 🛑 To the kerbs' inner edge, not the track's full width: a 12 m line buried 0,80 m of each
    // end inside a kerb, and the two top faces sit at the same 0,07 m — coplanar, so they fought.
    { kind: 'box', width: KERB_INNER * 2, height: LINE_DEPTH, depth: 1.5 },
    {
      transform: transformAt(
        { x: line.at.x, y: TARMAC_PROUD + LINE_DEPTH / 2, z: line.at.z },
        { x: 0, y: line.yaw, z: 0 },
      ),
      material: markSurface(),
      parentId,
      name: 'Start Line',
    },
  )
}
