// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { Vector3 } from '@shared/domain/scene'
import type { SceneNode } from './sceneState'
import { distanceToSpan, turnRadiusAt } from './cameraPath'
import { ribbonGeometry, sampledRun } from './ribbonGeometry'
import { CIRCUIT_START, CIRCUIT_START_YAW, circuitLine, circuitNodes } from './circuitLevel'

const named = (nodes: readonly SceneNode[], word: string): SceneNode[] =>
  nodes.filter(node => node.name.startsWith(word))

/** Which way the run heads at the sample nearest a point — a unit vector in the XZ plane. */
function nearestSpan(curve: readonly Vector3[], x: number, z: number): { x: number; z: number } {
  const at = curve.reduce(
    (best, point, index) =>
      Math.hypot(point.x - x, point.z - z) < Math.hypot(curve[best]!.x - x, curve[best]!.z - z)
        ? index
        : best,
    0,
  )
  const here = curve[at]!
  const next = curve[(at + 1) % curve.length]!
  const span = Math.hypot(next.x - here.x, next.z - here.z)
  return { x: (next.x - here.x) / span, z: (next.z - here.z) / span }
}

/** Samples spanning eight metres — a car's length, so one point cannot flatter a corner. */
function carLengths(curve: readonly Vector3[]): number {
  const lap = curve.reduce(
    (total, point, at) =>
      total +
      Math.hypot(
        curve[(at + 1) % curve.length]!.x - point.x,
        curve[(at + 1) % curve.length]!.z - point.z,
      ),
    0,
  )
  return Math.max(2, Math.round((curve.length * 8) / lap))
}

const bandOf = (nodes: readonly SceneNode[], name: string) => {
  const band = nodes.find(node => node.name === name)
  return band?.type === 'mesh' && band.geometry.kind === 'ribbon' ? band.geometry : null
}

/** The rail a band was swept along — where a track's geometry is written. */
const runOf = (nodes: readonly SceneNode[], name: string): readonly Vector3[] =>
  bandOf(nodes, name)?.path.points ?? []

/** How tall a band stands — what tells a strip a car crosses from a wall that stops it. */
const heightOf = (nodes: readonly SceneNode[], name: string): number | null =>
  bandOf(nodes, name)?.height ?? null

/**
 * 🛑 How far a band's own SURFACE reaches from the centre line, nearest and furthest — read off the
 * vertices three is given. Control points prove nothing: a band offset by its points bows outward
 * between them, which is how 67 cm of grass opened between a tarmac and a kerb laid edge to edge.
 */

function reachOf(nodes: readonly SceneNode[], name: string, centre: readonly Vector3[]) {
  const band = bandOf(nodes, name)
  if (!band) return null
  const corners = ribbonGeometry(band).getAttribute('position')
  let nearest = Infinity
  let furthest = 0

  for (let at = 0; at < corners.count; at += 1) {
    // To the sampled POINTS: the run is dense enough that the chord error stays under a
    // centimetre, and `distanceToSpan` answers the span's own length on a run this fine.
    const span = distanceToRun(centre, corners.getX(at), corners.getZ(at))
    nearest = Math.min(nearest, span)
    furthest = Math.max(furthest, span)
  }

  return { nearest, furthest }
}

/** How far a point sits from a closed run — the nearest of its spans. */
function distanceToRun(run: readonly Vector3[], x: number, z: number): number {
  const point = { x, y: 0, z }
  return Math.min(
    ...run.map((from, index) => distanceToSpan(point, from, run[(index + 1) % run.length]!)),
  )
}

const nodes = circuitNodes()
const tarmac = runOf(nodes, 'Tarmac')
const centre = sampledRun(bandOf(nodes, 'Tarmac')!.path, bandOf(nodes, 'Tarmac')!.segments)

