import { describe, expect, it } from 'vitest'
import { forgetCheckerTextures, rememberCheckerTextures } from './checkerTextures'
import { COMPONENTS } from '@shared/domain/componentRegistry'
import { playgroundNodes } from './playgroundLevel'
import type { SceneNode } from './sceneState'

const meshes = (nodes: readonly SceneNode[]): SceneNode[] => nodes.filter(n => n.type === 'mesh')

type Box = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }

/**
 * Where a block stands and how far it reaches, which is the whole of what a level is made of.
 * Boxes alone, and untilted ones: a shape at an angle is not bounded by its own dimensions.
 */
function boxOf(node: SceneNode): Box | null {
  if (node.type !== 'mesh' || node.geometry.kind !== 'box') return null
  if (node.transform.rotation.x !== 0 || node.transform.rotation.z !== 0) return null

  const { width, height, depth } = node.geometry
  const { x, y, z } = node.transform.position
  return {
    x0: x - width / 2,
    x1: x + width / 2,
    y0: y - height / 2,
    y1: y + height / 2,
    z0: z - depth / 2,
    z1: z + depth / 2,
  }
}

const named = (nodes: readonly SceneNode[], name: string): SceneNode | undefined =>
  nodes.find(node => node.name === name)

/** Strictly, so two parts that merely touch at a face — which is what a joint IS — do not count. */
function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1 && a.z0 < b.z1 && b.z0 < a.z1
}

describe('the playground level', () => {
  it('walls the set on all four sides, so a walk meets something', () => {
    const walls = ['Wall North', 'Wall South', 'Wall East', 'Wall West'].map(name =>
      named(playgroundNodes(), name),
    )

    expect(walls.every(wall => wall !== undefined)).toBe(true)
  })

  /**
   * What sent this batch back, seen on screen: the four walls were each the full width and each
   * centred ON the edge, so every corner held two boxes in the same place — a double seam down
   * all four, and half of each wall hanging over the void outside.
   */
  it('joins the walls at the corners instead of overlapping them', () => {
    const walls = meshes(playgroundNodes())
      .filter(node => node.name.startsWith('Wall '))
      .map(boxOf)
      .filter(box => box !== null)

    expect(walls).toHaveLength(4)
    for (const [index, wall] of walls.entries()) {
      for (const other of walls.slice(index + 1)) expect(overlaps(wall, other)).toBe(false)
    }
  })

  /**
   * A `plane` is one-sided: seen from below, the floor of the level simply vanished and the set
   * hung in the air.
   *
   * THIN, though. A three-metre slab was tried, and an orbiting camera spends its time inside
   * that mass — from inside a solid one sees the back of its faces, which is to say straight
   * through the level. What Alban saw as walls disappearing was this.
   */
  it('builds the floor as a solid thin enough not to swallow the camera', () => {
    const floor = boxOf(named(playgroundNodes(), 'Floor North') as SceneNode)

    expect(floor).not.toBeNull()
    expect(floor && floor.y1 - floor.y0).toBeGreaterThan(0)
    expect(floor && floor.y1 - floor.y0).toBeLessThanOrEqual(0.5)
    expect(floor?.y1).toBeCloseTo(0)
  })

  /**
   * With a thin floor the court has no flanks to be walled by, so it gets its own four sides.
   * Without them one stands in the court and sees the sky through the ground beside it.
   */
  it('lines the court on all four sides, from its floor up to the walked one', () => {
    const walls = meshes(playgroundNodes())
      .filter(node => node.name.startsWith('Court Wall '))
      .map(boxOf)
      .filter(box => box !== null)

    expect(walls).toHaveLength(4)
    for (const wall of walls) expect(wall.y0).toBeLessThan(wall.y1)
  })

  it('leaves the court open, which is what a fall is tested against', () => {
    const overTheCourt = meshes(playgroundNodes())
      .map(boxOf)
      .filter(box => box !== null)
      .filter(box => box.x0 < 0 && 0 < box.x1 && box.z0 < 0 && 0 < box.z1 && box.y1 >= 0)

    // The plank crosses it and nothing else does: a floor slab over the centre would fill it.
    expect(overTheCourt).toHaveLength(1)
    expect(named(playgroundNodes(), 'Plank')).toBeDefined()
  })
})