describe('the circuit a car opens on', () => {
  /** A car put beside its own track spends the first corner climbing back onto it. */
  it('puts the car down on the tarmac rather than beside it', () => {
    // Half the track width: dead centre is 0, and the kerbs start at 6.
    expect(distanceToRun(tarmac, CIRCUIT_START.x, CIRCUIT_START.z)).toBeLessThan(6)
  })

  /**
   * 🛑 Put down with no turn at all, the car sat ACROSS its own straight with the line off to one
   * side. It faces down the track, and it waits just short of the line rather than on it.
   */
  it('lines the car up behind the start line, facing down the track', () => {
    const line = nodes.find(node => node.name === 'Start Line')!
    const ahead =
      (line.transform.position.x - CIRCUIT_START.x) * Math.sin(CIRCUIT_START_YAW) +
      (line.transform.position.z - CIRCUIT_START.z) * Math.cos(CIRCUIT_START_YAW)

    // Ahead of the car, and within a couple of car lengths of it.
    expect(ahead).toBeGreaterThan(0)
    expect(ahead).toBeLessThan(8)
  })

  /**
   * 🛑 A grid belongs on a STRAIGHT: laid at the first anchor it fell in a turn, where a line
   * drawn square across the track runs out of tarmac on the outside of the bend.
   */
  it('puts the grid on the straightest stretch of the loop', () => {
    // Over a car's length either side, so a single sampled point cannot flatter a corner.
    const radii = centre.map((_, at) => turnRadiusAt(centre, at, carLengths(centre)))

    const away = (point: Vector3): number =>
      Math.hypot(point.x - CIRCUIT_START.x, point.z - CIRCUIT_START.z)
    const here =
      radii[centre.reduce((best, point, at) => (away(point) < away(centre[best]!) ? at : best), 0)]!

    // In the flattest tenth of the loop — a grid in a turn sits far below that.
    const flattest = [...radii].sort((one, other) => other - one)[Math.floor(radii.length / 10)]!
    expect(here).toBeGreaterThanOrEqual(flattest)
  })

  /**
   * 🛑 ACROSS the track, and the whole way across: sharing the GRID's heading laid it at an angle
   * six metres further on, hanging over one kerb and stopping short of the other.
   */
  it('lays the start line square across the track, inside both kerbs', () => {
    const line = nodes.find(node => node.name === 'Start Line')!
    if (line.type !== 'mesh' || line.geometry.kind !== 'box') throw new Error('no start line')
    const yaw = line.transform.rotation.y
    const half = { x: line.geometry.width / 2, z: line.geometry.depth / 2 }

    const corners = [-1, 1].flatMap(side =>
      [-1, 1].map(end => ({
        x: line.transform.position.x + side * half.x * Math.cos(yaw) + end * half.z * Math.sin(yaw),
        z: line.transform.position.z - side * half.x * Math.sin(yaw) + end * half.z * Math.cos(yaw),
      })),
    )

    // 🛑 ACROSS: turned along the track instead, every corner still sat near the centre line, so a
    // bound on their distance proves nothing. The line's own width runs at a right angle to the run.
    const ahead = nearestSpan(centre, line.transform.position.x, line.transform.position.z)
    expect(Math.abs(Math.cos(yaw) * ahead.x - Math.sin(yaw) * ahead.z)).toBeLessThan(0.05)

    for (const corner of corners) {
      expect(distanceToRun(centre, corner.x, corner.z)).toBeLessThan(
        bandOf(nodes, 'Tarmac')!.width / 2,
      )
    }
  })

  // 🛑 A car put down INSIDE a fixed body is catapulted by the first step — 1500 kg resolving an
  // interpenetration, with no key ever pressed.
  it('starts the car clear of every body it could be caught inside', () => {
    const felt = nodes
      .filter(node => (node.components ?? []).some(one => one.type === 'RigidBody'))
      .map(node => node.name)

    // 🛑 Against the SURFACE, not the anchors: a kerb's control points run a metre outside the band
    // they sweep. A felt body this cannot measure fails the case rather than passing it in silence.
    const touched = felt.filter(name => {
      const reach = reachOf(nodes, name, centre)
      if (!reach) return true
      // Half a car is 0,9 m: the spawn must clear the nearest surface of every solid by more.
      return reach.nearest < distanceToRun(centre, CIRCUIT_START.x, CIRCUIT_START.z) + 0.9
    })

    expect(touched).toEqual([])
  })

  // 🛑 A second floor laid over the scene's own ground is a lip the front wheels catch at every
  // joint, so only the kerbs are felt.
  it('makes the kerbs solid and leaves the tarmac decor', () => {
    const felt = (node: SceneNode): boolean =>
      (node.components ?? []).some(one => one.type === 'RigidBody')

    expect(named(nodes, 'Kerb').map(node => node.name)).toEqual(['Kerb Left', 'Kerb Right'])
    expect(named(nodes, 'Kerb').every(felt)).toBe(true)
    expect(named(nodes, 'Tarmac').some(felt)).toBe(false)
  })

  /**
   * 🛑 A closed band is not convex, and its hull is the whole infield: felt as one, a car would
   * meet a wall the moment it left the grid.
   */
  it('has the kerbs felt as the bands they are', () => {
    const fidelities = named(nodes, 'Kerb').map(
      node => (node.components ?? []).find(one => one.type === 'Collider')?.fidelity,
    )

    expect(fidelities).toEqual(['trimesh', 'trimesh'])
  })

  // A barrier a car drives through is scenery. Felt as the band it is, for the reason the kerbs are.
  it('has both barriers felt as the bands they are', () => {
    const fidelities = named(nodes, 'Barrier').map(
      node => (node.components ?? []).find(one => one.type === 'Collider')?.fidelity,
    )

    expect(fidelities).toEqual(['trimesh', 'trimesh'])
  })
})

describe('the circuit layout', () => {
  /**
   * 🛑 One band a piece and no boolean: it was twenty-four slabs and forty-eight kerb blocks,
   * welded — which kept every corner standing.
   */
  it('draws the track as one band a piece, and nothing carved', () => {
    const drawn = nodes.filter(node => node.type === 'mesh' || node.type === 'carved')
    const bands = drawn.filter(node => node.type === 'mesh' && node.geometry.kind === 'ribbon')

    expect(bands.map(node => node.name).sort()).toEqual([
      'Barrier Left',
      'Barrier Right',
      'Kerb Left',
      'Kerb Right',
      'Tarmac',
    ])
    expect(drawn.filter(node => node.type === 'carved')).toEqual([])
  })

  /**
   * 🛑 The one the lot exists for, and it reads the SURFACES: laid edge to edge, a kerb bowed
   * outward between its own anchors and opened up to 67 cm of grass down the straight.
   */
  it('leaves no grass between the tarmac and either kerb, all the way round', () => {
    const road = bandOf(nodes, 'Tarmac')!
    const kerbs = ['Kerb Left', 'Kerb Right'].map(name =>
      sampledRun(bandOf(nodes, name)!.path, bandOf(nodes, name)!.segments),
    )
    const corners = ribbonGeometry(road).getAttribute('position')
    let worst = 0

    for (let at = 0; at < corners.count; at += 1) {
      const x = corners.getX(at)
      const z = corners.getZ(at)
      // The tarmac's own EDGE, which is what a kerb has to cover: its middle proves nothing.
      if (distanceToRun(centre, x, z) < road.width / 2 - 0.01) continue
      worst = Math.max(worst, Math.min(...kerbs.map(kerb => distanceToRun(kerb, x, z))))
    }

    // Inside the nearer kerb's own band — measured at 0,47 m against a half-width of 1,00.
    expect(worst).toBeLessThan(bandOf(nodes, 'Kerb Left')!.width / 2)
  })

  /**
   * 🛑 A corner is only a corner while a car can take it: the loop turned at a 10 m radius for a
   * track 12 m WIDE, and a barrier held 10,3 m out folded through itself.
   */
  it('never turns tighter than the track is wide', () => {
    const radii = centre.map((_, at) => turnRadiusAt(centre, at, 1))

    // Three times the track's own width, which is what makes the tightest turn worth taking.
    expect(Math.min(...radii)).toBeGreaterThan(36)
  })

  // A wheel goes over it and the throttle stays down — the why is written on `KERB_HEIGHT`.
  it('makes the kerbs a strip a car crosses rather than a wall', () => {
    for (const name of ['Kerb Left', 'Kerb Right']) {
      expect(heightOf(nodes, name)).toBeLessThanOrEqual(0.1)
    }
  })

  /** What stops a car, and it is NOT the kerb: held back in the grass, so leaving the track
   * costs a run through it before anything is met. */
  it('holds a barrier back in the grass, well clear of the kerbs', () => {
    const kerb = reachOf(nodes, 'Kerb Left', centre)!

    for (const side of ['Left', 'Right']) {
      // Two metres of grass at the very least, past the furthest the kerb's own surface reaches.
      expect(reachOf(nodes, `Barrier ${side}`, centre)!.nearest).toBeGreaterThan(kerb.furthest + 2)
      expect(heightOf(nodes, `Barrier ${side}`)).toBeGreaterThanOrEqual(0.8)
    }
  })

  // 🛑 The scenery is DECOR: a hedge is not where a lap is decided, so only the two bands that
  // border the track are felt at all.
  it('leaves everything around the track free of collision', () => {
    const felt = nodes.filter(
      node =>
        !node.name.startsWith('Kerb') &&
        !node.name.startsWith('Barrier') &&
        (node.components ?? []).some(one => one.type === 'RigidBody'),
    )

    expect(felt.map(node => node.name)).toEqual([])
  })

  // 🛑 The paddock stood 6,00 m from the centre line — the edge of the tarmac — and covered
  // nineteen metres of corner.
  it('keeps every piece of scenery off the tarmac', () => {
    const trespassing = nodes.filter(node => {
      // Volumes only: the grass is the ground the whole circuit stands on, and a plane laid under
      // the tarmac is not scenery standing on it.
      if (node.type !== 'mesh') return false
      if (node.geometry.kind === 'ribbon' || node.geometry.kind === 'plane') return false
      if (node.name === 'Start Line') return false
      const shape = node.geometry
      const reach =
        shape.kind === 'box'
          ? Math.max(shape.width, shape.depth) / 2
          : shape.kind === 'cylinder'
            ? shape.radiusBottom
            : Math.max(...Object.values(shape).filter(one => typeof one === 'number')) / 2
      return distanceToRun(tarmac, node.transform.position.x, node.transform.position.z) < 6 + reach
    })

    expect(trespassing.map(node => node.name)).toEqual([])
  })

  /**
   * 🛑 The test that was missing, and it cost a whole track: a loop whose legs CROSS puts its
   * kerbs across the tarmac they border. Neighbours are skipped — they touch by design.
   */
  it('never crosses itself', () => {
    const run = circuitLine(0)
    const crossings: string[] = []

    for (let one = 0; one < run.length; one++) {
      for (let other = one + 2; other < run.length; other++) {
        if (one === 0 && other === run.length - 1) continue
        const a = { from: run[one]!, to: run[(one + 1) % run.length]! }
        const b = { from: run[other]!, to: run[(other + 1) % run.length]! }
        if (crosses(a, b)) crossings.push(`${one + 1}x${other + 1}`)
      }
    }

    expect(crossings).toEqual([])
  })
})

type Segment = { from: Vector3; to: Vector3 }

/** Whether two segments meet anywhere but at their ends — the sign of the cross products. */
function crosses(one: Segment, other: Segment): boolean {
  const side = (p: Vector3, q: Vector3, r: Vector3): number =>
    Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x))

  return (
    side(one.from, one.to, other.from) !== side(one.from, one.to, other.to) &&
    side(other.from, other.to, one.from) !== side(other.from, other.to, one.to)
  )
}