describe('the playground level traversal', () => {
  it('sinks the court below the floor it is cut into', () => {
    const nodes = playgroundNodes()
    const court = boxOf(named(nodes, 'Court Floor') as SceneNode)
    const floor = boxOf(named(nodes, 'Floor North') as SceneNode)

    expect(court && floor && court.y1).toBeLessThan(floor?.y1 ?? 0)
  })

  /**
   * The stair is what makes the court a place one comes BACK from. Built the other way round it
   * climbed towards mid-court and ended at floor level over the drop, which no rule here saw.
   */
  it('climbs out of the court, by steps the character that ships with it can take', () => {
    const steps = meshes(playgroundNodes())
      .filter(node => node.name.startsWith('Court Step '))
      .map(boxOf)
      .filter(box => box !== null)
      .sort((a, b) => a.y1 - b.y1)
    // 🛑 Read off the controller rather than written here: the rise was once hand-set to 0,50,
    // which is EXACTLY this number and exactly its `snapDistance`. The controller's skin and a float
    // then put a step on either side of the limit — the walker climbed one, caught on the next
    // and was snapped back onto the one before. Seen on screen; no test of this file saw it.
    const climbed = Number(COMPONENTS.CharacterController.defaults.stepHeight)

    expect(steps.length).toBeGreaterThan(4)
    expect(steps.at(-1)?.y1).toBeCloseTo(0)
    for (const [index, step] of steps.slice(1).entries()) {
      const rise = step.y1 - (steps[index]?.y1 ?? 0)
      // A margin, not a bound: at the limit itself it is a coin toss from one step to the next.
      expect(rise).toBeLessThan(climbed * 0.8)
      expect(step.x0).toBeCloseTo(steps[index]?.x1 ?? 0)
    }
  })

  /**
   * The ramp was once pitched the other way: it climbed AWAY from its landing, its foot buried
   * under the floor and its top floating, connected to nothing.
   */
  it('lands the ramp on the terrace, and rests its foot on the floor', () => {
    const nodes = playgroundNodes()
    const ramp = named(nodes, 'Ramp')
    const terrace = boxOf(named(nodes, 'Terrace') as SceneNode)
    if (ramp?.type !== 'mesh' || ramp.geometry.kind !== 'box' || !terrace)
      throw new Error('no ramp')

    const rise = (ramp.geometry.depth / 2) * Math.sin(ramp.transform.rotation.x)

    // The high end is the one the terrace waits at — towards -Z — and it arrives at its height.
    expect(ramp.transform.position.y + rise).toBeCloseTo(terrace.y1, 1)
    expect(ramp.transform.position.y - rise).toBeCloseTo(0, 1)
  })

  it('raises the jump blocks one above the other, widening the gaps between them', () => {
    const blocks = meshes(playgroundNodes())
      .filter(node => node.name.startsWith('Jump Block '))
      .map(boxOf)
      .filter(box => box !== null)

    expect(blocks).toHaveLength(3)
    expect(blocks.map(block => block.y1)).toEqual(
      [...blocks.map(block => block.y1)].sort((a, b) => a - b),
    )

    const gaps = blocks.slice(1).map((block, index) => block.x0 - (blocks[index]?.x1 ?? 0))
    expect(gaps).toEqual([...gaps].sort((a, b) => a - b))
  })
})

describe('the playground level structure', () => {
  it('names every part, so the outliner is not a column of « Box »', () => {
    const names = playgroundNodes().map(node => node.name)

    expect(names.filter(name => name === 'Box' || name === 'Plane')).toEqual([])
    expect(new Set(names).size).toBe(names.length)
  })

  it('hangs every part under a group, so the outliner stays readable', () => {
    const nodes = playgroundNodes()
    const groups = nodes.filter(node => node.type === 'group')

    const roots = nodes.filter(node => node.parentId === null)

    expect(roots.map(root => root.name)).toEqual(['Ground', 'Enclosure', 'Course', 'Machines'])
    // The posts a patrol walks between are groups too, and they hang under `Machines` like the
    // rest — so « every group is a root » is no longer the shape of the claim.
    expect(roots.every(root => root.type === 'group')).toBe(true)
    expect(groups.length).toBeGreaterThan(roots.length)
  })

  /**
   * 🛑 A set one can climb, fall off and bump into — which is the whole claim it makes. The two
   * markers are NAMED rather than counted: a third part left hollow would otherwise slip through.
   */
  it('makes every part of it solid, but for the markers that must stop nobody', () => {
    const parts = playgroundNodes().filter(node => node.type !== 'group')
    const hollow = parts.filter(node => !node.components?.some(one => one.type === 'Collider'))

    expect(parts.length).toBeGreaterThan(20)
    expect(hollow.map(node => node.name).sort()).toEqual(['Beacon', 'Drone'])
  })

  /**
   * 🛑 The guard that stops a vehicle template from writing a lift of its own. Every moving part
   * is moved by a COMPONENT, and this says which — a machine driven by hand here would be the
   * same behaviour written twice, and the next template would write it a third time.
   */
  it('moves every machine by a component rather than by hand', () => {
    const byName = new Map(playgroundNodes().map(node => [node.name, node]))
    const travels = (name: string): string[] =>
      (byName.get(name)?.components ?? [])
        .map(one => one.type)
        .filter(type => type !== 'Collider' && type !== 'RigidBody')

    expect(travels('Lift')).toEqual(['Path'])
    expect(travels('Ferry')).toEqual(['Path'])
    expect(travels('Turnstile')).toEqual(['Spin'])
    expect(travels('Sentry')).toEqual(['Patrol'])
    expect(travels('Beacon')).toEqual(['Orbit', 'LookAt'])
    expect(travels('Drone')).toEqual(['Follow', 'LookAt'])
  })

  /**
   * 🛑 A name nobody wears is a machine that never moves, in silence: `Patrol` and the rest answer
   * nothing for it and simply skip the entity. Renaming a post is what this catches.
   */
  it('points every machine at a name the set carries', () => {
    const nodes = playgroundNodes()
    const names = new Set(nodes.map(node => node.name))
    const wanted = nodes.flatMap(node =>
      (node.components ?? []).flatMap(component =>
        component.type === 'Patrol'
          ? String(component.waypoints ?? '')
              .split(',')
              .map(said => said.trim())
          : [],
      ),
    )

    expect(wanted.length).toBeGreaterThan(0)
    expect(wanted.filter(name => !names.has(name))).toEqual([])
  })

  /** No shape is born bare — see `checkerTextures`. A grey set says nothing about its own scale. */
  it('dresses every part in a working texture', () => {
    rememberCheckerTextures([
      { id: 'checkerLarge', assetId: 'asset_large' },
      { id: 'checkerSmall', assetId: 'asset_small' },
      { id: 'gridLarge', assetId: 'asset_grid' },
      { id: 'gridSmall', assetId: 'asset_grid_small' },
    ])

    const bare = meshes(playgroundNodes()).filter(
      node => node.type === 'mesh' && node.material.map === null,
    )
    forgetCheckerTextures()

    expect(bare.map(node => node.name)).toEqual([])
  })

  it('builds a fresh level each time, sharing no id with the last', () => {
    const first = playgroundNodes().map(node => node.id)
    const second = playgroundNodes().map(node => node.id)

    expect(new Set([...first, ...second]).size).toBe(first.length + second.length)
  })
})
